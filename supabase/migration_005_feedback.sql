-- ============================================================
-- Migration 005: Feedback & Feature Requests tables
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('feedback', 'feature_request', 'bug')),
  name TEXT,
  email TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'planned', 'in_progress', 'done', 'declined')),
  votes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Anyone can submit feedback (no auth required)
CREATE POLICY "Anyone can submit feedback" ON feedback FOR INSERT WITH CHECK (true);
-- Anyone can read feedback (public roadmap)
CREATE POLICY "Feedback is viewable by everyone" ON feedback FOR SELECT USING (true);
