-- ============================================================
-- Migration 019 — Corridor & area geometry on reports
--
-- Supports DEFERRED #28: three report geometry types (point / corridor / area).
-- Adds PostGIS linestring + polygon columns to `reports`. Existing rows
-- default to 'point' — no data migration needed.
--
-- Companion tables:
--   - corridor_suggestions: nightly-computed suggestions surfaced in UI
--
-- Consumers:
--   - src/services/corridorAggregation.ts (suggestions + Shame Index weight)
--   - legalGenerator.ts (letter body renders corridor/area geometry when present)
--
-- Safe to run multiple times.
-- ============================================================

BEGIN;

-- Ensure PostGIS is available (should already be per migration 017).
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- ── report geometry type enum ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_geometry_type_enum') THEN
    CREATE TYPE report_geometry_type_enum AS ENUM ('point', 'corridor', 'area');
  END IF;
END $$;

-- ── extend reports ──────────────────────────────────────────────────────
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS geometry_type report_geometry_type_enum NOT NULL DEFAULT 'point',
  ADD COLUMN IF NOT EXISTS corridor_geometry extensions.geometry(LineString, 4326),
  ADD COLUMN IF NOT EXISTS area_geometry extensions.geometry(Polygon, 4326),
  ADD COLUMN IF NOT EXISTS corridor_street_name TEXT,
  ADD COLUMN IF NOT EXISTS corridor_from_cross_street TEXT,
  ADD COLUMN IF NOT EXISTS corridor_to_cross_street TEXT,
  ADD COLUMN IF NOT EXISTS area_boundary_name TEXT,
  ADD COLUMN IF NOT EXISTS area_census_tract_geoid TEXT,
  ADD COLUMN IF NOT EXISTS parent_cluster_id UUID REFERENCES public.clusters(id) ON DELETE SET NULL;

-- Geometry-consistency check: the geometry column matching geometry_type must be non-null.
ALTER TABLE public.reports
  ADD CONSTRAINT IF NOT EXISTS reports_geometry_consistency_check CHECK (
    (geometry_type = 'point' AND corridor_geometry IS NULL AND area_geometry IS NULL)
    OR (geometry_type = 'corridor' AND corridor_geometry IS NOT NULL AND area_geometry IS NULL)
    OR (geometry_type = 'area' AND area_geometry IS NOT NULL AND corridor_geometry IS NULL)
  );

-- Spatial indexes for the new columns.
CREATE INDEX IF NOT EXISTS idx_reports_corridor_geometry
  ON public.reports USING GIST (corridor_geometry)
  WHERE corridor_geometry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_area_geometry
  ON public.reports USING GIST (area_geometry)
  WHERE area_geometry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_geometry_type
  ON public.reports (geometry_type)
  WHERE geometry_type != 'point';

-- ── corridor_suggestions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.corridor_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggested_geometry extensions.geometry(Geometry, 4326) NOT NULL,   -- LineString OR Polygon
  suggested_geometry_type report_geometry_type_enum NOT NULL,
  underlying_report_ids UUID[] NOT NULL,
  distinct_reporter_count INT NOT NULL,
  distinct_gps_point_count INT NOT NULL,
  category_distribution JSONB NOT NULL DEFAULT '{}',
  suggested_street_name TEXT,
  suggested_area_boundary_name TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  suggested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,                                            -- Set when community member accepts
  accepted_by UUID,                                                   -- Reporter who accepted (nullable — anonymous accept OK)
  resulting_report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  dismissed_at TIMESTAMPTZ,                                           -- Set when the suggestion is rejected / expires
  dismissed_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_corridor_suggestions_active
  ON public.corridor_suggestions (suggested_at DESC)
  WHERE accepted_at IS NULL AND dismissed_at IS NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.corridor_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS corridor_suggestions_public_read ON public.corridor_suggestions;
CREATE POLICY corridor_suggestions_public_read ON public.corridor_suggestions FOR SELECT USING (TRUE);

-- Authenticated users can accept suggestions (writes their user_id into accepted_by).
DROP POLICY IF EXISTS corridor_suggestions_authenticated_accept ON public.corridor_suggestions;
CREATE POLICY corridor_suggestions_authenticated_accept ON public.corridor_suggestions
  FOR UPDATE USING (auth.uid() IS NOT NULL);

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────
--   SELECT column_name, data_type FROM information_schema.columns
--     WHERE table_name = 'reports' AND column_name LIKE '%geometry%';
--   SELECT indexname FROM pg_indexes WHERE tablename = 'reports' AND indexname LIKE '%geometry%';
