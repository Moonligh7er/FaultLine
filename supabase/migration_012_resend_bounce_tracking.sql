-- ============================================================
-- Migration 012: Resend bounce tracking + authority email health
-- ============================================================
-- Adds the columns needed by the Resend webhook handler at
-- /api/webhooks/resend to correlate incoming events with our
-- escalation_log rows.
-- ============================================================

ALTER TABLE escalation_log
  ADD COLUMN IF NOT EXISTS external_message_id TEXT,
  ADD COLUMN IF NOT EXISTS bounce_type TEXT,
  ADD COLUMN IF NOT EXISTS bounce_reason TEXT,
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

COMMENT ON COLUMN escalation_log.external_message_id IS 'Resend email ID. Used to join incoming webhooks back to the escalation.';
COMMENT ON COLUMN escalation_log.bounce_type IS 'If a bounce or complaint webhook fires: hard|soft|complaint|rejected|delivery_delayed';
COMMENT ON COLUMN escalation_log.bounce_reason IS 'Human-readable reason from the webhook payload.';

CREATE INDEX IF NOT EXISTS idx_escalation_log_message_id
  ON escalation_log (external_message_id)
  WHERE external_message_id IS NOT NULL;

-- Per-authority email health so we can flag invalid addresses for re-verification.
ALTER TABLE authorities
  ADD COLUMN IF NOT EXISTS email_health TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_bounce_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounce_count INT DEFAULT 0;

COMMENT ON COLUMN authorities.email_health IS 'unknown|healthy|soft_bouncing|hard_bouncing|rejected. Updated by Resend webhook handler.';
