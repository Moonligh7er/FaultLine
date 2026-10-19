// Supabase Edge Function: import-road-ownership
//
// Loads state-owned road centerlines into road_segments so
// find_authority_by_point() can route roadway reports to the road's owner
// instead of the town the point happens to fall in (migration 030).
//
// Sources (public ArcGIS services published by the road owners themselves):
//   massdot_ri — MassDOT Road Inventory, Jurisdictn '1' (MassDOT) and '3' (DCR)
//   fdot_shs   — FDOT "Active On the State Highway System" (RCI feature 140)
//
// Resumable: pages by OBJECTID with a cursor in road_import_state, stops at a
// time budget and picks up on the next call. A finished source is skipped
// until it is 30 days old, so the daily cron is cheap. When a run completes,
// segments the source no longer lists are deleted.
//
// Manually invoked:
//   curl -X POST https://dzewklljiksyivsfpunt.supabase.co/functions/v1/import-road-ownership \
//     -H "Content-Type: application/json" \
//     -H "x-cron-secret: <vault secret 'cron_secret'>" \
//     -d '{"source": "fdot_shs", "force": true}'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const TIME_BUDGET_MS = 110_000;
const REFRESH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

interface Source {
  url: string;
  where: string;
  outFields: string;
  pageSize: number;
  toRow: (p: Record<string, unknown>) => { owner: string; street?: unknown; route?: unknown; district?: unknown };
}

const SOURCES: Record<string, Source> = {
  massdot_ri: {
    url: 'https://gis.massdot.state.ma.us/arcgis/rest/services/Roads/RoadInventory/MapServer/0/query',
    where: "Jurisdictn IN ('1','3')",
    outFields: 'OBJECTID,Jurisdictn,St_Name,route_id,Hwy_Dist',
    pageSize: 1000,
    toRow: (p) => ({ owner: String(p.Jurisdictn), street: p.St_Name, route: p.route_id, district: p.Hwy_Dist }),
  },
  fdot_shs: {
    url: 'https://services1.arcgis.com/O1JpcwDW8sjYuddV/ArcGIS/rest/services/On_System_TDA/FeatureServer/0/query',
    where: '1=1',
    outFields: 'OBJECTID,ROADWAY,DISTRICT,MNG_DIST',
    pageSize: 200,
    // Managing district 8 is Florida's Turnpike Enterprise.
    toRow: (p) => ({ owner: String(p.MNG_DIST) === '8' ? 'TURNPIKE' : 'SHS', route: p.ROADWAY, district: p.DISTRICT }),
  },
};

async function isCronCaller(req: Request): Promise<boolean> {
  const secret = req.headers.get('x-cron-secret');
  if (!secret) return false;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data, error } = await admin.rpc('verify_cron_secret', { p_secret: secret });
  return !error && data === true;
}

async function fetchPage(src: Source, afterId: number) {
  const url = new URL(src.url);
  url.searchParams.set('where', `(${src.where}) AND OBJECTID > ${afterId}`);
  url.searchParams.set('outFields', src.outFields);
  url.searchParams.set('orderByFields', 'OBJECTID');
  url.searchParams.set('resultRecordCount', String(src.pageSize));
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('maxAllowableOffset', '0.00001'); // ~1 m
  url.searchParams.set('geometryPrecision', '6');
  url.searchParams.set('f', 'geojson');
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`source HTTP ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(`source error: ${JSON.stringify(data.error).slice(0, 200)}`);
  return (data?.features ?? []) as Array<{ id?: number; properties: Record<string, unknown>; geometry: unknown }>;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!(await isCronCaller(req))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const started = Date.now();
  const params = await req.json().catch(() => ({}));
  const only: string | undefined = params.source;
  const force = params.force === true;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const report: Record<string, unknown> = {};

  for (const [name, src] of Object.entries(SOURCES)) {
    if (only && only !== name) continue;
    if (Date.now() - started > TIME_BUDGET_MS) { report[name] = 'deferred (time budget)'; continue; }

    const { data: state } = await supabase.from('road_import_state').select('*').eq('source', name).single();
    if (!state) { report[name] = 'no state row'; continue; }

    let { status, cursor_id: cursor, run_started_at: runStartedAt } = state;
    const fresh = state.last_completed_at &&
      Date.now() - new Date(state.last_completed_at).getTime() < REFRESH_AFTER_MS;
    if (status === 'idle') {
      if (fresh && !force) { report[name] = 'fresh'; continue; }
      status = 'running';
      cursor = 0;
      runStartedAt = new Date().toISOString();
      await supabase.from('road_import_state')
        .update({ status, cursor_id: 0, run_started_at: runStartedAt, last_error: null, updated_at: runStartedAt })
        .eq('source', name);
    }

    let imported = 0;
    try {
      while (Date.now() - started < TIME_BUDGET_MS) {
        const features = await fetchPage(src, cursor);
        if (features.length === 0) {
          const { data: removed, error } = await supabase.rpc('finalize_road_import', {
            p_source: name, p_run_started_at: runStartedAt,
          });
          if (error) throw new Error(error.message);
          const { count } = await supabase.from('road_segments')
            .select('id', { count: 'exact', head: true }).eq('source', name);
          const now = new Date().toISOString();
          await supabase.from('road_import_state').update({
            status: 'idle', cursor_id: 0, last_completed_at: now, last_count: count ?? null, updated_at: now,
          }).eq('source', name);
          report[name] = { done: true, imported_this_call: imported, removed_stale: removed, total: count };
          break;
        }
        const rows = features.map((f) => {
          const id = Number(f.properties.OBJECTID ?? f.id);
          return { id: String(id), geometry: f.geometry, ...src.toRow(f.properties) };
        });
        const { data: n, error } = await supabase.rpc('import_road_segments', { p_source: name, p_features: rows });
        if (error) throw new Error(error.message);
        imported += n ?? 0;
        cursor = Math.max(...rows.map((r) => Number(r.id)));
        await supabase.from('road_import_state')
          .update({ cursor_id: cursor, updated_at: new Date().toISOString() }).eq('source', name);
      }
      if (!report[name]) report[name] = { done: false, imported_this_call: imported, cursor };
    } catch (err) {
      await supabase.from('road_import_state')
        .update({ last_error: String(err).slice(0, 500), updated_at: new Date().toISOString() }).eq('source', name);
      report[name] = { error: String(err), imported_this_call: imported, cursor };
    }
  }

  return new Response(JSON.stringify({ elapsed_ms: Date.now() - started, sources: report }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
