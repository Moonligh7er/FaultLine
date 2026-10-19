// Supabase Edge Function: health
// Public, no-auth status summary for uptime monitors. Exposes only
// pass/fail and timestamps — no data, no secrets.
//
//   200 { ok: true, ... }   database reachable and last pipeline test passed within 26h
//   503 { ok: false, ... }  otherwise (monitor should alert)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
const MAX_PIPELINE_AGE_MS = 26 * 3600_000;

Deno.serve(async () => {
  const { data, error } = await admin
    .from('health_checks')
    .select('ok, failed_step, created_at, duration_ms, steps')
    .eq('check_name', 'pipeline')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const database = !error;
  const ageMs = data ? Date.now() - new Date(data.created_at).getTime() : null;
  const pipelineFresh = ageMs !== null && ageMs <= MAX_PIPELINE_AGE_MS;
  const ok = database && !!data?.ok && pipelineFresh;
  const warnings =
    ((data?.steps ?? []) as { step: string; detail?: unknown }[]).find((s) => s.step === 'warnings')?.detail ?? [];

  return new Response(
    JSON.stringify({
      ok,
      database,
      pipeline: data
        ? { ok: data.ok, failed_step: data.failed_step, at: data.created_at, fresh: pipelineFresh, duration_ms: data.duration_ms }
        : null,
      warnings,
    }),
    {
      status: ok ? 200 : 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
    },
  );
});
