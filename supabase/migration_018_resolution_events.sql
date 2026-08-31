-- ============================================================
-- Migration 018 — Resolution events (Rapid Response Roll data model)
--
-- Supports DEFERRED #24: Rapid Response Roll needs a structured record of
-- verified resolutions (not just "authority marked closed"). Verification
-- sources:
--   1. Community re-photo (nearby reporter confirms fix in-place at same GPS)
--   2. Authority ticket status (Open311 / SeeClickFix upstream state change)
--   3. Both (highest confidence)
--
-- A resolution is Rapid-Response-Roll eligible only when:
--   - resolution_source != 'authority_self_attestation_only'
--   - reopen_check_scheduled_at has passed without a new report reopening
--     the underlying cluster at the same GPS within 180 days
--   - the severity captured at escalation time was non-trivial
--
-- Companion `departments` table maps municipal DPW → crew for per-crew
-- attribution on the Rapid Response Roll. Populated per pilot city.
--
-- Safe to run multiple times (idempotent CREATE IF NOT EXISTS).
-- ============================================================

BEGIN;

-- ── departments (per-city crew mapping) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_id UUID NOT NULL REFERENCES public.authorities(id) ON DELETE CASCADE,
  department_name TEXT NOT NULL,            -- "Cambridge DPW"
  crew_name TEXT,                            -- "East Cambridge crew" — nullable
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (authority_id, department_name, crew_name)
);

CREATE INDEX IF NOT EXISTS idx_departments_authority_id ON public.departments(authority_id);
CREATE INDEX IF NOT EXISTS idx_departments_is_active ON public.departments(is_active) WHERE is_active = TRUE;

-- ── resolution_events ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'resolution_source_enum') THEN
    CREATE TYPE resolution_source_enum AS ENUM (
      'community_repeat_photo',
      'authority_ticket_status',
      'both',
      'authority_self_attestation_only'   -- Recorded but NOT Rapid Response Roll eligible
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.resolution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID REFERENCES public.clusters(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE,
  authority_id UUID REFERENCES public.authorities(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  resolution_source resolution_source_enum NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_by_reporter_ids UUID[] DEFAULT '{}',        -- User IDs that submitted re-photo confirmation
  severity_at_escalation TEXT,                          -- Snapshot of highest severity in cluster at escalation
  reopen_check_scheduled_at TIMESTAMPTZ NOT NULL,       -- 180 days from resolved_at
  resolution_durable BOOLEAN,                           -- NULL until reopen_check runs; TRUE if no reopen
  reopened_at TIMESTAMPTZ,                              -- Set if a new report reopens the same GPS cluster within window
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT resolution_events_target_check CHECK (cluster_id IS NOT NULL OR report_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_resolution_events_cluster_id ON public.resolution_events(cluster_id);
CREATE INDEX IF NOT EXISTS idx_resolution_events_department_id ON public.resolution_events(department_id);
CREATE INDEX IF NOT EXISTS idx_resolution_events_resolved_at ON public.resolution_events(resolved_at DESC);
CREATE INDEX IF NOT EXISTS idx_resolution_events_reopen_check ON public.resolution_events(reopen_check_scheduled_at)
  WHERE resolution_durable IS NULL;

-- ── RLS: reads are public (aggregations shown on /rapid-response); writes require service role. ──
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resolution_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS departments_public_read ON public.departments;
CREATE POLICY departments_public_read ON public.departments FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS resolution_events_public_read ON public.resolution_events;
CREATE POLICY resolution_events_public_read ON public.resolution_events FOR SELECT USING (TRUE);

-- Writes are service-role only (default RLS behavior when no INSERT policy exists).

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────
-- After running:
--   SELECT COUNT(*) FROM public.departments;         -- 0 until pilot cities onboard
--   SELECT COUNT(*) FROM public.resolution_events;   -- 0 until first verified resolution fires
--   \d public.resolution_events                       -- confirm all columns + FKs present
