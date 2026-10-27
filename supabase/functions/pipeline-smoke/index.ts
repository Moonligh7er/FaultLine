// Supabase Edge Function: pipeline-smoke
// Daily synthetic test of Fault Line's core path, against production:
//
//   1. anonymous report insert (anon key → RLS + clustering trigger)
//   2. cluster created and linked
//   3. cluster made escalation-ready → escalate-clusters queues it
//   4. queued message approved → dispatch-outbound sends it by email
//   5. outbox marked sent, escalation_log row with [FL-XXXXXX] subject
//   6. a reply is recorded and applied → cluster + report resolved
//   7. inbound-email rejects a forged webhook (and Resend key can read inbound)
//   8. SeeClickFix personal access token present and accepted (read-only)
//
// The only recipient is Resend's test sink (delivered@resend.dev) via a
// throwaway authority, so no real authority is ever contacted. Everything
// created is deleted at the end (and leftovers from a crashed run at the
// start). Results go to public.health_checks (migration 029).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const FN = `${SUPABASE_URL}/functions/v1`;

const MARKER = 'FAULT LINE SMOKE TEST';
const SINK = 'delivered@resend.dev';
// Open ocean east of Cape Cod — nothing real clusters here.
const LAT = 41.9;
const LNG = -69.4;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const anon = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });

async function isCronCaller(req: Request): Promise<boolean> {
  const secret = req.headers.get('x-cron-secret');
  if (!secret) return false;
  const { data, error } = await admin.rpc('verify_cron_secret', { p_secret: secret });
  return !error && data === true;
}

type Step = { step: string; ok: boolean; detail?: unknown; ms: number };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!(await isCronCaller(req))) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const cronHeader = { 'Content-Type': 'application/json', 'x-cron-secret': req.headers.get('x-cron-secret')! };

  const started = Date.now();
  const steps: Step[] = [];
  const warnings: string[] = [];
  let failed: string | null = null;

  async function step(name: string, fn: () => Promise<unknown>) {
    if (failed) return;
    const t = Date.now();
    try {
      const detail = await fn();
      steps.push({ step: name, ok: true, detail, ms: Date.now() - t });
    } catch (err) {
      failed = name;
      steps.push({ step: name, ok: false, detail: String(err instanceof Error ? err.message : err), ms: Date.now() - t });
    }
  }
  const must = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  await cleanup();

  const reportId = crypto.randomUUID();
  let authorityId = '';
  let clusterId = '';
  let outboundId = '';
  let ref = '';

  await step('create test authority', async () => {
    const { data, error } = await admin.from('authorities').insert({
      name: MARKER, level: 'city', state: 'MA', city: 'Smoketest', is_active: true,
      submission_methods: [{ method: 'email', endpoint: SINK, priority: 1 }],
    }).select('id').single();
    must(!error && data, `authority insert: ${error?.message}`);
    authorityId = data!.id;
  });

  await step('anonymous report insert (RLS + trigger)', async () => {
    const { error } = await anon.from('reports').insert({
      id: reportId, category: 'pothole', latitude: LAT, longitude: LNG,
      description: MARKER, hazard_level: 'dangerous', size_rating: 'large',
      is_anonymous: true, authority_id: authorityId, status: 'submitted', media: [],
    });
    must(!error, `insert as anon failed: ${error?.message}`);
  });

  await step('report clustered', async () => {
    const { data } = await admin.from('cluster_reports').select('cluster_id').eq('report_id', reportId).maybeSingle();
    must(data?.cluster_id, 'no cluster_reports row — clustering trigger did not run');
    clusterId = data!.cluster_id;
    return { clusterId };
  });

  await step('escalate-clusters queues the cluster', async () => {
    const { error } = await admin.from('report_clusters').update({
      status: 'confirmed', report_count: 10, unique_reporters: 3, authority_id: authorityId,
      first_reported_at: new Date(Date.now() - 31 * 86_400_000).toISOString(),
    }).eq('id', clusterId);
    must(!error, `cluster update: ${error?.message}`);
    const res = await fetch(`${FN}/escalate-clusters`, { method: 'POST', headers: cronHeader, body: '{}' });
    must(res.ok, `escalate-clusters HTTP ${res.status}`);
    const { data } = await admin.from('outbound_messages').select('id, ref, status').eq('cluster_id', clusterId).maybeSingle();
    must(data, 'no outbound message queued for the cluster');
    outboundId = data!.id; ref = data!.ref;
    must(['pending_review', 'approved'].includes(data!.status), `unexpected outbox status ${data!.status}`);
    return { ref, status: data!.status };
  });

  await step('approve + dispatch-outbound sends', async () => {
    await admin.from('outbound_messages')
      .update({ status: 'approved', reviewed_by: 'pipeline-smoke', reviewed_at: new Date().toISOString() })
      .eq('id', outboundId).eq('status', 'pending_review');
    const res = await fetch(`${FN}/dispatch-outbound`, { method: 'POST', headers: cronHeader, body: '{}' });
    must(res.ok, `dispatch-outbound HTTP ${res.status}`);
    let row: { status: string; sent_recipient: string | null; external_id: string | null; error: string | null } | null = null;
    for (let i = 0; i < 10; i++) {
      const { data } = await admin.from('outbound_messages').select('status, sent_recipient, external_id, error').eq('id', outboundId).single();
      row = data;
      if (row && row.status !== 'approved' && row.status !== 'sending') break;
      await sleep(1000);
    }
    must(row?.status === 'sent', `outbox status ${row?.status}: ${row?.error ?? ''}`);
    must(row?.sent_recipient === SINK, `sent to ${row?.sent_recipient}`);
    must(row?.external_id, 'no Resend message id recorded');
  });

  await step('escalation_log records tagged notice', async () => {
    const { data } = await admin.from('escalation_log').select('subject, status').eq('cluster_id', clusterId);
    must(data && data.length === 1, `expected 1 escalation_log row, got ${data?.length}`);
    must(data![0].subject?.startsWith(`[${ref}] `), `subject missing tag: ${data![0].subject}`);
  });

  await step('reply applied → cluster + report resolved', async () => {
    const { data: inbound, error } = await admin.from('inbound_messages').insert({
      resend_email_id: `smoke-${reportId}`, from_address: 'smoke@example.gov', subject: `Re: [${ref}]`,
      reply_excerpt: 'The pothole has been repaired.', ref, outbound_id: outboundId,
      cluster_id: clusterId, suggested_status: 'resolved', status: 'pending_review',
    }).select('id').single();
    must(!error && inbound, `inbound insert: ${error?.message}`);
    const { error: applyError } = await admin.rpc('apply_inbound_status', {
      p_inbound_id: inbound!.id, p_status: 'resolved', p_by: 'pipeline-smoke',
    });
    must(!applyError, `apply_inbound_status: ${applyError?.message}`);
    const { data: c } = await admin.from('report_clusters').select('status').eq('id', clusterId).single();
    const { data: r } = await admin.from('reports').select('status').eq('id', reportId).single();
    must(c?.status === 'resolved' && r?.status === 'resolved', `cluster=${c?.status} report=${r?.status}`);
  });

  await step('inbound-email rejects forged webhook', async () => {
    const res = await fetch(`${FN}/inbound-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email.received', data: { email_id: '00000000-0000-0000-0000-000000000000' } }),
    });
    const body = await res.json().catch(() => ({}));
    // 400 = Resend says no such email (key can read inbound) — healthy.
    // 502 "resend 401" = the Resend key can't read inbound mail yet: a known
    // setup gap, reported as a warning rather than an outage.
    if (res.status === 502 && body?.error === 'resend 401') {
      warnings.push('Inbound replies not readable: RESEND_API_KEY must be a Full-access key');
      return 'warning';
    }
    must(res.status === 400, `expected 400, got ${res.status} ${JSON.stringify(body)}`);
  });

  // Read-only: SeeClickFix rejects issue creation without a personal access
  // token, and most authorities route through it. Warn, don't fail.
  await step('SeeClickFix token', async () => {
    const token = Deno.env.get('SEECLICKFIX_API_KEY') || '';
    if (!token) {
      warnings.push('SeeClickFix submissions disabled: set SEECLICKFIX_API_KEY (personal access token)');
      return 'warning';
    }
    const res = await fetch('https://seeclickfix.com/api/v2/profile', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'Fault-Line/1.0 (+https://fault-line.dev)' },
    });
    if (!res.ok) {
      warnings.push(`SeeClickFix token rejected (HTTP ${res.status}) — renew SEECLICKFIX_API_KEY`);
      return 'warning';
    }
    return 'ok';
  });

  const cleaned = await cleanup();
  steps.push({ step: 'cleanup', ok: cleaned, ms: 0 });
  if (!cleaned && !failed) failed = 'cleanup';
  if (warnings.length) steps.push({ step: 'warnings', ok: true, detail: warnings, ms: 0 });

  const result = { ok: !failed, failed_step: failed, duration_ms: Date.now() - started };
  await admin.from('health_checks').insert({ check_name: 'pipeline', ...result, steps });
  return new Response(JSON.stringify({ ...result, steps }), {
    status: failed ? 500 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

/** Removes everything this test creates, including leftovers from a crashed run. */
async function cleanup(): Promise<boolean> {
  const { data: auths } = await admin.from('authorities').select('id').eq('name', MARKER);
  const authIds = (auths ?? []).map((a: { id: string }) => a.id);
  const { data: reps } = await admin.from('reports').select('id').eq('description', MARKER);
  const reportIds = (reps ?? []).map((r: { id: string }) => r.id);
  const { data: links } = reportIds.length
    ? await admin.from('cluster_reports').select('cluster_id').in('report_id', reportIds)
    : { data: [] };
  const clusterIds = [...new Set((links ?? []).map((l: { cluster_id: string }) => l.cluster_id))];

  if (clusterIds.length) {
    await admin.from('inbound_messages').delete().in('cluster_id', clusterIds);
    await admin.from('escalation_log').delete().in('cluster_id', clusterIds);
    await admin.from('outbound_messages').delete().in('cluster_id', clusterIds);
  }
  if (reportIds.length) await admin.from('reports').delete().in('id', reportIds);
  if (clusterIds.length) await admin.from('report_clusters').delete().in('id', clusterIds);
  if (authIds.length) await admin.from('authorities').delete().in('id', authIds);

  const { count: left } = await admin.from('reports').select('id', { count: 'exact', head: true }).eq('description', MARKER);
  const { count: leftAuth } = await admin.from('authorities').select('id', { count: 'exact', head: true }).eq('name', MARKER);
  return (left ?? 0) === 0 && (leftAuth ?? 0) === 0;
}
