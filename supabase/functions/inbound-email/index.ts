// Supabase Edge Function: inbound-email
// Resend "email.received" webhook for replies to Fault Line outbound mail.
//
// The webhook only carries an email_id; the message itself is fetched from
// Resend's API with our key. A forged webhook can't inject content — an id
// that isn't a real email received by our Resend account just 404s.
//
// Replies are matched to outbound_messages by the [FL-XXXXXX] subject tag,
// a status is suggested from the wording, and the reply is stored for admin
// review. When app_settings.auto_apply_replies is on, the suggestion is
// applied automatically — but only if the sender's domain matches an email
// domain we actually wrote to for that authority.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
// Needs a Resend key that can read received email (full access). Falls back
// to the sending key.
const RESEND_KEY = Deno.env.get('RESEND_RECEIVING_API_KEY') || Deno.env.get('RESEND_API_KEY') || '';

const REF_RE = /\[?\b(FL-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6})\b\]?/;
const MAX_BODY = 20_000;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const event = await req.json().catch(() => null);
  if (event?.type !== 'email.received') return json({ ignored: true });
  const emailId = event?.data?.email_id;
  if (typeof emailId !== 'string' || !/^[0-9a-zA-Z-]{8,64}$/.test(emailId)) return json({ error: 'bad email_id' }, 400);

  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${RESEND_KEY}` },
  });
  if (res.status === 404) return json({ error: 'unknown email' }, 400);
  if (!res.ok) return json({ error: `resend ${res.status}` }, 502); // non-2xx → Resend retries
  const email = await res.json();

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
    return json({ error: error.message }, 500);
  }

  let applied = false;
  if (outbound && suggested && from) {
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
