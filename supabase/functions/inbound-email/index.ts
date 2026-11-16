// Supabase Edge Function: inbound-email
// Resend "email.received" webhook for replies to Fault Line outbound mail.
//
// Every request must carry a valid Resend (Svix) signature: svix-id,
// svix-timestamp (within 5 minutes) and svix-signature, an HMAC-SHA256 of
// `${id}.${timestamp}.${rawBody}` keyed with the webhook signing secret
// (Vault, stored by setup-resend-receiving). No stored secret = fail closed.
// Each svix-id is accepted once.
//
// The webhook only carries an email_id; the message itself is fetched from
// Resend's API with our key, so content always comes from Resend.
//
// Replies are matched to outbound_messages by the [FL-XXXXXX] subject tag,
// a status is suggested from the wording, and the reply is stored for admin
// review. When app_settings.auto_apply_replies is on, an 'acknowledged' or
// 'in_progress' suggestion is applied automatically, but only if the sender
// passed DMARC (Resend's receiving-server authentication results) and its
// domain matches an email domain we actually wrote to for that authority.
// A 'resolved'/'closed' suggestion is never auto-applied: an admin decides.

import { createClient } from 'npm:@supabase/supabase-js@2.103.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
// One Full-access Resend key both sends and reads received replies.
const RESEND_KEY = (Deno.env.get('RESEND_API_KEY') || '').trim();

const REF_RE = /\[?\b(FL-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6})\b\]?/;
const MAX_BODY = 20_000;
const MAX_WEBHOOK_BYTES = 256 * 1024; // email.received carries metadata only
const TOLERANCE_S = 300;
// Statuses a reply may set without a human looking at it.
const AUTO_APPLY_OK = new Set(['acknowledged', 'in_progress']);

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const svixId = req.headers.get('svix-id') ?? '';
  const svixTs = req.headers.get('svix-timestamp') ?? '';
  const svixSig = req.headers.get('svix-signature') ?? '';
  if (!svixId || !svixTs || !svixSig || svixId.length > 128) return json({ error: 'Unauthorized' }, 401);
  const ts = Number(svixTs);
  if (!/^\d{1,12}$/.test(svixTs) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_S) return json({ error: 'Unauthorized' }, 401);
  if (Number(req.headers.get('content-length') ?? '0') > MAX_WEBHOOK_BYTES) return json({ error: 'Payload too large' }, 413);
  const raw = await req.text();
  if (raw.length > MAX_WEBHOOK_BYTES) return json({ error: 'Payload too large' }, 413);

  const { data: secret, error: secretError } = await admin.rpc('get_resend_webhook_secret');
  if (secretError || typeof secret !== 'string' || !secret.startsWith('whsec_')) {
    console.error('inbound-email: webhook signing secret unavailable; rejecting');
    return json({ error: 'Webhook verification unavailable' }, 503); // Resend retries later
  }
  if (!(await validSignature(secret, svixId, svixTs, raw, svixSig))) return json({ error: 'Unauthorized' }, 401);

  // Replay guard: each signed delivery is processed once (released again if
  // we fail in a way that asks Resend to retry).
  const { data: fresh, error: dedupeError } = await admin.rpc('rate_limit_hit', {
    p_bucket: 'inbound_svix', p_key: svixId, p_max: 1, p_window_seconds: 86400,
  });
  if (dedupeError) {
    console.error('inbound-email: dedupe check failed', dedupeError.message);
    return json({ error: 'Temporary error' }, 503);
  }
  if (fresh !== true) return json({ duplicate: true });
  const retryLater = async (status: number, error: string) => {
    await releaseSvixId(svixId);
    return json({ error }, status);
  };

  let event: any = null;
  try { event = JSON.parse(raw); } catch { /* handled below */ }
  if (event?.type !== 'email.received') return json({ ignored: true });
  const emailId = event?.data?.email_id;
  if (typeof emailId !== 'string' || !/^[0-9a-zA-Z-]{8,64}$/.test(emailId)) return json({ error: 'bad email_id' }, 400);

  let email: any;
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${RESEND_KEY}` },
    });
    if (res.status === 404) return json({ error: 'unknown email' }, 400);
    if (!res.ok) {
      const detail = ((await res.json().catch(() => null))?.message ?? '').slice(0, 200);
      console.error(`inbound-email: resend ${res.status}`, detail);
      return retryLater(502, `resend ${res.status}`); // non-2xx → Resend retries
    }
    email = await res.json();
  } catch (err) {
    console.error('inbound-email: fetching the email failed', String(err));
    return retryLater(502, 'resend unreachable');
  }

  const subject: string = email.subject ?? '';
  const text: string = email.text || htmlToText(email.html || '');
  const from = parseAddress(email.from);
  const excerpt = stripQuoted(text).slice(0, 4000);
  const ref = subject.match(REF_RE)?.[1] ?? text.match(REF_RE)?.[1] ?? null;

  let outbound: { id: string; cluster_id: string | null; report_id: string | null; authority_id: string | null; sent_recipient: string | null } | null = null;
  if (ref) {
    const { data } = await admin
      .from('outbound_messages')
      .select('id, cluster_id, report_id, authority_id, sent_recipient')
      .eq('ref', ref)
      .maybeSingle();
    outbound = data;
  }

  const suggested = suggestStatus(excerpt);
  const { data: row, error } = await admin
    .from('inbound_messages')
    .insert({
      resend_email_id: emailId,
      from_address: from,
      to_addresses: Array.isArray(email.to) ? email.to.map(parseAddress) : null,
      subject,
      text_body: text.slice(0, MAX_BODY),
      reply_excerpt: excerpt,
      received_at: email.created_at ?? new Date().toISOString(),
      ref,
      outbound_id: outbound?.id ?? null,
      cluster_id: outbound?.cluster_id ?? null,
      report_id: outbound?.report_id ?? null,
      suggested_status: suggested,
      status: outbound ? 'pending_review' : 'unmatched',
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return json({ duplicate: true }); // webhook retry
    console.error('inbound-email: insert failed', error.code, error.message);
    return retryLater(500, 'Could not store reply');
  }

  // Resend's receiving server reports SPF/DKIM/DMARC; only a DMARC pass
  // means the From domain is really the sender's.
  const dmarcPass = email?.authentication?.dmarc === 'pass';
  let applied = false;
  if (outbound && suggested && from && AUTO_APPLY_OK.has(suggested) && dmarcPass) {
    const { data: auto } = await admin.rpc('get_setting', { p_key: 'auto_apply_replies' });
    if (auto === true && (await senderMatchesAuthority(from, outbound))) {
      const { error: applyError } = await admin.rpc('apply_inbound_status', {
        p_inbound_id: row.id,
        p_status: suggested,
        p_by: 'auto',
      });
      applied = !applyError;
    }
  }

  return json({ stored: true, ref, matched: !!outbound, suggested, applied });
});

const enc = new TextEncoder();

/** Svix scheme: base64 HMAC-SHA256 of `${id}.${timestamp}.${body}`; header holds space-separated `v1,<sig>` entries. */
async function validSignature(secret: string, id: string, ts: string, body: string, header: string): Promise<boolean> {
  let keyBytes: Uint8Array;
  try {
    keyBytes = Uint8Array.from(atob(secret.slice('whsec_'.length)), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${id}.${ts}.${body}`)));
  let ok = false;
  for (const part of header.split(' ')) {
    const [version, sig] = part.split(',', 2);
    if (version !== 'v1' || !sig) continue;
    let given: Uint8Array;
    try {
      given = Uint8Array.from(atob(sig), (c) => c.charCodeAt(0));
    } catch {
      continue;
    }
    if (timingSafeEqual(mac, given)) ok = true; // no early exit
  }
  return ok;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Undo the replay-guard entry so Resend's retry of this delivery is accepted. */
async function releaseSvixId(id: string): Promise<void> {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(id))))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  await admin.from('server_rate_log').delete().eq('bucket', 'inbound_svix').eq('key_hash', hash);
}

/** Sender's domain must match a domain we emailed for this authority. */
async function senderMatchesAuthority(
  from: string,
  outbound: { authority_id: string | null; sent_recipient: string | null },
): Promise<boolean> {
  const domainOf = (addr: string) => addr.split('@')[1]?.toLowerCase() ?? '';
  const domains = new Set<string>();
  if (outbound.sent_recipient?.includes('@')) domains.add(domainOf(outbound.sent_recipient));
  if (outbound.authority_id) {
    const { data } = await admin.from('authorities').select('submission_methods').eq('id', outbound.authority_id).maybeSingle();
    for (const m of (data?.submission_methods ?? []) as { method?: string; endpoint?: string }[]) {
      if (m.method === 'email' && m.endpoint?.includes('@')) domains.add(domainOf(m.endpoint));
    }
  }
  return domains.has(domainOf(from));
}

function parseAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/<([^>]+)>/);
  return (m ? m[1] : value).trim().toLowerCase() || null;
}

/** Keep only what the person wrote: drop quoted lines and everything after the reply header. */
export function stripQuoted(text: string): string {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (/^On .+wrote:$/i.test(t) || /^-{2,}\s*Original Message/i.test(t) || /^_{5,}$/.test(t)) break;
    if (/^From:\s/i.test(t) && out.some((l) => l.trim())) break;
    if (t.startsWith('>')) continue;
    out.push(line);
  }
  return out.join('\n').trim();
}

/** Rough keyword read of the reply. Human review is the default for a reason. */
export function suggestStatus(text: string): 'resolved' | 'in_progress' | 'acknowledged' | null {
  const t = text.toLowerCase();
  const negated = /\b(not|no longer|isn't|hasn't|has not|wasn't|was not|cannot|can't|unable to|yet to be)\b[^.]{0,30}\b(fixed|repaired|resolved|completed|patched)\b/.test(t);
  if (!negated && (
    /\b(has been|have been|was|were|is now|are now|been)\s+(fixed|repaired|resolved|patched|filled|completed|addressed|replaced)\b/.test(t) ||
    /\b(repairs?|work)\s+(is |was |has been )?(complete|completed|done|finished)\b/.test(t) ||
    /\bclosed\s+(the|this|your)\s+(ticket|case|request|work order)\b/.test(t)
  )) return 'resolved';
  if (/\b(scheduled|work order|crew|dispatched|assigned|in progress|will be (fixed|repaired|addressed|patched|replaced))\b/.test(t)) return 'in_progress';
  if (/\b(received|forwarded|looking into|investigat\w*|acknowledg\w*|reviewing|thank you for (the|your) (report|email|notice))\b/.test(t)) return 'acknowledged';
  return null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
