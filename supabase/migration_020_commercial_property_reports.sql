-- ============================================================
-- Migration 020 — Commercial-property report subtype
--
-- Supports DEFERRED #31: adds `report_subject` distinguishing public
-- infrastructure reports (existing behavior) from commercial-property
-- reports (new, subject to strict guardrails per /business-property).
--
-- Also adds:
--   - commercial_property_context columns on reports
--   - commercial_properties: aggregated public attributions (only populated
--     after right-of-reply pipeline completes per DEFERRED #31 remaining work)
--   - commercial_chains: brand registry for franchisor compliance contacts
--   - right_of_reply: entries tracking pre-notification + response windows
--     (shared with DEFERRED #27 press summaries)
--
-- Existing reports default to 'public_infrastructure' — no data migration.
--
-- Safe to run multiple times.
-- ============================================================

BEGIN;

-- ── report subject enum ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_subject_enum') THEN
    CREATE TYPE report_subject_enum AS ENUM ('public_infrastructure', 'commercial_property');
  END IF;
END $$;

-- ── extend reports ──────────────────────────────────────────────────────
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS report_subject report_subject_enum NOT NULL DEFAULT 'public_infrastructure',
  ADD COLUMN IF NOT EXISTS commercial_business_name TEXT,
  ADD COLUMN IF NOT EXISTS commercial_business_address TEXT,
  ADD COLUMN IF NOT EXISTS commercial_chain_identifier TEXT,
  ADD COLUMN IF NOT EXISTS commercial_public_view_confirmed BOOLEAN,
  ADD COLUMN IF NOT EXISTS commercial_reporter_attestation BOOLEAN;

-- When report_subject = 'commercial_property', all commercial_* fields are required.
ALTER TABLE public.reports
  ADD CONSTRAINT IF NOT EXISTS reports_commercial_completeness_check CHECK (
    (report_subject = 'public_infrastructure')
    OR (
      report_subject = 'commercial_property'
      AND commercial_business_name IS NOT NULL
      AND commercial_business_address IS NOT NULL
      AND commercial_public_view_confirmed = TRUE
      AND commercial_reporter_attestation = TRUE
    )
  );

CREATE INDEX IF NOT EXISTS idx_reports_commercial_address
  ON public.reports (commercial_business_address)
  WHERE report_subject = 'commercial_property';
CREATE INDEX IF NOT EXISTS idx_reports_commercial_chain
  ON public.reports (commercial_chain_identifier)
  WHERE commercial_chain_identifier IS NOT NULL;

-- ── commercial_chains (brand registry) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commercial_chains (
  chain_id TEXT PRIMARY KEY,
  brand_name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  franchisor_compliance_email TEXT,
  franchisor_compliance_url TEXT,
  franchisor_mailing_address TEXT,
  notes TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending-review'
    CHECK (verification_status IN ('verified', 'pending-review', 'stale', 'draft')),
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commercial_chains_brand_name
  ON public.commercial_chains (LOWER(brand_name));

-- ── commercial_properties (aggregated public attributions) ──────────────
CREATE TABLE IF NOT EXISTS public.commercial_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_address_full TEXT NOT NULL,
  business_name TEXT NOT NULL,
  chain_identifier TEXT REFERENCES public.commercial_chains(chain_id) ON DELETE SET NULL,
  aggregation_status TEXT NOT NULL DEFAULT 'pending-single'
    CHECK (aggregation_status IN (
      'pending-single',
      'accumulating',
      'threshold-reached',
      'pre-notification-sent',
      'published',
      'delisted-on-remediation',
      'withdrawn'
    )),
  underlying_report_ids UUID[] NOT NULL DEFAULT '{}',
  distinct_reporter_count INT NOT NULL DEFAULT 0,
  first_report_at TIMESTAMPTZ NOT NULL,
  latest_report_at TIMESTAMPTZ NOT NULL,
  right_of_reply_id UUID,                                 -- FK set below after right_of_reply table exists
  published_at TIMESTAMPTZ,
  delisted_at TIMESTAMPTZ,
  delisted_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_address_full)
);

CREATE INDEX IF NOT EXISTS idx_commercial_properties_status
  ON public.commercial_properties (aggregation_status);
CREATE INDEX IF NOT EXISTS idx_commercial_properties_chain
  ON public.commercial_properties (chain_identifier)
  WHERE chain_identifier IS NOT NULL;

-- ── right_of_reply (shared #27 press summaries + #31 commercial) ────────
CREATE TABLE IF NOT EXISTS public.right_of_reply (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL CHECK (subject IN ('press-summary', 'commercial-property', 'commercial-chain')),
  target_identifier TEXT NOT NULL,
  authority_contact_name TEXT NOT NULL,
  authority_contact_role TEXT,
  authority_contact_email TEXT,
  authority_contact_web_form TEXT,
  authority_contact_address TEXT,
  status TEXT NOT NULL DEFAULT 'pending-notification'
    CHECK (status IN (
      'pending-notification',
      'notification-sent',
      'response-received',
      'window-expired',
      'remediated',
      'published',
      'withdrawn'
    )),
  window_days INT NOT NULL,
  notification_sent_at TIMESTAMPTZ,
  response_window_deadline_at TIMESTAMPTZ,
  response_received_at TIMESTAMPTZ,
  response_content TEXT,
  published_at TIMESTAMPTZ,
  suppressed_reason TEXT CHECK (suppressed_reason IN ('remediated', 'withdrawn', 'insufficient-evidence')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_right_of_reply_status
  ON public.right_of_reply (status);
CREATE INDEX IF NOT EXISTS idx_right_of_reply_deadline
  ON public.right_of_reply (response_window_deadline_at)
  WHERE response_window_deadline_at IS NOT NULL AND status IN ('notification-sent', 'response-received');

-- Backfill FK from commercial_properties to right_of_reply.
ALTER TABLE public.commercial_properties
  ADD CONSTRAINT IF NOT EXISTS commercial_properties_right_of_reply_fk
    FOREIGN KEY (right_of_reply_id) REFERENCES public.right_of_reply(id) ON DELETE SET NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.commercial_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.right_of_reply ENABLE ROW LEVEL SECURITY;

-- Chain registry is public read (referenced from published aggregations).
DROP POLICY IF EXISTS commercial_chains_public_read ON public.commercial_chains;
CREATE POLICY commercial_chains_public_read ON public.commercial_chains FOR SELECT USING (TRUE);

-- Commercial property aggregations: only 'published' rows are public.
DROP POLICY IF EXISTS commercial_properties_published_only ON public.commercial_properties;
CREATE POLICY commercial_properties_published_only ON public.commercial_properties
  FOR SELECT USING (aggregation_status = 'published');

-- Right-of-reply entries: only 'published' or 'window-expired' visible publicly
-- (so residents can see when a pre-notification window has run its course
-- without leaking pre-notification content).
DROP POLICY IF EXISTS right_of_reply_public_partial ON public.right_of_reply;
CREATE POLICY right_of_reply_public_partial ON public.right_of_reply
  FOR SELECT USING (status IN ('published', 'window-expired', 'remediated'));

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────
--   SELECT COUNT(*) FROM public.reports WHERE report_subject = 'commercial_property';   -- 0 initially
--   SELECT COUNT(*) FROM public.commercial_chains;                                       -- 0 until seeded
--   SELECT COUNT(*) FROM public.right_of_reply;                                          -- 0 initially
--   \d public.right_of_reply                                                              -- confirm all columns
