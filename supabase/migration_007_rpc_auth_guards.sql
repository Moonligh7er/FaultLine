-- ============================================================
-- Migration 007: Add auth guards to RPC functions
-- Run in Supabase SQL Editor
-- ============================================================

DROP FUNCTION IF EXISTS increment_upvote(UUID);
DROP FUNCTION IF EXISTS increment_confirm(UUID);

-- Increment upvote: require authentication and prevent self-voting
CREATE OR REPLACE FUNCTION increment_upvote(report_id UUID)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Prevent voting on own report
  IF EXISTS (SELECT 1 FROM reports WHERE id = report_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Cannot upvote your own report';
  END IF;

  UPDATE reports SET upvote_count = upvote_count + 1, updated_at = NOW()
  WHERE id = report_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Increment confirm: require authentication and prevent self-confirming
CREATE OR REPLACE FUNCTION increment_confirm(report_id UUID)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Prevent confirming own report
  IF EXISTS (SELECT 1 FROM reports WHERE id = report_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Cannot confirm your own report';
  END IF;

  UPDATE reports SET confirm_count = confirm_count + 1, updated_at = NOW()
  WHERE id = report_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
