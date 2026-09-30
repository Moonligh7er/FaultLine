-- ============================================================
-- Migration 023: Backing tables for edge-function abuse limits
-- ============================================================
-- ai-generate, analyze-photo and ai-compare-photos accepted any
-- signed-in user with no rate limit (open proxy to the Anthropic
-- API), and send-report-email let any signed-in user send any text
-- to any address; its "rate limit" counted escalation_log, which
-- that function never writes to.
--
-- edge_rate_limit_log   one row per allowed call, per user + bucket;
--                       the functions count rows in a sliding window.
-- report_email_sends    one row per report ever emailed directly —
--                       the PK doubles as the dedupe claim, so a
--                       report can reach an authority's inbox once.
--
-- Both are written only by edge functions using the service role.
-- RLS on with no policies, plus REVOKE, keeps them invisible to
-- anon/authenticated clients.
-- ============================================================

CREATE TABLE public.edge_rate_limit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid        NOT NULL,
  bucket     text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX edge_rate_limit_log_lookup
  ON public.edge_rate_limit_log (user_id, bucket, created_at DESC);

CREATE TABLE public.report_email_sends (
  report_id    uuid        PRIMARY KEY REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL,
  authority_id uuid        REFERENCES public.authorities(id) ON DELETE SET NULL,
  recipient    text        NOT NULL,
  resend_id    text,
  created_at   timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE public.edge_rate_limit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_email_sends  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.edge_rate_limit_log FROM anon, authenticated;
REVOKE ALL ON public.report_email_sends  FROM anon, authenticated;

-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
-- SELECT NOT has_table_privilege('anon', 'public.edge_rate_limit_log', 'select');
-- SELECT NOT has_table_privilege('authenticated', 'public.report_email_sends', 'select');
