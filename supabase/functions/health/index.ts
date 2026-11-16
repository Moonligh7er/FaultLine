// Supabase Edge Function: health
// Public, no-auth status summary for uptime monitors.
//
// Public response (no secret): only the overall state and a warning count.
//   200 { ok: true,  status: 'ok' | 'degraded', warning_count }
//       database reachable and last pipeline test passed within 26h
//       ('degraded' = passed, but with warnings)
//   503 { ok: false, status: 'down', warning_count }  otherwise (monitor should alert)
// With a valid x-cron-secret the response also carries the detailed checks
// (database, pipeline step, timestamps) and the warning texts.

import { createClient } from 'npm:@supabase/supabase-js@2.103.0';

const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
const MAX_PIPELINE_AGE_MS = 26 * 3600_000;

async function isCronCaller(req: Request): Promise<boolean> {
  const secret = req.headers.get('x-cron-secret');
  if (!secret) return false;
  const { data, error } = await admin.rpc('verify_cron_secret', { p_secret: secret });
  return !error && data === true;
}

Deno.serve(async (req) => {
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
  const rawWarnings =
    ((data?.steps ?? []) as { step: string; detail?: unknown }[]).find((s) => s.step === 'warnings')?.detail ?? [];
  const warnings = Array.isArray(rawWarnings) ? rawWarnings : [];
  const status = !ok ? 'down' : warnings.length > 0 ? 'degraded' : 'ok';

  const body: Record<string, unknown> = { ok, status, warning_count: warnings.length };
  if (await isCronCaller(req)) {
    body.database = database;
    body.pipeline = data
      ? { ok: data.ok, failed_step: data.failed_step, at: data.created_at, fresh: pipelineFresh, duration_ms: data.duration_ms }
      : null;
    body.warnings = warnings;
  }

  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
  });
});
