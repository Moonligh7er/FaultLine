-- ============================================================
-- Migration 029: Synthetic pipeline test + health record
-- ============================================================
-- pipeline-smoke (edge function) runs the whole core path daily against
-- production — anonymous report insert (RLS + clustering trigger) →
-- escalation queued → approved → dispatched by email → escalation_log →
-- reply applied — using a throwaway authority whose only address is
-- Resend's test sink (delivered@resend.dev), then deletes everything it
-- created. Each run's step-by-step result lands in health_checks; the
-- public `health` function summarizes the latest run for uptime monitors.
-- ============================================================

CREATE TABLE public.health_checks (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  check_name  text NOT NULL,
  ok          boolean NOT NULL,
  failed_step text,
  steps       jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_ms integer,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX health_checks_latest ON public.health_checks (check_name, created_at DESC);
ALTER TABLE public.health_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.health_checks FROM anon, authenticated;
CREATE POLICY "Admins read health" ON public.health_checks
  FOR SELECT TO authenticated USING (public.is_admin());
GRANT SELECT ON public.health_checks TO authenticated;

-- Daily at 13:30 UTC (before the 14:00 escalation run).
SELECT cron.schedule(
  'pipeline-smoke-daily',
  '30 13 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://dzewklljiksyivsfpunt.supabase.co/functions/v1/pipeline-smoke',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cmd$
);

-- Keep 90 days of history.
SELECT cron.schedule(
  'health-checks-prune',
  '0 4 * * *',
  $cmd$ DELETE FROM public.health_checks WHERE created_at < NOW() - INTERVAL '90 days'; $cmd$
);
