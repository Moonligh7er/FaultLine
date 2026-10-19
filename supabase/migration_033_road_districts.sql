-- ============================================================
-- Migration 033: Area-wide road owners (highway districts)
-- ============================================================
-- Some places split roads from the city: in Ada County, Idaho, the Ada
-- County Highway District (ACHD) owns every public road except state
-- highways — Boise, Meridian, Eagle, Garden City, Kuna and Star handle
-- streetlights at most. Routing a Boise pothole to "City of Boise" sends it
-- to an office that can't fix it.
--
-- authorities.owns_local_roads marks such districts. For roadway
-- categories, find_authority_by_point() now checks, in order:
--   1. state-owned road centerline within 12 m (migration 030)
--   2. a road-owning district whose boundary covers the point (this)
--   3. town/city > county > state boundary
-- ============================================================

ALTER TABLE public.authorities ADD COLUMN IF NOT EXISTS owns_local_roads boolean NOT NULL DEFAULT false;

INSERT INTO public.authorities (name, level, state, city, county, owns_local_roads, submission_methods)
SELECT 'Ada County Highway District (ACHD)', 'county', 'ID', NULL, 'Ada', true, $j$[
  {"method":"web_form","endpoint":"https://www.achdidaho.org/community-resources/report-an-issue","priority":1,"notes":"ACHD Connect (web map / app). Owns all public roads in Ada County except state highways."},
  {"method":"phone","endpoint":"208-387-6100","priority":2,"notes":"Business hours 8–4:30; after hours Ada County non-emergency dispatch 208-377-6790"}
]$j$::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.authorities WHERE name = 'Ada County Highway District (ACHD)');

CREATE OR REPLACE FUNCTION public.find_authority_by_point(
  lat double precision,
  lng double precision,
  p_category text DEFAULT NULL
)
RETURNS SETOF public.authorities
LANGUAGE plpgsql STABLE
SET search_path = public, extensions
AS $$
DECLARE
  pt extensions.geometry := ST_SetSRID(ST_MakePoint(lng, lat), 4326);
BEGIN
  IF p_category IS NULL OR public.is_roadway_category(p_category) THEN
    -- 1. State-owned road under the point → the road's owner.
    RETURN QUERY
      SELECT a.*
      FROM public.road_segments s
      JOIN public.road_owners o ON o.source = s.source AND o.owner_code = s.owner_code
      JOIN public.authorities a ON a.id = o.authority_id AND a.is_active
      WHERE ST_DWithin(s.geog, pt::geography, 12)
      ORDER BY ST_Distance(s.geog, pt::geography)
      LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    -- 2. Area-wide road owner (highway district) covering the point.
    RETURN QUERY
      SELECT a.*
      FROM public.authority_boundaries b
      JOIN public.authorities a ON a.id = b.authority_id AND a.is_active AND a.owns_local_roads
      WHERE ST_Covers(b.geom, pt)
      ORDER BY ST_Area(b.geom)
      LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 3. Smallest enclosing jurisdiction: town/city > county > state.
  RETURN QUERY
    SELECT a.*
    FROM public.authority_boundaries b
    JOIN public.authorities a ON a.id = b.authority_id AND a.is_active AND NOT a.owns_local_roads
    WHERE ST_Covers(b.geom, pt)
    ORDER BY
      CASE a.level
        WHEN 'town' THEN 1 WHEN 'city' THEN 2 WHEN 'county' THEN 3
        WHEN 'state' THEN 4 WHEN 'federal' THEN 5
      END,
      ST_Area(b.geom)
    LIMIT 1;
END;
$$;
