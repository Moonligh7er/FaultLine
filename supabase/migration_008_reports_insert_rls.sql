-- ============================================================
-- Migration 008: Tighten INSERT policy on reports
-- ============================================================
-- The original policy allowed any authenticated user to insert
-- a report claiming ANY user_id (WITH CHECK (true)). This lets
-- an attacker forge reports attributed to someone else.
--
-- This migration enforces at the DB layer that:
--   * Authenticated users can ONLY insert reports where
--     user_id = auth.uid(), OR as anonymous (user_id NULL +
--     is_anonymous = true)
--   * Unauthenticated users (anon role) can still submit
--     anonymous reports — this preserves the "no account required"
--     flow in the mobile app
--   * Nobody can forge a report under another user's user_id
--
-- Run in Supabase SQL Editor. Supabase wraps this whole script
-- in a transaction so the DROP + CREATE happen atomically —
-- there is no window where reports are unprotected.
-- ============================================================

-- ----- INSERT policy -----
DROP POLICY IF EXISTS "Authenticated users can create reports" ON reports;
DROP POLICY IF EXISTS "Users can create reports as self or anonymously" ON reports;

CREATE POLICY "Users can create reports as self or anonymously"
  ON reports
  FOR INSERT
  WITH CHECK (
    -- Authenticated user inserting their own report
    (
      auth.uid() IS NOT NULL
      AND user_id = auth.uid()
    )
    OR
    -- Authenticated user inserting anonymously
    (
      auth.uid() IS NOT NULL
      AND user_id IS NULL
      AND is_anonymous = true
    )
    OR
    -- Unauthenticated client inserting anonymously
    -- (preserves mobile's "no account required" flow)
    (
      auth.uid() IS NULL
      AND user_id IS NULL
      AND is_anonymous = true
    )
  );

-- ----- UPDATE policy -----
-- Only authors can update their own non-anonymous reports.
-- Anonymous reports (user_id IS NULL) cannot be edited by anyone.
-- Also prevents user_id reassignment during update.
DROP POLICY IF EXISTS "Users can update own reports" ON reports;

CREATE POLICY "Users can update own reports"
  ON reports
  FOR UPDATE
  TO authenticated
  USING (user_id IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (user_id IS NOT NULL AND auth.uid() = user_id);

-- ============================================================
-- Verification
-- ============================================================
-- After running, you can verify with the SQL below. The first
-- two should SUCCEED, the last two should FAIL with an RLS error.
--
--   -- As authenticated user A, insert your own report:
--   INSERT INTO reports (user_id, category, latitude, longitude,
--     size_rating, hazard_level, is_anonymous)
--   VALUES (auth.uid(), 'pothole', 42.36, -71.05,
--     'medium', 'moderate', false);
--   -- Should succeed.
--
--   -- As any client, insert an anonymous report:
--   INSERT INTO reports (user_id, category, latitude, longitude,
--     size_rating, hazard_level, is_anonymous)
--   VALUES (NULL, 'pothole', 42.36, -71.05,
--     'medium', 'moderate', true);
--   -- Should succeed.
--
--   -- As authenticated user A, try to forge a report under user B:
--   INSERT INTO reports (user_id, category, latitude, longitude,
--     size_rating, hazard_level, is_anonymous)
--   VALUES ('<user-b-uuid>', 'pothole', 42.36, -71.05,
--     'medium', 'moderate', false);
--   -- Should FAIL: new row violates row-level security policy
--
--   -- As any client, try to insert a non-anonymous report
--   -- claiming no user_id:
--   INSERT INTO reports (user_id, category, latitude, longitude,
--     size_rating, hazard_level, is_anonymous)
--   VALUES (NULL, 'pothole', 42.36, -71.05,
--     'medium', 'moderate', false);
--   -- Should FAIL.
-- ============================================================
