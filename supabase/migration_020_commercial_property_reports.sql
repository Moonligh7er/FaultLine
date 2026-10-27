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
-- Also carries the other two extended report contexts that had no
-- migration of their own (DEFERRED #26 / #29):
--   - digital_* columns on reports (digital-infrastructure reports)
--   - insider context: written by the client as reports.insider_context
--     (JSONB), moved by a BEFORE INSERT trigger into the private
--     report_insider_context table. The reports column is always NULL
--     (CHECK enforced), so insider details never pass through the public
--     reports SELECT policy.
--
-- Client write path: src/services/reportExtensions.ts. Ordinary reports
-- send none of the new columns and are unaffected; the migration 008
-- INSERT policy applies unchanged, so anonymous inserts keep working.
--
-- Safe to run multiple times.
--
-- Review fixes (2026-10-26, before first apply):
--   * ADD CONSTRAINT IF NOT EXISTS is not valid Postgres syntax (two
--     places); now guarded with pg_constraint lookups.
--   * Commercial rows were world-readable: reports had a blanket
--     SELECT USING (true) policy, contradicting "individual reports never
--     publish". Public SELECT now excludes commercial_property rows except
--     to their signed-in author. (The app inserts commercial reports
--     without RETURNING so anonymous submitters aren't blocked.)
--   * Commercial reports were fed into the public cluster pipeline by the
--     auto-cluster trigger (public report_clusters rows + escalation
--     emails). The trigger now skips them.
--   * Completeness check rejects blank business name / address.
--   * Client roles get read-only (or no) grants on the new tables.
--   * Enum type schema-qualified; PostgREST schema cache reloaded.
-- ============================================================

BEGIN;

-- ── report subject enum ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'report_subject_enum' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.report_subject_enum AS ENUM ('public_infrastructure', 'commercial_property');
  END IF;
END $$;

-- ── extend reports ──────────────────────────────────────────────────────
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS report_subject public.report_subject_enum NOT NULL DEFAULT 'public_infrastructure',
  ADD COLUMN IF NOT EXISTS commercial_business_name TEXT,
  ADD COLUMN IF NOT EXISTS commercial_business_address TEXT,
  ADD COLUMN IF NOT EXISTS commercial_chain_identifier TEXT,
  ADD COLUMN IF NOT EXISTS commercial_public_view_confirmed BOOLEAN,
  ADD COLUMN IF NOT EXISTS commercial_reporter_attestation BOOLEAN;

-- When report_subject = 'commercial_property', all commercial_* fields are required.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reports_commercial_completeness_check'
      AND conrelid = 'public.reports'::regclass
  ) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_commercial_completeness_check CHECK (
        (report_subject = 'public_infrastructure')
        OR (
          report_subject = 'commercial_property'
          AND btrim(coalesce(commercial_business_name, '')) <> ''
          AND btrim(coalesce(commercial_business_address, '')) <> ''
          AND commercial_public_view_confirmed = TRUE
          AND commercial_reporter_attestation = TRUE
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reports_commercial_address
  ON public.reports (commercial_business_address)
  WHERE report_subject = 'commercial_property';
CREATE INDEX IF NOT EXISTS idx_reports_commercial_chain
  ON public.reports (commercial_chain_identifier)
  WHERE commercial_chain_identifier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_report_subject
  ON public.reports (report_subject)
  WHERE report_subject <> 'public_infrastructure';

-- ── digital-infrastructure context (DEFERRED #26) ───────────────────────
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS digital_target_url TEXT,
  ADD COLUMN IF NOT EXISTS digital_assistive_tech TEXT,
  ADD COLUMN IF NOT EXISTS digital_browser TEXT,
  ADD COLUMN IF NOT EXISTS digital_platform TEXT,
  ADD COLUMN IF NOT EXISTS digital_wcag_criterion TEXT,
  ADD COLUMN IF NOT EXISTS digital_snapshot_ref TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reports_digital_target_url_check'
      AND conrelid = 'public.reports'::regclass
  ) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_digital_target_url_check CHECK (
        digital_target_url IS NULL
        OR (digital_target_url ~* '^https?://' AND length(digital_target_url) <= 2048)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reports_digital_target_url
  ON public.reports (digital_target_url)
  WHERE digital_target_url IS NOT NULL;

-- ── insider context (DEFERRED #29): private side table ──────────────────
-- Public employees reporting from inside. Never publicly readable: RLS on,
-- no policies, no client grants. Only the service role (letter generation,
-- verification-window job) reads it.
CREATE TABLE IF NOT EXISTS public.report_insider_context (
  -- Deferred FK: the BEFORE INSERT trigger on reports writes this row
  -- before the report row exists; the check runs at commit.
  report_id UUID PRIMARY KEY
    REFERENCES public.reports(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  insider_category TEXT NOT NULL CHECK (insider_category IN (
    'public_works', 'facilities', 'it', 'transit', 'public_housing',
    'schools', 'code_enforcement', 'other'
  )),
  observed_duration_days INT CHECK (observed_duration_days IS NULL OR observed_duration_days BETWEEN 0 AND 36500),
  prior_internal_report_ref TEXT CHECK (prior_internal_report_ref IS NULL OR length(prior_internal_report_ref) <= 2000),
  documentary_reference TEXT CHECK (documentary_reference IS NULL OR length(documentary_reference) <= 2000),
  -- Insider-only reports get 180 days to attract community confirmation
  -- (src/services/insiderReports.ts). Set server-side, not by the client.
  verification_deadline_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '180 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_insider_context_deadline
  ON public.report_insider_context (verification_deadline_at);

ALTER TABLE public.report_insider_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.report_insider_context FROM anon, authenticated;

-- Write-only inbox column on reports. Always NULL once stored.
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS insider_context JSONB;

CREATE OR REPLACE FUNCTION public.capture_report_insider_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.insider_context IS NOT NULL THEN
    IF jsonb_typeof(NEW.insider_context) <> 'object' THEN
      RAISE EXCEPTION 'insider_context must be a JSON object';
    END IF;
    INSERT INTO public.report_insider_context (
      report_id, insider_category, observed_duration_days,
      prior_internal_report_ref, documentary_reference
    ) VALUES (
      NEW.id,
      NEW.insider_context->>'insider_category',
      (NEW.insider_context->>'observed_duration_days')::integer,
      NULLIF(btrim(NEW.insider_context->>'prior_internal_report_ref'), ''),
      NULLIF(btrim(NEW.insider_context->>'documentary_reference'), '')
    );
    NEW.insider_context := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.capture_report_insider_context() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS capture_insider_context_before_insert ON public.reports;
CREATE TRIGGER capture_insider_context_before_insert
  BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.capture_report_insider_context();

-- Fail closed: if the trigger is ever dropped, or someone UPDATEs the
-- column, the write is rejected instead of landing in a public row.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reports_insider_context_private_check'
      AND conrelid = 'public.reports'::regclass
  ) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_insider_context_private_check CHECK (insider_context IS NULL);
  END IF;
END $$;

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
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commercial_properties_right_of_reply_fk'
      AND conrelid = 'public.commercial_properties'::regclass
  ) THEN
    ALTER TABLE public.commercial_properties
      ADD CONSTRAINT commercial_properties_right_of_reply_fk
        FOREIGN KEY (right_of_reply_id) REFERENCES public.right_of_reply(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_commercial_properties_right_of_reply_id
  ON public.commercial_properties (right_of_reply_id)
  WHERE right_of_reply_id IS NOT NULL;

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
-- without leaking pre-notification content). 'remediated' stays private: a
-- business that fixed the issue after notice shouldn't be publicly listed.
DROP POLICY IF EXISTS right_of_reply_public_partial ON public.right_of_reply;
CREATE POLICY right_of_reply_public_partial ON public.right_of_reply
  FOR SELECT USING (status IN ('published', 'window-expired'));

-- All three tables are written by the service role only. Strip the write
-- grants Supabase's default privileges give client roles (TRUNCATE is not
-- covered by RLS).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.commercial_chains, public.commercial_properties, public.right_of_reply
  FROM anon, authenticated;

-- ── reports: hide individual commercial reports from public reads ───────
-- schema.sql created "Reports are viewable by everyone" (USING true).
-- Replace it with a policy that keeps every public-infrastructure row
-- public (no change for existing data) and shows a commercial row only to
-- its signed-in author. Service role (aggregation pipeline) bypasses RLS.
DROP POLICY IF EXISTS "Reports are viewable by everyone" ON public.reports;
DROP POLICY IF EXISTS reports_public_read_non_commercial ON public.reports;
CREATE POLICY reports_public_read_non_commercial ON public.reports
  FOR SELECT
  USING (
    report_subject = 'public_infrastructure'
    OR (user_id IS NOT NULL AND user_id = (SELECT auth.uid()))
  );

-- Permissive policies are OR'd: any other SELECT policy left on reports
-- (e.g. a renamed copy of the USING (true) one) would re-expose commercial
-- rows. Abort rather than apply a migration that silently doesn't protect.
DO $$
DECLARE
  leftover TEXT;
BEGIN
  SELECT string_agg(policyname, ', ') INTO leftover
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'reports'
    AND cmd IN ('SELECT', 'ALL')
    AND permissive = 'PERMISSIVE'
    AND policyname <> 'reports_public_read_non_commercial';
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'public.reports has other permissive SELECT policies (%) that would still expose commercial reports. Drop or narrow them, then re-run migration 020.', leftover;
  END IF;
END $$;

-- ── auto-cluster trigger: keep commercial reports out of public clusters ─
-- Same body as clustering.sql plus the commercial guard. Restates migration
-- 021's SECURITY DEFINER + search_path, which CREATE OR REPLACE would
-- otherwise reset.
CREATE OR REPLACE FUNCTION public.auto_cluster_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.report_subject = 'commercial_property' THEN
    RETURN NEW;
  END IF;
  PERFORM assign_report_to_cluster(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_cluster_on_insert() FROM anon, authenticated, public;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Verification ─────────────────────────────────────────────────────────
--   SELECT COUNT(*) FROM public.reports WHERE report_subject = 'commercial_property';   -- 0 initially
--   SELECT COUNT(*) FROM public.commercial_chains;                                       -- 0 until seeded
--   SELECT COUNT(*) FROM public.right_of_reply;                                          -- 0 initially
--   \d public.right_of_reply                                                              -- confirm all columns
--   SELECT NOT has_table_privilege('anon', 'public.report_insider_context', 'select');
--   SELECT policyname FROM pg_policies WHERE tablename = 'reports' AND cmd = 'SELECT';   -- only reports_public_read_non_commercial
--   -- Anonymous insider insert (should succeed; reports.insider_context stays NULL and
--   -- one row appears in report_insider_context):
--   --   INSERT INTO reports (category, latitude, longitude, hazard_level, is_anonymous, insider_context)
--   --   VALUES ('pothole', 42.36, -71.05, 'moderate', true, '{"insider_category":"public_works"}');
--   -- Anonymous commercial insert WITHOUT RETURNING should succeed; a SELECT as anon
--   -- must not return the row.
