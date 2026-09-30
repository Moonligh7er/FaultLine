-- ============================================================
-- Migration 024: Rotate CRON_SECRET into Supabase Vault (DEFERRED #21)
-- ============================================================
-- The cron secret was a literal inside both pg_cron job commands, and
-- the same value was quoted in DEFERRED.md, which is in the public
-- GitHub repo. Anyone could trigger escalate-clusters (emails cities),
-- sync-open311-statuses, or enrich-authority-boundaries.
--
-- After this migration:
--   • a NEW random secret lives only in Vault (generated here — the
--     value never appears in SQL, files, or git);
--   • both cron jobs read it from vault.decrypted_secrets at fire time;
--   • edge functions verify the x-cron-secret header by calling
--     verify_cron_secret() (service_role only) instead of comparing to
--     the CRON_SECRET env var, so Vault is the single source of truth.
--
-- Rotation from now on (one step, no redeploys):
--   SELECT vault.update_secret(
--     (SELECT id FROM vault.secrets WHERE name = 'cron_secret'),
--     encode(extensions.gen_random_bytes(32), 'base64'));
--
-- The old CRON_SECRET edge-function env var is no longer read and can
-- be deleted from the dashboard.
-- ============================================================

SELECT vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'base64'),
  'cron_secret',
  'x-cron-secret shared by pg_cron jobs and edge functions (migration 024)'
);

CREATE OR REPLACE FUNCTION public.verify_cron_secret(p_secret text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(length(p_secret), 0) > 0 AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'cron_secret' AND decrypted_secret = p_secret
  );
$$;

REVOKE ALL ON FUNCTION public.verify_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text) TO service_role;

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'escalate-clusters-daily'),
  command := $cmd$
  SELECT net.http_post(
    url := 'https://dzewklljiksyivsfpunt.supabase.co/functions/v1/escalate-clusters',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cmd$
);

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'sync-open311-statuses-hourly'),
  command := $cmd$
  SELECT net.http_post(
    url := 'https://dzewklljiksyivsfpunt.supabase.co/functions/v1/sync-open311-statuses',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cmd$
);

-- ------------------------------------------------------------
-- Verification (no secret values printed)
-- ------------------------------------------------------------
-- SELECT jobname, command ILIKE '%vault.decrypted_secrets%' AS uses_vault FROM cron.job;
-- SELECT NOT has_function_privilege('anon', 'public.verify_cron_secret(text)', 'execute');
