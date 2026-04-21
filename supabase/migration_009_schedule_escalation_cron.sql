-- ============================================================
-- Migration 009: Schedule the daily escalation cron job
-- ============================================================
-- Enables pg_cron + pg_net and schedules escalate-clusters to run
-- daily at 14:00 UTC (10:00 AM Eastern). The cron authenticates to
-- the edge function using the 'x-cron-secret' header, which matches
-- CRON_SECRET set in Supabase Edge Function secrets.
--
-- If CRON_SECRET is rotated, update both:
--   1. Supabase secrets (via `supabase secrets set CRON_SECRET=...`)
--   2. The hardcoded value in this cron job (re-run this migration
--      with the new value, or unschedule+reschedule manually).
-- ============================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Unschedule any prior job with the same name (idempotent re-run)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'escalate-clusters-daily') then
    perform cron.unschedule('escalate-clusters-daily');
  end if;
end $$;

-- Schedule: daily at 14:00 UTC (10:00 AM Eastern)
select cron.schedule(
  'escalate-clusters-daily',
  '0 14 * * *',
  $CRON$
  select net.http_post(
    url := 'https://dzewklljiksyivsfpunt.supabase.co/functions/v1/escalate-clusters',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- NOTE: This value must match the CRON_SECRET edge function secret.
      -- It is NOT the same shell-environment secret committed to any .env.
      'x-cron-secret', '<REDACTED_CRON_SECRET>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $CRON$
);
