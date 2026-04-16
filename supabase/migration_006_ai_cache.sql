-- ============================================================
-- Migration 006: AI result cache table
-- Stores AI analysis results for learning and cost savings.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  result JSONB NOT NULL,
  model TEXT DEFAULT 'claude-haiku-4-5',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_report ON ai_cache(report_id, task_type);
CREATE INDEX IF NOT EXISTS idx_ai_cache_created ON ai_cache(created_at DESC);

ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "AI cache viewable by everyone" ON ai_cache FOR SELECT USING (true);
CREATE POLICY "AI cache insertable by authenticated" ON ai_cache FOR INSERT WITH CHECK (true);
