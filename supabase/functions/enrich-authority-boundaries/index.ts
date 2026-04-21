// Supabase Edge Function: enrich-authority-boundaries
//
// Fetches US Census TIGER/Line "Incorporated Place" boundary polygons for every
// authority row where boundary_geojson IS NULL and (city, state) are populated.
// Updates the row in place so find_authority_by_point() can route reports.
//
// Manually invoked:
//   curl -X POST https://dzewklljiksyivsfpunt.supabase.co/functions/v1/enrich-authority-boundaries \
//     -H "Content-Type: application/json" \
//     -H "x-cron-secret: <CRON_SECRET>" \
//     -d '{"limit": 100}'
//
// Uses the Census TIGERweb REST service (public, no API key):
//   https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/28
//   Layer 28 = Incorporated Places. We query by NAME + STATE FIPS, ask for geojson.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// US state → FIPS code mapping (needed for the Census query)
const STATE_FIPS: Record<string, string> = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10',
  DC: '11', FL: '12', GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19',
  KS: '20', KY: '21', LA: '22', ME: '23', MD: '24', MA: '25', MI: '26', MN: '27',
  MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33', NJ: '34', NM: '35',
  NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44',
  SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53',
  WV: '54', WI: '55', WY: '56',
};

const TIGER_PLACES_URL =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/28/query';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const cronSecret = req.headers.get('x-cron-secret');
  if (!cronSecret || cronSecret !== (Deno.env.get('CRON_SECRET') || '')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const params = await req.json().catch(() => ({}));
  const limit = Math.min(Number(params.limit ?? 50), 200);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Find authorities still missing a boundary AND not recently checked.
  // Re-check "misses" only if boundary_checked_at is older than 30 days.
  const recheckCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from('authorities')
    .select('id, name, level, state, city')
    .is('boundary_geojson', null)
    .not('city', 'is', null)
    .eq('is_active', true)
    .in('level', ['city', 'town'])
    .or(`boundary_checked_at.is.null,boundary_checked_at.lt.${recheckCutoff}`)
    .order('boundary_checked_at', { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const row of rows ?? []) {
    if (!row.city || !row.state || !STATE_FIPS[row.state]) {
      results.push({ id: row.id, skipped: 'missing city/state or unknown state' });
      continue;
    }

    const checkedAt = new Date().toISOString();
    try {
      const geojson = await fetchPlaceBoundary(row.city, row.state);
      if (!geojson) {
        // Mark as checked so we skip for 30 days.
        await supabase
          .from('authorities')
          .update({ boundary_checked_at: checkedAt })
          .eq('id', row.id);
        results.push({ id: row.id, name: row.name, error: 'no boundary found' });
        continue;
      }

      const { error: updErr } = await supabase
        .from('authorities')
        .update({ boundary_geojson: geojson, boundary_checked_at: checkedAt })
        .eq('id', row.id);

      if (updErr) {
        results.push({ id: row.id, name: row.name, error: updErr.message });
      } else {
        results.push({ id: row.id, name: row.name, ok: true });
      }
    } catch (err) {
      // Network error etc. — leave boundary_checked_at null so we retry next run.
      results.push({ id: row.id, name: row.name, error: String(err) });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  return new Response(
    JSON.stringify({
      message: 'Boundary enrichment complete',
      total_examined: rows?.length ?? 0,
      enriched: ok,
      results,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});

/** Query Census TIGERweb for a specific Place polygon.
 *
 *  TIGER stores the unadorned name in BASENAME ("Springfield") and the
 *  typed name in NAME ("Springfield city" / "Springfield town"). We query
 *  BASENAME + STATE FIPS.
 *
 *  Tries Incorporated Places (layer 28) first. Falls back to County
 *  Subdivisions (layer 22) — necessary for most New England towns,
 *  which are MCDs rather than Census Places.
 */
async function fetchPlaceBoundary(
  city: string,
  stateAbbr: string,
): Promise<Record<string, unknown> | null> {
  const fips = STATE_FIPS[stateAbbr];
  if (!fips) return null;

  const nameEscaped = city.replace(/'/g, "''");

  // Layer 28 = Incorporated Places. First choice.
  let geom = await queryTigerLayer(
    'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/28/query',
    `BASENAME='${nameEscaped}' AND STATE='${fips}'`,
  );
  if (geom) return geom;

  // Layer 22 = County Subdivisions (MCDs). Catches NE towns.
  geom = await queryTigerLayer(
    'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/22/query',
    `BASENAME='${nameEscaped}' AND STATE='${fips}'`,
  );
  if (geom) return geom;

  // Layer 34 = Census Designated Places (CDPs). Catches unincorporated
  // communities like Casas Adobes AZ, Holt MI.
  geom = await queryTigerLayer(
    'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/34/query',
    `BASENAME='${nameEscaped}' AND STATE='${fips}'`,
  );
  return geom;
}

async function queryTigerLayer(
  layerUrl: string,
  where: string,
): Promise<Record<string, unknown> | null> {
  const url = new URL(layerUrl);
  url.searchParams.set('where', where);
  url.searchParams.set('outFields', 'BASENAME,NAME,STATE,GEOID');
  url.searchParams.set('returnGeometry', 'true');
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('f', 'geojson');

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Census HTTP ${res.status}`);
  const data = await res.json();
  const features = data?.features ?? [];
  return features.length > 0 ? features[0].geometry : null;
}
