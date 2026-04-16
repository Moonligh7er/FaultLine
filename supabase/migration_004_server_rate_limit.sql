-- ============================================================
-- Migration 004: Server-side rate limiting + bot protection
-- Run in Supabase SQL Editor
-- ============================================================

-- Server-side rate limit: max 10 reports per user per hour
-- This cannot be bypassed by decompiling the app
CREATE OR REPLACE FUNCTION enforce_report_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  -- Skip for anonymous reports (user_id is null)
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO recent_count
  FROM reports
  WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '1 hour';

  IF recent_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 10 reports per hour'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_rate_limit
  BEFORE INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION enforce_report_rate_limit();

-- Honeypot field: if this field is filled, reject the report (bots fill all fields)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS _hp TEXT;

CREATE OR REPLACE FUNCTION reject_honeypot()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW._hp IS NOT NULL AND NEW._hp != '' THEN
    RAISE EXCEPTION 'Invalid submission'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_honeypot
  BEFORE INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION reject_honeypot();

-- Global rate limit: max 100 reports per IP per hour (via edge function)
-- This table logs submission attempts for abuse detection
CREATE TABLE IF NOT EXISTS submission_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submission_log_created ON submission_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submission_log_ip ON submission_log(ip_address, created_at);

-- Auto-cleanup: delete logs older than 24 hours
CREATE OR REPLACE FUNCTION cleanup_submission_log()
RETURNS VOID AS $$
BEGIN
  DELETE FROM submission_log WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;
