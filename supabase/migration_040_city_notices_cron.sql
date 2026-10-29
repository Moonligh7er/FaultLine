-- Migration 040: run city-notices hourly (reminders + written notices for city accounts).
-- Hourly so the copy of accepted terms and renewal-change notices arrive promptly;
-- every email is deduplicated in city_account_events, so reruns send nothing new.
SELECT cron.unschedule('city-notices-hourly') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'city-notices-hourly');
SELECT cron.schedule('city-notices-hourly', '10 * * * *', $$
  SELECT net.http_post(
    url := 'https://dzewklljiksyivsfpunt.supabase.co/functions/v1/city-notices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
