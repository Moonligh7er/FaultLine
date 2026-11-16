// Supabase Edge Function: pipeline-smoke
// Daily synthetic test of Fault Line's core path, against production:
//
//   1. anonymous report insert (anon key → RLS + clustering trigger)
//   2. cluster created and linked
//   3. cluster made escalation-ready → escalate-clusters queues it
//   4. queued message approved → dispatch-outbound sends it by email
//   5. outbox marked sent, escalation_log row with [FL-XXXXXX] subject
//   6. a reply is recorded and applied → cluster + report resolved
//   7. inbound-email rejects an unsigned webhook (and Resend key can read inbound)
//   8. SeeClickFix personal access token present and accepted (read-only)
//
// The only recipient is Resend's test sink (delivered@resend.dev) via a
// throwaway authority, so no real authority is ever contacted. Every row the
// test creates is recorded by id in public.smoke_artifacts (migration 041)
// before or right after it is created, and cleanup deletes only those ids
// (at the end, and leftovers from a crashed run at the start). Nothing is
// ever selected by marker text, and a cluster is never deleted (or modified)
// if it holds any report the test didn't create. Results go to
// public.health_checks (migration 029).

import { createClient } from 'npm:@supabase/supabase-js@2.103.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_KEY = (Deno.env.get('RESEND_API_KEY') || '').trim();
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
type Kind = 'authority' | 'report' | 'cluster' | 'outbound' | 'escalation' | 'inbound';

/** Records an id this run created, so cleanup can remove exactly it. Throws if it can't be recorded. */
async function track(kind: Kind, id: string): Promise<void> {
  const { error } = await admin.from('smoke_artifacts').upsert({ kind, id }, { onConflict: 'kind,id', ignoreDuplicates: true });
  if (error) throw new Error(`could not record ${kind} artifact: ${error.message}`);
}

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

  // Sandbox mode (migration 037) redirects delivery; the test still runs end
  // to end but expects sandbox results, and health warns while it's on.
  const { data: sandboxSetting } = await admin.rpc('get_setting', { p_key: 'sandbox_mode' });
  const sandbox = sandboxSetting === true;
  if (sandbox) warnings.push('SANDBOX MODE IS ON: no report reaches a real authority until it is turned off (admin queue)');

  const reportId = crypto.randomUUID();
  const authorityId = crypto.randomUUID();
  let clusterId = '';
  let outboundId = '';
  let ref = '';

  // Ids are generated here and recorded before the insert, so a crash at any
  // point still leaves cleanup an exact list.
  await step('create test authority', async () => {
    await track('authority', authorityId);
    const { error } = await admin.from('authorities').insert({
      id: authorityId, name: MARKER, level: 'city', state: 'MA', city: 'Smoketest', is_active: true,
      submission_methods: [{ method: 'email', endpoint: SINK, priority: 1 }],
    });
    must(!error, `authority insert: ${error?.message}`);
  });

  await step('anonymous report insert (RLS + trigger)', async () => {
    await track('report', reportId);
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
    // Only a cluster made of nothing but this run's report is ours to change
    // or delete. If the report joined a real cluster, stop here.
    const { data: members, error } = await admin.from('cluster_reports').select('report_id').eq('cluster_id', data!.cluster_id);
    must(!error, `cluster members: ${error?.message}`);
    must((members ?? []).every((m: { report_id: string }) => m.report_id === reportId),
      'test report joined an existing cluster; refusing to modify it');
    clusterId = data!.cluster_id;
    await track('cluster', clusterId);
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
    await track('outbound', outboundId);
    must(['pending_review', 'approved'].includes(data!.status), `unexpected outbox status ${data!.status}`);
    return { ref, status: data!.status };
  });

  await step('approve + dispatch-outbound sends', async () => {
    await admin.from('outbound_messages')
      .update({ status: 'approved', reviewed_by: 'pipeline-smoke', reviewed_at: new Date().toISOString() })
      .eq('id', outboundId).eq('status', 'pending_review');
    const res = await fetch(`${FN}/dispatch-outbound`, { method: 'POST', headers: cronHeader, body: '{}' });
    must(res.ok, `dispatch-outbound HTTP ${res.status}`);
    let row: { status: string; sent_method: string | null; sent_recipient: string | null; external_id: string | null; error: string | null } | null = null;
    for (let i = 0; i < 10; i++) {
      const { data } = await admin.from('outbound_messages').select('status, sent_method, sent_recipient, external_id, error').eq('id', outboundId).single();
      row = data;
      if (row && row.status !== 'approved' && row.status !== 'sending') break;
      await sleep(1000);
    }
    must(row?.status === 'sent', `outbox status ${row?.status}: ${row?.error ?? ''}`);
    if (sandbox) {
      must(row?.sent_method === 'sandbox:email', `sandbox sent via ${row?.sent_method}`);
    } else {
      must(row?.sent_recipient === SINK, `sent to ${row?.sent_recipient}`);
    }
    must(row?.external_id, 'no Resend message id recorded');
  });

  await step('escalation_log records tagged notice', async () => {
    const { data } = await admin.from('escalation_log').select('id, subject, status').eq('cluster_id', clusterId);
    for (const e of data ?? []) await track('escalation', e.id);
    if (sandbox) {
      must(!data || data.length === 0, 'sandbox wrote to escalation_log (public record)');
      return 'sandbox: correctly not recorded';
    }
    must(data && data.length === 1, `expected 1 escalation_log row, got ${data?.length}`);
    must(data![0].subject?.startsWith(`[${ref}] `), `subject missing tag: ${data![0].subject}`);
  });

  await step('reply applied → cluster + report resolved', async () => {
    const inboundId = crypto.randomUUID();
    await track('inbound', inboundId);
    const { data: inbound, error } = await admin.from('inbound_messages').insert({
      id: inboundId, resend_email_id: `smoke-${reportId}`, from_address: 'smoke@example.gov', subject: `Re: [${ref}]`,
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

  await step('inbound-email rejects unsigned webhook', async () => {
    const res = await fetch(`${FN}/inbound-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email.received', data: { email_id: '00000000-0000-0000-0000-000000000000' } }),
    });
    await res.body?.cancel();
    must(res.status === 401, `expected 401, got ${res.status}`);
    const { data: hasSecret } = await admin.rpc('get_resend_webhook_secret');
    if (!hasSecret) warnings.push('Inbound replies rejected: Resend webhook signing secret not stored (setup-resend-receiving store-webhook-secret)');
    // Read-only probe: can the Resend key read received mail? 404 = yes.
    const probe = await fetch('https://api.resend.com/emails/receiving/00000000-0000-0000-0000-000000000000', {
      headers: { Authorization: `Bearer ${RESEND_KEY}` },
    });
    await probe.body?.cancel();
    if (probe.status === 401 || probe.status === 403) {
      warnings.push('Inbound replies not readable: RESEND_API_KEY must be a Full-access key');
      return 'warning';
    }
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

/**
 * Removes exactly the rows recorded in smoke_artifacts (this run's, plus
 * leftovers from a crashed run). Rows that reference a test cluster (outbox,
 * escalation_log, replies) are deleted only when that cluster holds nothing
 * but test reports. A cluster holding any other report is never deleted.
 */
async function cleanup(): Promise<boolean> {
  const { data: rows, error } = await admin.from('smoke_artifacts').select('kind, id');
  if (error) return false;
  const ids = (k: Kind) => (rows ?? []).filter((r: { kind: string }) => r.kind === k).map((r: { id: string }) => r.id);
  const reportIds = ids('report');
  const ownReports = new Set(reportIds);

  // Clusters: ours only if every member report is a recorded test report.
  const safeClusters: string[] = [];
  const foreignClusters: string[] = [];
  for (const c of ids('cluster')) {
    const { data: members, error: mErr } = await admin.from('cluster_reports').select('report_id').eq('cluster_id', c);
    if (mErr) return false;
    ((members ?? []).every((m: { report_id: string }) => ownReports.has(m.report_id)) ? safeClusters : foreignClusters).push(c);
  }

  let ok = true;
  const del = async (table: string, col: string, list: string[]) => {
    if (!list.length) return;
    const { error: e } = await admin.from(table).delete().in(col, list);
    if (e) { ok = false; console.error(`smoke cleanup ${table}: ${e.message}`); }
  };

  await del('inbound_messages', 'id', ids('inbound'));
  await del('escalation_log', 'id', ids('escalation'));
  await del('outbound_messages', 'id', ids('outbound'));
  if (safeClusters.length) {
    // Rows other functions created for a test-only cluster before this run could record them.
    await del('inbound_messages', 'cluster_id', safeClusters);
    await del('escalation_log', 'cluster_id', safeClusters);
    await del('outbound_messages', 'cluster_id', safeClusters);
  }
  await del('reports', 'id', reportIds);
  await del('report_clusters', 'id', safeClusters);
  await del('authorities', 'id', ids('authority'));
  if (!ok) return false;

  // Forget what is gone. A foreign cluster is left in place and forgotten
  // (it is real data); everything else must actually be deleted.
  const groups: [Kind, string, string[]][] = [
    ['inbound', 'inbound_messages', ids('inbound')], ['escalation', 'escalation_log', ids('escalation')],
    ['outbound', 'outbound_messages', ids('outbound')], ['report', 'reports', reportIds],
    ['cluster', 'report_clusters', safeClusters], ['authority', 'authorities', ids('authority')],
  ];
  for (const [kind, table, list] of groups) {
    if (!list.length) continue;
    const { count, error: cErr } = await admin.from(table).select('id', { count: 'exact', head: true }).in('id', list);
    if (cErr || (count ?? 0) > 0) { ok = false; continue; }
    await admin.from('smoke_artifacts').delete().eq('kind', kind).in('id', list);
  }
  if (foreignClusters.length) {
    console.error(`smoke cleanup: left ${foreignClusters.length} cluster(s) holding non-test reports in place`);
    await admin.from('smoke_artifacts').delete().eq('kind', 'cluster').in('id', foreignClusters);
  }
  return ok;
}
