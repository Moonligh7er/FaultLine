// Supabase Edge Function: setup-resend-receiving (admin, cron-secret only)
//
// Sets up inbound replies using the Resend key stored as a Supabase secret,
// so the key never leaves Supabase:
//   {"action":"diagnose"} → whether RESEND_API_KEY is set, and what Resend says
//   {"action":"domain"}   → create/find replies.fault-line.dev with receiving
//                           enabled; returns its DNS records (public values)
//   {"action":"verify"}   → trigger verification; returns record statuses
//   {"action":"webhook"}  → ensure email.received webhook → inbound-email
// Responses never include key material.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
// One Full-access key (RESEND_API_KEY) both sends and reads replies.
const KEY = (Deno.env.get('RESEND_API_KEY') || '').trim();
const DOMAIN = 'replies.fault-line.dev';
const WEBHOOK = `${SUPABASE_URL}/functions/v1/inbound-email`;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function findDomain() {
  const list = await api('GET', '/domains');
  const hit = (list.data?.data ?? []).find((d: { name: string }) => d.name === DOMAIN);
  return hit ? (await api('GET', `/domains/${hit.id}`)).data : null;
}

const records = (d: any) =>
  (d?.records ?? []).map((r: any) => ({ record: r.record, type: r.type, name: r.name, value: r.value, priority: r.priority, status: r.status }));

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = req.headers.get('x-cron-secret');
  const { data: ok } = secret ? await admin.rpc('verify_cron_secret', { p_secret: secret }) : { data: false };
  if (ok !== true) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const { action } = body ?? {};

  if (action === 'diagnose') {
    const domains = await api('GET', '/domains');
    const recv = await api('GET', '/emails/receiving/00000000-0000-0000-0000-000000000000');
    return json({
      key_set: !!KEY,
      list_domains_status: domains.status,
      list_domains_message: domains.data?.message ?? null,
      domains: (domains.data?.data ?? []).map((d: any) => ({ name: d.name, status: d.status, capabilities: d.capabilities })),
      receiving_probe_status: recv.status,
      receiving_probe_message: recv.data?.message ?? null,
    });
  }

  if (action === 'domain') {
    let d = await findDomain();
    if (!d) {
      const created = await api('POST', '/domains', { name: DOMAIN, capabilities: { sending: 'disabled', receiving: 'enabled' } });
      if (created.status >= 300) return json({ step: 'create domain', status: created.status, message: created.data?.message }, 502);
      d = created.data;
    }
    return json({ id: d.id, status: d.status, capabilities: d.capabilities, records: records(d) });
  }

  if (action === 'verify') {
    const d = await findDomain();
    if (!d) return json({ error: 'domain not created yet' }, 400);
    const v = await api('POST', `/domains/${d.id}/verify`);
    const after = await findDomain();
    return json({ verify_status: v.status, domain_status: after?.status, records: records(after) });
  }

  if (action === 'enable-existing') {
    // Turn on receiving for an existing verified domain (no new domain slot).
    const list = await api('GET', '/domains');
    const hit = (list.data?.data ?? []).find((d: { name: string }) => d.name === 'fault-line.dev');
    if (!hit) return json({ error: 'fault-line.dev not in Resend' }, 404);
    if (body?.verify === true) {
      const v = await api('POST', `/domains/${hit.id}/verify`);
      const after = (await api('GET', `/domains/${hit.id}`)).data;
      return json({ verify_status: v.status, domain_status: after?.status, capabilities: after?.capabilities, records: records(after) });
    }
    const before = (await api('GET', `/domains/${hit.id}`)).data;
    if (body?.apply !== true) return json({ preview: true, capabilities: before?.capabilities, records: records(before) });
    const upd = await api('PATCH', `/domains/${hit.id}`, { capabilities: { sending: 'enabled', receiving: 'enabled' } });
    const after = (await api('GET', `/domains/${hit.id}`)).data;
    return json({ update_status: upd.status, update_message: upd.data?.message ?? null, capabilities: after?.capabilities, records: records(after) });
  }

  if (action === 'test-receive') {
    // Sends one email to replies@fault-line.dev; it should come back through
    // the email.received webhook and land in inbound_messages.
    const from = Deno.env.get('FROM_EMAIL') || 'reports@fault-line.dev';
    const sent = await api('POST', '/emails', {
      from: `Fault Line receiving test <${from}>`, to: ['replies@fault-line.dev'],
      subject: 'Fault Line receiving test', text: 'Automated check that replies reach Fault Line. Safe to ignore.',
    });
    return json({ send_status: sent.status, id: sent.data?.id ?? null, message: sent.data?.message ?? null });
  }

  if (action === 'webhook') {
    const list = await api('GET', '/webhooks');
    if (list.status >= 300) return json({ step: 'list webhooks', status: list.status, message: list.data?.message }, 502);
    const existing = (list.data?.data ?? []).find((w: any) => w.endpoint === WEBHOOK);
    if (existing) return json({ webhook: 'exists', id: existing.id, events: existing.events });
    const created = await api('POST', '/webhooks', { endpoint: WEBHOOK, events: ['email.received'] });
    if (created.status >= 300) return json({ step: 'create webhook', status: created.status, message: created.data?.message }, 502);
    return json({ webhook: 'created', id: created.data?.id });
  }

  return json({ error: 'action must be diagnose | domain | verify | webhook' }, 400);
});
