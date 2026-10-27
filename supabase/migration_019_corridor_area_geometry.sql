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
--
-- Client write path (src/services/reportExtensions.ts): the app sends
-- geometry_type = 'corridor' and corridor_geometry as EWKT text
-- ('SRID=4326;LINESTRING(lng lat,lng lat)'); PostgREST casts it through
-- geometry_in. Ordinary point reports send none of these columns, so the
-- defaults below keep them unchanged. The existing reports INSERT policy
-- (migration 008) applies as-is — anonymous corridor reports work.
--
-- Review fixes (2026-10-26, before first apply):
--   * parent_cluster_id referenced public.clusters, which doesn't exist —
--     now public.report_clusters. The original script failed here.
--   * ADD CONSTRAINT IF NOT EXISTS is not valid Postgres syntax; the
--     check constraint is now added inside a pg_constraint guard.
--   * corridor_suggestions UPDATE policy let any signed-in user rewrite
--     any column of any suggestion (geometry, report ids, dismissal).
--     Clients may now only claim an open suggestion: column-level UPDATE
--     on accepted_at / accepted_by, accepted_by must be auth.uid().
--   * Indexes on parent_cluster_id and resulting_report_id (FKs).
--   * Enum type schema-qualified; PostgREST schema cache reloaded.
-- ============================================================

BEGIN;

-- Ensure PostGIS is available (should already be per migration 017).
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- ── report geometry type enum ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'report_geometry_type_enum' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.report_geometry_type_enum AS ENUM ('point', 'corridor', 'area');
  END IF;
END $$;

-- ── extend reports ──────────────────────────────────────────────────────
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS geometry_type public.report_geometry_type_enum NOT NULL DEFAULT 'point',
  ADD COLUMN IF NOT EXISTS corridor_geometry extensions.geometry(LineString, 4326),
  ADD COLUMN IF NOT EXISTS area_geometry extensions.geometry(Polygon, 4326),
  ADD COLUMN IF NOT EXISTS corridor_street_name TEXT,
  ADD COLUMN IF NOT EXISTS corridor_from_cross_street TEXT,
  ADD COLUMN IF NOT EXISTS corridor_to_cross_street TEXT,
  ADD COLUMN IF NOT EXISTS area_boundary_name TEXT,
  ADD COLUMN IF NOT EXISTS area_census_tract_geoid TEXT,
  ADD COLUMN IF NOT EXISTS parent_cluster_id UUID REFERENCES public.report_clusters(id) ON DELETE SET NULL;

-- Geometry-consistency check: the geometry column matching geometry_type must be non-null.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reports_geometry_consistency_check'
      AND conrelid = 'public.reports'::regclass
  ) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_geometry_consistency_check CHECK (
        (geometry_type = 'point' AND corridor_geometry IS NULL AND area_geometry IS NULL)
        OR (geometry_type = 'corridor' AND corridor_geometry IS NOT NULL AND area_geometry IS NULL)
        OR (geometry_type = 'area' AND area_geometry IS NOT NULL AND corridor_geometry IS NULL)
      );
  END IF;
END $$;

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
CREATE INDEX IF NOT EXISTS idx_reports_parent_cluster_id
  ON public.reports (parent_cluster_id)
  WHERE parent_cluster_id IS NOT NULL;

-- ── corridor_suggestions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.corridor_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggested_geometry extensions.geometry(Geometry, 4326) NOT NULL,   -- LineString OR Polygon
  suggested_geometry_type public.report_geometry_type_enum NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_corridor_suggestions_resulting_report_id
  ON public.corridor_suggestions (resulting_report_id)
  WHERE resulting_report_id IS NOT NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.corridor_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS corridor_suggestions_public_read ON public.corridor_suggestions;
CREATE POLICY corridor_suggestions_public_read ON public.corridor_suggestions FOR SELECT USING (TRUE);

-- Authenticated users can accept an open suggestion (writes their user_id
-- into accepted_by). Column-level UPDATE limits them to the two acceptance
-- columns; everything else (geometry, underlying ids, dismissal,
-- resulting_report_id) is written by the service role only.
REVOKE ALL ON public.corridor_suggestions FROM anon, authenticated;
GRANT SELECT ON public.corridor_suggestions TO anon, authenticated;
GRANT UPDATE (accepted_at, accepted_by) ON public.corridor_suggestions TO authenticated;

DROP POLICY IF EXISTS corridor_suggestions_authenticated_accept ON public.corridor_suggestions;
CREATE POLICY corridor_suggestions_authenticated_accept ON public.corridor_suggestions
  FOR UPDATE TO authenticated
  USING (accepted_at IS NULL AND dismissed_at IS NULL)
  WITH CHECK (accepted_by = auth.uid() AND accepted_at IS NOT NULL);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Verification ─────────────────────────────────────────────────────────
--   SELECT column_name, data_type FROM information_schema.columns
--     WHERE table_name = 'reports' AND column_name LIKE '%geometry%';
--   SELECT indexname FROM pg_indexes WHERE tablename = 'reports' AND indexname LIKE '%geometry%';
--   SELECT NOT has_column_privilege('authenticated', 'public.corridor_suggestions', 'suggested_geometry', 'update');
--   -- Anonymous corridor insert (should succeed):
--   --   INSERT INTO reports (category, latitude, longitude, hazard_level, is_anonymous,
--   --     geometry_type, corridor_geometry)
--   --   VALUES ('pothole', 42.36, -71.05, 'moderate', true, 'corridor',
--   --     'SRID=4326;LINESTRING(-71.05 42.36,-71.06 42.37)');
