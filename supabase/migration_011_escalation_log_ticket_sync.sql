-- ============================================================
-- Migration 011: Escalation log ticket tracking + status sync cron
-- ============================================================
-- Adds the columns and cron needed to close the loop on API-submitted
-- escalations (Boston Open311, SeeClickFix cities). After an API
-- submission succeeds, escalate-clusters stores the returned ticket ID.
-- sync-open311-statuses runs hourly at :15, polls each open API ticket
-- for status updates, and propagates the city's reported status back
-- to the cluster record.
-- ============================================================

ALTER TABLE escalation_log
  ADD COLUMN IF NOT EXISTS external_ticket_id TEXT,
  ADD COLUMN IF NOT EXISTS last_status_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS external_status TEXT;

COMMENT ON COLUMN escalation_log.external_ticket_id IS 'Ticket ID returned by Open311 or SeeClickFix POST. Used to poll for status updates.';
COMMENT ON COLUMN escalation_log.last_status_check_at IS 'Last time sync-open311-statuses polled this ticket.';
COMMENT ON COLUMN escalation_log.external_status IS 'Raw status string returned by the city system on last poll (e.g. acknowledged, in_progress, resolved, closed).';

CREATE INDEX IF NOT EXISTS idx_escalation_log_external_ticket
  ON escalation_log (external_ticket_id)
  WHERE external_ticket_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_escalation_log_api_unfinished
  ON escalation_log (method, status, last_status_check_at)
  WHERE method LIKE 'api:%' AND status != 'resolved';

-- Schedule hourly status polling (at minute :15 of every hour).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-open311-statuses-hourly') then
    perform cron.unschedule('sync-open311-statuses-hourly');
  end if;
end $$;

select cron.schedule(
  'sync-open311-statuses-hourly',
  '15 * * * *',
  $CRON$
  select net.http_post(
    url := 'https://dzewklljiksyivsfpunt.supabase.co/functions/v1/sync-open311-statuses',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- Must match CRON_SECRET in Supabase Edge Function secrets.
      'x-cron-secret', '<REDACTED_CRON_SECRET>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $CRON$
);
