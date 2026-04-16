-- ============================================================
-- Migration 002: Add missing RPC functions
-- Run in Supabase SQL Editor
-- ============================================================

-- Award points to a user
CREATE OR REPLACE FUNCTION award_points(p_user_id UUID, p_points INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET points = points + p_points, updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Get nearby clusters (used by clusters service)
CREATE OR REPLACE FUNCTION get_nearby_clusters(
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION DEFAULT 10
)
RETURNS SETOF report_clusters AS $$
BEGIN
  RETURN QUERY
    SELECT *
    FROM report_clusters
    WHERE ST_DWithin(
      centroid_point,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
      radius_km * 1000
    )
    AND status NOT IN ('resolved', 'closed')
    ORDER BY report_count DESC
    LIMIT 50;
END;
$$ LANGUAGE plpgsql;
