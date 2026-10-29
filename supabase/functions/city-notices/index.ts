// Supabase Edge Function: city-notices (daily, pg_cron)
//
// Emails city account owners (and the billing contact) everything the city
// terms promise in writing:
//   * a copy of the terms the owner accepted, with the renewal choice;
//   * reminders 60, 30 and 7 days before a pilot or term ends: what will
//     happen, how to change it, and a link to send feedback;
//   * a notice on every renewal-choice change, invoice start, suspension,
//     reactivation, end of access and waiver removal.
// Each email is claimed in city_account_events (unique dedupe_key) before it
// is sent, so a rerun never sends twice. Sandbox mode sends to Resend's test
// inbox instead of the city.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev';
const APP = 'https://app.fault-line.dev';
const FEEDBACK = `${APP}/feedback`;
const REMINDER_DAYS = [7, 30, 60];

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const TIER_CENTS: Record<string, number | null> = { town: 600_000, city: 960_000, regional: 3_000_000, metro: null };

interface City {
  id: string; slug: string; display_name: string; tier: string; status: string;
  pilot_ends_at: string | null; current_period_end: string | null; fee_waived: boolean;
  auto_renew: boolean | null; terms_version: string | null; terms_accepted_at: string | null;
  locked_price_cents: number | null; quoted_price_cents: number | null; billing_email: string | null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const usd = (c: number | null) =>
  c == null ? 'the quoted price' : (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : 'the end date';
const price = (c: City) => usd(c.locked_price_cents ?? c.quoted_price_cents ?? TIER_CENTS[c.tier] ?? null);

async function isCronCaller(req: Request): Promise<boolean> {
  const secret = req.headers.get('x-cron-secret');
  if (!secret) return false;
  const { data, error } = await admin.rpc('verify_cron_secret', { p_secret: secret });
  return !error && data === true;
}

async function recipients(c: City): Promise<string[]> {
  const { data } = await admin.from('city_members').select('user_id').eq('city_account_id', c.id).eq('role', 'owner');
  const out = new Set<string>();
  for (const m of data ?? []) {
    const { data: u } = await admin.auth.admin.getUserById(m.user_id);
    if (u.user?.email) out.add(u.user.email.toLowerCase());
  }
  if (c.billing_email) out.add(c.billing_email.toLowerCase());
  return [...out];
}

function whatHappens(c: City): string {
  const end = c.status === 'pilot' ? c.pilot_ends_at : c.current_period_end;
  const when = c.status === 'pilot' ? `When the pilot ends on ${day(end)}` : `When the current term ends on ${day(end)}`;
  if (c.auto_renew === true) {
    return `${when}, Fault Line will email an annual invoice for ${price(c)}, due in 30 days (bank transfer, ACH or card). If it isn't paid by the due date, dashboard access is suspended until it is paid.`;
  }
  return `${when}, dashboard access ends and nothing is billed, because automatic renewal is off. You can subscribe again at any time at ${price(c)} per year.`;
}

const footer = (c: City) =>
  `\n\nChange the renewal setting, the billing contact or the PO number any time: ${APP}/portal/${c.id}/billing\n` +
  `City terms: ${APP}/terms#city-accounts\n` +
  `Your city's public page and every resident report stay public whatever you choose.\n\n` +
  `— Fault Line (Moonlit Social Labs). Reply to this email to reach a person.`;

async function claim(cityId: string, kind: string, dedupe: string, detail: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await admin
    .from('city_account_events')
    .insert({ city_account_id: cityId, kind, dedupe_key: dedupe, detail, actor: 'city-notices' })
    .select('id')
    .single();
  return error ? null : data.id;
}

async function send(to: string[], subject: string, text: string, sandbox: boolean): Promise<boolean> {
  if (!RESEND_API_KEY || to.length === 0) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Fault Line <${FROM_EMAIL}>`,
      to: sandbox ? ['delivered@resend.dev'] : to,
      subject: sandbox ? `[SANDBOX → ${to.join(', ')}] ${subject}` : subject,
      text,
      reply_to: 'reports@fault-line.dev',
    }),
  });
  return res.ok;
}

async function deliver(c: City, kind: string, dedupe: string, subject: string, text: string, sandbox: boolean, detail: Record<string, unknown> = {}) {
  const to = await recipients(c);
  if (to.length === 0) return 'no-recipient';
  const claimId = await claim(c.id, kind, dedupe, { ...detail, to });
  if (!claimId) return 'already-sent';
  const ok = await send(to, subject, text + footer(c), sandbox);
  if (!ok) {
    await admin.from('city_account_events').delete().eq('id', claimId); // retry tomorrow
    return 'failed';
  }
  return 'sent';
}

function eventEmail(c: City, kind: string, detail: Record<string, unknown>): { subject: string; text: string } | null {
  const name = c.display_name;
  switch (kind) {
    case 'terms_accepted':
      return {
        subject: `${name}: your Fault Line city terms (copy for your records)`,
        text: c.fee_waived
          ? `You accepted the Fault Line City Terms (version ${c.terms_version}) for ${name} on ${day(c.terms_accepted_at)}.\n\nFault Line has waived your city's fee. No invoice is sent while the waiver stands; if it ever ends we will tell you in writing at least 60 days before any invoice, and nothing renews unless you turn renewal on.`
          : `You accepted the Fault Line City Terms (version ${c.terms_version}) for ${name} on ${day(c.terms_accepted_at)}.\n\n` +
            `Pilot: free until ${day(c.pilot_ends_at)}.\nPlan after the pilot: ${price(c)} per year, billed annually, locked for as long as your city keeps renewing (any change gets 60 days' written notice).\n` +
            `Automatic renewal: ${detail.auto_renew === true ? 'ON' : 'OFF'} (your choice; change it any time).\n\n${whatHappens(c)}\n\n` +
            `We'll remind you 60, 30 and 7 days before the pilot ends.`,
      };
    case 'auto_renew_changed':
      return {
        subject: `${name}: automatic renewal turned ${detail.auto_renew ? 'on' : 'off'}`,
        text: `Automatic renewal for ${name} is now ${detail.auto_renew ? 'ON' : 'OFF'}.\n\n${whatHappens(c)}`,
      };
    case 'subscription_started':
      return {
        subject: `${name}: your annual invoice is on its way`,
        text: `Your ${name} subscription has started at ${price(c)} per year. The invoice is emailed separately by our billing provider (Stripe) and is due in 30 days; it can be paid by bank transfer, ACH or card, and carries your PO number if you added one.\n\nIf it isn't paid by the due date, dashboard access is suspended until it is paid.`,
      };
    case 'suspended':
      return {
        subject: `${name}: dashboard access suspended (invoice past due)`,
        text: `Dashboard access for ${name} is suspended because an invoice is past due. It reopens automatically as soon as the invoice is paid. Invoices: ${APP}/portal/${c.id}/billing`,
      };
    case 'reactivated':
      return { subject: `${name}: dashboard access restored`, text: `Thanks, the invoice is paid and dashboard access for ${name} is open again.` };
    case 'ended':
      return {
        subject: `${name}: dashboard access has ended`,
        text: `Dashboard access for ${name} has ended and nothing further will be billed. You can subscribe again at any time at ${price(c)} per year from ${APP}/portal/${c.id}/billing.\n\nWe'd value a minute of feedback on what worked and what didn't: ${FEEDBACK}`,
      };
    case 'fee_waiver_removed':
      return {
        subject: `${name}: fee waiver ending`,
        text: `Fault Line's fee waiver for ${name} has been removed. Automatic renewal is OFF, so nothing will be billed unless you turn it on. ${whatHappens(c)}`,
      };
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!(await isCronCaller(req))) return json({ error: 'Unauthorized' }, 401);

  const { data: sandboxSetting } = await admin.rpc('get_setting', { p_key: 'sandbox_mode' });
  const sandbox = sandboxSetting === true;
  const { data: cities } = await admin.from('city_accounts').select('*');
  const byId = new Map<string, City>((cities ?? []).map((c: City) => [c.id, c]));
  const results: Record<string, number> = {};
  const tally = (r: string) => (results[r] = (results[r] ?? 0) + 1);

  // 1. Reminders before a pilot or term ends.
  for (const c of byId.values()) {
    if (c.fee_waived || !c.terms_accepted_at) continue;
    const end = c.status === 'pilot' ? c.pilot_ends_at : c.status === 'active' ? c.current_period_end : null;
    if (!end) continue;
    const daysLeft = Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000);
    if (daysLeft <= 0) continue;
    const t = REMINDER_DAYS.find((d) => daysLeft <= d);
    if (!t) continue;
    const what = c.status === 'pilot' ? 'pilot' : 'subscription term';
    tally(
      await deliver(
        c,
        'reminder_sent',
        `reminder:${t}:${end.slice(0, 10)}`,
        `${c.display_name}: your Fault Line ${what} ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
        `Your ${what} for ${c.display_name} ends on ${day(end)}.\n\n${whatHappens(c)}\n\n` +
          `How has it gone? Tell us what's working and what isn't, in two minutes: ${FEEDBACK}`,
        sandbox,
        { days_left: daysLeft, threshold: t },
      ),
    );
  }

  // 2. Notices for account events from the last 14 days.
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: events } = await admin
    .from('city_account_events')
    .select('id, city_account_id, kind, detail')
    .in('kind', ['terms_accepted', 'auto_renew_changed', 'subscription_started', 'suspended', 'reactivated', 'ended', 'fee_waiver_removed'])
    .gte('created_at', since)
    .order('created_at');
  for (const e of events ?? []) {
    const c = byId.get(e.city_account_id);
    const mail = c && eventEmail(c, e.kind, e.detail ?? {});
    if (!c || !mail) continue;
    tally(await deliver(c, 'notice_sent', `notice:${e.id}`, mail.subject, mail.text, sandbox, { for_event: e.kind }));
  }

  return json({ ok: true, sandbox, results });
});
