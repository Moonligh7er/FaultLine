// Supabase Edge Function: dispatch-outbound
// The ONLY place Fault Line sends anything to an authority.
//
// Sends rows from public.outbound_messages that are 'approved' (by an admin
// in /admin/queue, or automatically when app_settings.auto_send is on).
// Triggered by review_outbound() on approval and by a 10-minute cron sweep.
//
// Per row, submission methods are tried in priority order — city API
// (Open311 / SeeClickFix) → email (Resend) → web form (Modal worker, else
// queued for manual submission). Email subjects carry the row's [FL-XXXXXX]
// ref so inbound replies can be matched back (inbound-email function).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev';
const ENV_REPLY_TO = Deno.env.get('REPLY_TO') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const OPEN311_JURISDICTION_ID = Deno.env.get('OPEN311_JURISDICTION_ID') || '';
const OPEN311_API_KEY = Deno.env.get('OPEN311_API_KEY') || '';
const SEECLICKFIX_API_KEY = Deno.env.get('SEECLICKFIX_API_KEY') || '';
const WEB_FORM_WORKER_URL = Deno.env.get('WEB_FORM_WORKER_URL') || '';
const WEB_FORM_WORKER_SECRET = Deno.env.get('WEB_FORM_WORKER_SECRET') || '';

const BATCH = 20;

interface SubmissionMethod {
  method: 'api' | 'email' | 'web_form' | 'phone';
  endpoint: string;
  priority?: number;
  protocol?: string;
}

/** Structured data for API submissions (built when the row is created). */
interface ApiPayload {
  category: string;
  address: string | null;
  latitude: number;
  longitude: number;
  api_description: string;
  image_url?: string | null;
  cluster_id?: string | null;
}

interface OutboundRow {
  id: string;
  ref: string;
  kind: 'cluster_escalation' | 'report_submission';
  cluster_id: string | null;
  report_id: string | null;
  authority_id: string | null;
  methods: SubmissionMethod[];
  subject: string;
  body: string;
  payload: ApiPayload;
}

interface Sent {
  method: string;
  recipient: string;
  ticketId?: string;
  messageId?: string;
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// x-cron-secret is checked against Vault via verify_cron_secret()
// (migration 024), so rotating the secret never needs a redeploy.
async function isCronCaller(req: Request): Promise<boolean> {
  const secret = req.headers.get('x-cron-secret');
  if (!secret) return false;
  const { data, error } = await admin.rpc('verify_cron_secret', { p_secret: secret });
  return !error && data === true;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!(await isCronCaller(req))) return json({ error: 'Unauthorized' }, 401);

  // Claim a batch: approved → sending. A concurrent run only gets rows still 'approved'.
  const { data: candidates } = await admin
    .from('outbound_messages')
    .select('id')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
    .limit(BATCH);
  const ids = (candidates ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return json({ message: 'Nothing to dispatch', count: 0 });

  const { data: claimed, error: claimError } = await admin
    .from('outbound_messages')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .in('id', ids)
    .eq('status', 'approved')
    .select('id, ref, kind, cluster_id, report_id, authority_id, methods, subject, body, payload');
  if (claimError) return json({ error: claimError.message }, 500);

  const { data: replySetting } = await admin.rpc('get_setting', { p_key: 'reply_to' });
  const replyTo = typeof replySetting === 'string' && replySetting ? replySetting : ENV_REPLY_TO;

  const results: Record<string, unknown>[] = [];
  for (const row of (claimed ?? []) as OutboundRow[]) {
    const subject = `[${row.ref}] ${row.subject}`;
    const attempts: string[] = [];
    const sent = await deliver(row, subject, replyTo, attempts);
    const now = new Date().toISOString();

    if (!sent) {
      await admin.from('outbound_messages').update({
        status: 'failed',
        error: row.methods.length === 0 ? 'No submission methods' : 'All submission methods failed',
        attempts,
        updated_at: now,
      }).eq('id', row.id);
      results.push({ ref: row.ref, status: 'failed', attempts });
      continue;
    }

    await admin.from('outbound_messages').update({
      status: 'sent',
      sent_method: sent.method,
      sent_recipient: sent.recipient,
      external_id: sent.ticketId ?? sent.messageId ?? null,
      attempts,
      sent_at: now,
      updated_at: now,
    }).eq('id', row.id);

    await recordInEscalationLog(row, sent, subject);
    results.push({ ref: row.ref, status: 'sent', method: sent.method, recipient: sent.recipient });
  }

  return json({ message: 'Dispatch complete', results });
});

async function deliver(
  row: OutboundRow,
  subject: string,
  replyTo: string,
  attempts: string[],
): Promise<Sent | null> {
  for (const m of prioritizeMethods(row.methods ?? [])) {
    try {
      if (m.method === 'api') {
        const r = await submitViaApi(m, row.payload);
        if (r.ok) return { method: `api:${m.protocol || 'unknown'}`, recipient: m.endpoint, ticketId: r.ticketId };
        attempts.push(`api:${m.protocol}: ${r.error}`);
      } else if (m.method === 'email') {
        const res = await sendEmail(m.endpoint, subject, row.body, replyTo);
        if (res.ok) {
          const body = await res.json().catch(() => null);
          return { method: 'email', recipient: m.endpoint, messageId: body?.id as string | undefined };
        }
        attempts.push(`email → ${m.endpoint}: ${res.status} ${await res.text().catch(() => 'unknown')}`);
      } else if (m.method === 'web_form') {
        if (WEB_FORM_WORKER_URL && WEB_FORM_WORKER_SECRET) {
          const w = await submitViaBrowser(m.endpoint, subject, row.body, replyTo);
          if (w.ok) return { method: `web_form_auto:${w.adapter}`, recipient: m.endpoint };
          attempts.push(`web_form_auto(${w.adapter}): ${w.error}`);
        }
        attempts.push(`web_form: queued for manual submission at ${m.endpoint}`);
        return { method: 'web_form_manual', recipient: m.endpoint };
      }
    } catch (err) {
      attempts.push(`${m.method}: ${String(err)}`);
    }
  }
  return null;
}

/** escalation_log is the public record of notice (and feeds the bounce webhook + status sync). */
async function recordInEscalationLog(row: OutboundRow, sent: Sent, subject: string) {
  const clusterId = row.cluster_id ?? row.payload?.cluster_id ?? null;
  if (!clusterId) return; // escalation_log.cluster_id is NOT NULL

  if (row.kind === 'cluster_escalation') {
    await admin.rpc('escalate_cluster', {
      p_cluster_id: clusterId,
      p_method: sent.method,
      p_recipient: sent.recipient,
      p_subject: subject,
      p_body: row.body,
    });
    const patch: Record<string, unknown> = {};
    if (sent.ticketId) patch.external_ticket_id = sent.ticketId;
    if (sent.messageId) patch.external_message_id = sent.messageId;
    if (Object.keys(patch).length > 0) {
      await admin.from('escalation_log').update(patch)
        .eq('cluster_id', clusterId)
        .eq('method', sent.method)
        .is(sent.ticketId ? 'external_ticket_id' : 'external_message_id', null);
    }
    return;
  }

  await admin.from('escalation_log').insert({
    cluster_id: clusterId,
    authority_id: row.authority_id,
    method: sent.method,
    recipient: sent.recipient,
    subject,
    body: row.body,
    status: 'sent',
    sent_at: new Date().toISOString(),
    external_ticket_id: sent.ticketId ?? null,
    external_message_id: sent.messageId ?? null,
  });
}

async function sendEmail(to: string, subject: string, body: string, replyTo: string): Promise<Response> {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Fault Line Community Reports <${FROM_EMAIL}>`,
      to: [to],
      subject,
      text: body,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
}

/** Explicit priority first, then api > email > web_form. Phone is never automated. */
function prioritizeMethods(methods: SubmissionMethod[]): SubmissionMethod[] {
  const rank: Record<string, number> = { api: 1, email: 2, web_form: 3, phone: 99 };
  return [...methods].sort((a, b) => {
    if (a.priority !== undefined && b.priority !== undefined) return a.priority - b.priority;
    if (a.priority !== undefined) return -1;
    if (b.priority !== undefined) return 1;
    return (rank[a.method] ?? 100) - (rank[b.method] ?? 100);
  }).filter((m) => m.method !== 'phone' && typeof m.endpoint === 'string' && m.endpoint);
}

async function submitViaApi(
  method: SubmissionMethod,
  p: ApiPayload,
): Promise<{ ok: boolean; error?: string; ticketId?: string }> {
  const protocol = (method.protocol || '').toLowerCase();
  if (protocol === 'open311' || method.endpoint.includes('open311')) return submitOpen311(method, p);
  if (protocol === 'seeclickfix' || method.endpoint.includes('seeclickfix.com')) return submitSeeClickFix(method, p);
  return { ok: false, error: `Unknown API protocol: ${protocol || method.endpoint}` };
}

/** Open311 GeoReport v2 POST /requests.json — http://wiki.open311.org/GeoReport_v2/ */
async function submitOpen311(
  method: SubmissionMethod,
  p: ApiPayload,
): Promise<{ ok: boolean; error?: string; ticketId?: string }> {
  // Cities publish their own service_codes; this is a best-effort mapping.
  const serviceCodeMap: Record<string, string> = {
    pothole: 'pothole', streetlight: 'streetlight', sidewalk: 'sidewalk', signage: 'sign_damage',
    drainage: 'drainage', graffiti: 'graffiti', road_debris: 'road_debris', water_main: 'water_main',
    sewer: 'sewer', bridge: 'bridge', fallen_tree: 'tree_down', snow_ice: 'snow_ice',
  };
  const body = new URLSearchParams();
  body.append('service_code', serviceCodeMap[p.category] || p.category);
  body.append('lat', String(p.latitude));
  body.append('long', String(p.longitude));
  if (p.address) body.append('address_string', p.address);
  body.append('description', p.api_description);
  if (p.image_url) body.append('media_url', p.image_url);
  if (OPEN311_API_KEY) body.append('api_key', OPEN311_API_KEY);
  if (OPEN311_JURISDICTION_ID) body.append('jurisdiction_id', OPEN311_JURISDICTION_ID);

  try {
    const res = await fetch(method.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return { ok: false, error: `Open311 HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}` };
    const j = await res.json().catch(() => null);
    return { ok: true, ticketId: j?.[0]?.service_request_id || j?.[0]?.token || j?.service_request_id || undefined };
  } catch (err) {
    return { ok: false, error: `Open311 network error: ${String(err)}` };
  }
}

/** SeeClickFix v2 POST /issues (form-encoded; anonymous submissions identify via user[name]/user[email]). */
async function submitSeeClickFix(
  method: SubmissionMethod,
  p: ApiPayload,
): Promise<{ ok: boolean; error?: string; ticketId?: string }> {
  const body = new URLSearchParams();
  body.append('summary', `${p.category.replace(/_/g, ' ')} at ${p.address || `${p.latitude}, ${p.longitude}`}`);
  body.append('description', p.api_description);
  body.append('address', p.address || '');
  body.append('lat', String(p.latitude));
  body.append('lng', String(p.longitude));
  body.append('user[name]', 'Fault Line Community Reports');
  body.append('user[email]', ENV_REPLY_TO || FROM_EMAIL);
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (SEECLICKFIX_API_KEY) headers.Authorization = `Bearer ${SEECLICKFIX_API_KEY}`;

  try {
    const res = await fetch(method.endpoint, { method: 'POST', headers, body });
    if (!res.ok) return { ok: false, error: `SeeClickFix HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}` };
    const j = await res.json().catch(() => null);
    return { ok: true, ticketId: j?.id ? String(j.id) : undefined };
  } catch (err) {
    return { ok: false, error: `SeeClickFix network error: ${String(err)}` };
  }
}

/** Modal-hosted Playwright worker that fills + submits a web form. */
async function submitViaBrowser(
  url: string,
  subject: string,
  body: string,
  replyTo: string,
): Promise<{ ok: boolean; adapter?: string; error?: string }> {
  try {
    const res = await fetch(WEB_FORM_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WEB_FORM_WORKER_SECRET}` },
      body: JSON.stringify({ url, name: 'Fault Line Community Reports', email: replyTo || FROM_EMAIL, subject, message: body }),
    });
    if (!res.ok) return { ok: false, error: `worker HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}` };
    const j = await res.json().catch(() => null);
    return { ok: Boolean(j?.success), adapter: j?.adapter ?? 'unknown', error: j?.success ? undefined : j?.error || 'no confirmation marker' };
  } catch (err) {
    return { ok: false, error: `worker network error: ${String(err)}` };
  }
}
