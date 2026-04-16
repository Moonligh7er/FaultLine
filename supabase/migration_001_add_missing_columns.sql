-- ============================================================
-- Migration 001: Add missing columns to match app code
-- Run this in Supabase SQL Editor AFTER the initial schema
-- ============================================================

-- Reports table: add urgency, condition, quick report, cluster link, resolved media
ALTER TABLE reports ADD COLUMN IF NOT EXISTS urgency TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS condition_level TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS is_quick_report BOOLEAN DEFAULT FALSE;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS cluster_id UUID REFERENCES report_clusters(id);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_media JSONB DEFAULT '[]'::jsonb;

-- Add constraints for new severity columns
ALTER TABLE reports ADD CONSTRAINT chk_urgency
  CHECK (urgency IS NULL OR urgency IN ('low', 'medium', 'high', 'critical'));
ALTER TABLE reports ADD CONSTRAINT chk_condition_level
  CHECK (condition_level IS NULL OR condition_level IN ('cosmetic', 'deteriorating', 'broken', 'destroyed'));

-- Index on cluster_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_reports_cluster ON reports(cluster_id);

-- Profiles table: add push_token for notifications
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token TEXT;

-- ============================================================
-- Update the hazard_level constraint to allow NULL for categories
-- that don't use hazard (e.g., graffiti with condition-only)
-- ============================================================
ALTER TABLE reports ALTER COLUMN hazard_level DROP NOT NULL;
ALTER TABLE reports ALTER COLUMN size_rating DROP NOT NULL;
