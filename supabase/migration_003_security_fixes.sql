-- ============================================================
-- Migration 003: Security fixes
-- Run in Supabase SQL Editor
-- ============================================================

-- Fix: Reports INSERT policy — enforce user can only create reports for themselves
-- Drop the old permissive policy
DROP POLICY IF EXISTS "Authenticated users can create reports" ON reports;

-- New policy: user_id must match authenticated user, OR user_id is null (anonymous)
CREATE POLICY "Users can only create reports as themselves" ON reports
  FOR INSERT WITH CHECK (
    user_id IS NULL OR auth.uid() = user_id
  );

-- Add: Users can delete their own reports
CREATE POLICY "Users can delete own reports" ON reports
  FOR DELETE USING (auth.uid() = user_id);

-- Add: Users can delete their own profile (for GDPR/account deletion)
CREATE POLICY "Users can delete own profile" ON profiles
  FOR DELETE USING (auth.uid() = id);

-- Add: Users can delete their own votes
CREATE POLICY "Users can delete own votes" ON report_votes
  FOR DELETE USING (auth.uid() = user_id);
