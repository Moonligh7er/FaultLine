-- ============================================================
-- Migration 030: Road-ownership routing + indexed boundaries
-- ============================================================
-- Before: find_authority_by_point() parsed every authority's
-- boundary_geojson on every call and routed purely by "which town is
-- this point in". A pothole on a state highway (Route 9 in Northampton,
-- Memorial Drive in Cambridge, US-19 in Crystal River) went to the town,
-- which doesn't own the road.
--
-- After:
--   1. authority_boundaries — boundary polygons as real geometry with a
--      GiST index, kept in sync from authorities.boundary_geojson by trigger.
--   2. road_segments — state-owned road centerlines imported from the
--      owners' own inventories (MassDOT Road Inventory: MassDOT + DCR;
--      FDOT State Highway System). road_owners maps (source, owner code)
--      to an authority, so re-pointing an owner never needs a re-import.
--   3. find_authority_by_point(lat, lng, p_category): for roadway
--      categories, a point within 12 m of a state-owned centerline routes
--      to that road's owner; otherwise town/city > county > state by
--      boundary.
--
-- Data is loaded/refreshed by the import-road-ownership edge function
-- (daily cron below; it no-ops until a source is 30 days stale).
-- ============================================================

-- ── 1. Indexed authority boundaries ─────────────────────────
CREATE TABLE public.authority_boundaries (
  authority_id uuid PRIMARY KEY REFERENCES public.authorities(id) ON DELETE CASCADE,
  geom         extensions.geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX authority_boundaries_gix ON public.authority_boundaries USING gist (geom);

CREATE FUNCTION public.sync_authority_boundary()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.boundary_geojson IS NULL THEN
    DELETE FROM public.authority_boundaries WHERE authority_id = NEW.id;
  ELSE
    INSERT INTO public.authority_boundaries (authority_id, geom)
    VALUES (
      NEW.id,
      ST_Multi(ST_CollectionExtract(ST_MakeValid(
        ST_SetSRID(ST_GeomFromGeoJSON(NEW.boundary_geojson::text), 4326)), 3))
    )
    ON CONFLICT (authority_id) DO UPDATE SET geom = EXCLUDED.geom;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_authority_boundary() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER authorities_sync_boundary
  AFTER INSERT OR UPDATE OF boundary_geojson ON public.authorities
  FOR EACH ROW EXECUTE FUNCTION public.sync_authority_boundary();

INSERT INTO public.authority_boundaries (authority_id, geom)
SELECT id,
       ST_Multi(ST_CollectionExtract(ST_MakeValid(
         ST_SetSRID(ST_GeomFromGeoJSON(boundary_geojson::text), 4326)), 3))
FROM public.authorities
WHERE boundary_geojson IS NOT NULL;

ALTER TABLE public.authority_boundaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Boundaries are public" ON public.authority_boundaries FOR SELECT USING (true);
REVOKE ALL ON public.authority_boundaries FROM anon, authenticated;
GRANT SELECT ON public.authority_boundaries TO anon, authenticated;

-- ── 2. Road ownership ───────────────────────────────────────
CREATE TABLE public.road_owners (
  source       text NOT NULL,            -- 'massdot_ri' | 'fdot_shs'
  owner_code   text NOT NULL,            -- source's own code ('1' = MassDOT, '3' = DCR, 'SHS')
  authority_id uuid NOT NULL REFERENCES public.authorities(id) ON DELETE CASCADE,
  label        text NOT NULL,
  PRIMARY KEY (source, owner_code)
);

CREATE TABLE public.road_segments (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source      text NOT NULL,
  source_id   text NOT NULL,
  owner_code  text NOT NULL,
  street_name text,
  route       text,
  district    text,
  geog        extensions.geography(Geometry, 4326) NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (source, source_id)
);
CREATE INDEX road_segments_gix ON public.road_segments USING gist (geog);

CREATE TABLE public.road_import_state (
  source            text PRIMARY KEY,
  status            text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running')),
  cursor_id         bigint NOT NULL DEFAULT 0,
  run_started_at    timestamptz,
  last_completed_at timestamptz,
  last_count        integer,
  last_error        text,
  updated_at        timestamptz NOT NULL DEFAULT NOW()
);
INSERT INTO public.road_import_state (source) VALUES ('massdot_ri'), ('fdot_shs');

ALTER TABLE public.road_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.road_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.road_import_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Road owners are public" ON public.road_owners FOR SELECT USING (true);
CREATE POLICY "Road segments are public" ON public.road_segments FOR SELECT USING (true);
REVOKE ALL ON public.road_owners, public.road_segments, public.road_import_state FROM anon, authenticated;
GRANT SELECT ON public.road_owners, public.road_segments TO anon, authenticated;

-- Bulk upsert one page of features: [{id, owner, street, route, district, geometry}]
CREATE FUNCTION public.import_road_segments(p_source text, p_features jsonb)
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions
AS $$
  WITH f AS (SELECT jsonb_array_elements(p_features) AS j),
  ins AS (
    INSERT INTO public.road_segments AS s
      (source, source_id, owner_code, street_name, route, district, geog, imported_at)
    SELECT p_source, j->>'id', j->>'owner',
           NULLIF(j->>'street', ''), NULLIF(j->>'route', ''), NULLIF(j->>'district', ''),
           ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON((j->'geometry')::text), 4326))::geography,
           NOW()
    FROM f
    WHERE jsonb_typeof(j->'geometry') = 'object'
    ON CONFLICT (source, source_id) DO UPDATE SET
      owner_code = EXCLUDED.owner_code, street_name = EXCLUDED.street_name,
      route = EXCLUDED.route, district = EXCLUDED.district,
      geog = EXCLUDED.geog, imported_at = EXCLUDED.imported_at
    RETURNING 1
  )
  SELECT count(*)::int FROM ins;
$$;

-- Drop segments the source no longer lists (not touched by this run).
CREATE FUNCTION public.finalize_road_import(p_source text, p_run_started_at timestamptz)
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  WITH d AS (
    DELETE FROM public.road_segments
    WHERE source = p_source AND imported_at < p_run_started_at
    RETURNING 1
  )
  SELECT count(*)::int FROM d;
$$;

REVOKE ALL ON FUNCTION public.import_road_segments(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_road_import(text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_road_segments(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_road_import(text, timestamptz) TO service_role;

-- ── 3. Routing ──────────────────────────────────────────────
-- Categories where the road's owner is the responsible party. Sidewalks,
-- curb ramps and streetlights stay with the municipality: along MA state
-- highways they are commonly town-maintained, and ADA complaints belong
-- with the municipal ADA coordinator first.
CREATE FUNCTION public.is_roadway_category(p_category text)
RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT p_category = ANY (ARRAY[
    'pothole', 'road_debris', 'guardrail', 'bridge', 'traffic_signal',
    'needed_traffic_light', 'signage', 'crosswalk', 'bike_lane',
    'drainage', 'fallen_tree', 'snow_ice'
  ]);
$$;

DROP FUNCTION IF EXISTS public.find_authority_by_point(double precision, double precision);

CREATE FUNCTION public.find_authority_by_point(
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
  -- Roadway issue on a state-owned road → the road's owner.
  -- NULL category (older clients) is treated as roadway.
  IF p_category IS NULL OR public.is_roadway_category(p_category) THEN
    RETURN QUERY
      SELECT a.*
      FROM public.road_segments s
      JOIN public.road_owners o ON o.source = s.source AND o.owner_code = s.owner_code
      JOIN public.authorities a ON a.id = o.authority_id AND a.is_active
      WHERE ST_DWithin(s.geog, pt::geography, 12)
      ORDER BY ST_Distance(s.geog, pt::geography)
      LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- Otherwise the smallest enclosing jurisdiction: town/city > county > state.
  RETURN QUERY
    SELECT a.*
    FROM public.authority_boundaries b
    JOIN public.authorities a ON a.id = b.authority_id AND a.is_active
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

GRANT EXECUTE ON FUNCTION public.find_authority_by_point(double precision, double precision, text)
  TO anon, authenticated;

-- ── 4. Daily refresh (no-ops until a source is 30 days old) ─
SELECT cron.schedule(
  'import-road-ownership-daily',
  '15 7 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://dzewklljiksyivsfpunt.supabase.co/functions/v1/import-road-ownership',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $cmd$
);
