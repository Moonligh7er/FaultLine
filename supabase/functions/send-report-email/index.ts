// Supabase Edge Function: send-report-email
// All email sending goes through this function.
// The Resend API key ONLY exists here — never in the client.
//
// Abuse guards: the caller only names a report + authority. The report
// must be the caller's own and recent; the recipient is the authority's
// email on file (never caller-supplied); the body is built here from the
// stored report; each report is emailed at most once (report_email_sends);
// and each user is rate-limited (edge_rate_limit_log, migration 023).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev';
const REPLY_TO = Deno.env.get('REPLY_TO') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_REPORT_AGE_MS = 24 * 3600000;
const MAX_DESCRIPTION_CHARS = 2000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Per-user sliding-window limit backed by public.edge_rate_limit_log
// (migration 023). Fails closed: a DB error counts as over the limit.
async function withinRateLimit(
  userId: string,
  bucket: string,
  limits: { max: number; windowMs: number }[],
): Promise<boolean> {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  for (const { max, windowMs } of limits) {
    const { count, error } = await admin
      .from('edge_rate_limit_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('bucket', bucket)
      .gte('created_at', new Date(Date.now() - windowMs).toISOString());
    if (error || (count ?? 0) >= max) return false;
  }
  const { error } = await admin.from('edge_rate_limit_log').insert({ user_id: userId, bucket });
  return !error;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Auth: require valid user token
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.substring(7));
  if (authError || !user) {
    return json({ error: 'Invalid token' }, 401);
  }

  if (!RESEND_API_KEY) {
    return json({ error: 'Email service not configured' }, 503);
  }

  const { reportId, authorityId } = await req.json().catch(() => ({}));
  if (typeof reportId !== 'string' || !UUID_RE.test(reportId) ||
      typeof authorityId !== 'string' || !UUID_RE.test(authorityId)) {
    return json({ error: 'reportId and authorityId are required' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: report } = await admin
    .from('reports')
    .select('id, user_id, category, latitude, longitude, address, city, state, description, hazard_level, upvote_count, confirm_count, media, created_at')
    .eq('id', reportId)
    .maybeSingle();
  if (!report || report.user_id !== user.id) {
    return json({ error: 'Report not found' }, 404);
  }
  if (Date.now() - new Date(report.created_at).getTime() > MAX_REPORT_AGE_MS) {
    return json({ error: 'Report is too old for direct email' }, 409);
  }

  const { data: authority } = await admin
    .from('authorities')
    .select('id, name, submission_methods, is_active')
    .eq('id', authorityId)
    .maybeSingle();
  const to = (authority?.submission_methods as { method?: string; endpoint?: string }[] | null)
    ?.find((m) => m?.method === 'email' && typeof m.endpoint === 'string' && EMAIL_RE.test(m.endpoint))
    ?.endpoint;
  if (!authority || authority.is_active === false || !to) {
    return json({ error: 'Authority has no email on file' }, 422);
  }

  if (!(await withinRateLimit(user.id, 'send-report-email', [
    { max: 5, windowMs: 3600000 },
    { max: 20, windowMs: 86400000 },
  ]))) {
    return json({ error: 'Email rate limit exceeded' }, 429);
  }

  // Claim the report before sending so it can only be emailed once.
  const { error: claimError } = await admin
    .from('report_email_sends')
    .insert({ report_id: report.id, user_id: user.id, authority_id: authority.id, recipient: to });
  if (claimError) {
    return claimError.code === '23505'
      ? json({ error: 'Report already emailed' }, 409)
      : json({ error: 'Could not record send' }, 500);
  }

  const category = (report.category || 'issue').replace(/_/g, ' ');
  const location = [report.address, report.city, report.state].filter(Boolean).join(', ');
  const description = (report.description || '').slice(0, MAX_DESCRIPTION_CHARS);
  const mediaUrls = ((report.media || []) as { uploadedUrl?: string }[])
    .map((m) => m?.uploadedUrl)
    .filter((u): u is string => typeof u === 'string' && u.startsWith(`${SUPABASE_URL}/storage/`));

  const subject = `[Fault Line] Community Report: ${category} at ${location || 'reported location'}`;

  const body = `Dear ${authority.name || 'Public Works Department'},

A community member has reported an infrastructure issue in your jurisdiction.

REPORT DETAILS
${'━'.repeat(40)}
Category: ${category}
Location: ${location || 'See coordinates below'}
GPS: ${Number(report.latitude).toFixed(6)}, ${Number(report.longitude).toFixed(6)}
Maps: https://maps.google.com/?q=${report.latitude},${report.longitude}
Hazard Level: ${report.hazard_level || 'moderate'}
${description ? `Description: ${description}` : ''}

Community Impact: ${report.upvote_count || 0} upvotes, ${report.confirm_count || 0} confirmations
${mediaUrls.length ? `Photos: ${mediaUrls.join(', ')}` : ''}

This report was submitted via Fault Line, a community infrastructure reporting platform.

Thank you for your service to the community.

Fault Line Community Reports`;

  const releaseClaim = () => admin.from('report_email_sends').delete().eq('report_id', report.id);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Fault Line <${FROM_EMAIL}>`,
        to: [to],
        subject,
        text: body,
        ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
      }),
    });

    if (!response.ok) {
      await releaseClaim();
      return json({ error: `Email send failed: ${response.status}` }, 502);
    }

    const result = await response.json();
    await admin.from('report_email_sends').update({ resend_id: result.id }).eq('report_id', report.id);
    return json({ success: true, emailId: result.id, recipient: to });
  } catch (err) {
    await releaseClaim();
    return json({ error: String(err) }, 500);
  }
});
