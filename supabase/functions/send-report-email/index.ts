// Supabase Edge Function: send-report-email
// Queues a single report for submission to its authority (city API or email).
// Name kept for client compatibility — nothing is sent here: the message goes
// into public.outbound_messages for admin review (or 'approved' when
// app_settings.auto_send is on) and dispatch-outbound sends it.
//
// Abuse guards: the caller only names a report + authority. The report must
// be the caller's own and recent; recipients come from the authority's
// methods on file (never caller-supplied); the body is built here from the
// stored report; one live message per report (unique index); and each user
// is rate-limited (edge_rate_limit_log, migration 023).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

type Method = { method?: string; endpoint?: string; priority?: number; protocol?: string };

/** Methods that can be automated: API endpoints and valid email addresses. */
function usableMethods(raw: unknown): Method[] {
  return ((raw as Method[] | null) ?? []).filter((m) =>
    typeof m?.endpoint === 'string' &&
    ((m.method === 'api' && m.endpoint.startsWith('https://')) ||
     (m.method === 'email' && EMAIL_RE.test(m.endpoint))),
  );
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.substring(7));
  if (authError || !user) return json({ error: 'Invalid token' }, 401);

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
  if (!report || report.user_id !== user.id) return json({ error: 'Report not found' }, 404);
  if (Date.now() - new Date(report.created_at).getTime() > MAX_REPORT_AGE_MS) {
    return json({ error: 'Report is too old for direct submission' }, 409);
  }

  const { data: authority } = await admin
    .from('authorities')
    .select('id, name, submission_methods, is_active')
    .eq('id', authorityId)
    .maybeSingle();
  const methods = usableMethods(authority?.submission_methods);
  if (!authority || authority.is_active === false || methods.length === 0) {
    return json({ error: 'Authority has no API or email on file' }, 422);
  }

  if (!(await withinRateLimit(user.id, 'send-report-email', [
    { max: 5, windowMs: 3600000 },
    { max: 20, windowMs: 86400000 },
  ]))) {
    return json({ error: 'Rate limit exceeded' }, 429);
  }

  const { data: link } = await admin
    .from('cluster_reports')
    .select('cluster_id')
    .eq('report_id', report.id)
    .maybeSingle();

  const category = (report.category || 'issue').replace(/_/g, ' ');
  const location = [report.address, report.city, report.state].filter(Boolean).join(', ');
  const description = (report.description || '').slice(0, MAX_DESCRIPTION_CHARS);
  const mediaUrls = ((report.media || []) as { uploadedUrl?: string; url?: string }[])
    .map((m) => m?.uploadedUrl ?? m?.url)
    .filter((u): u is string => typeof u === 'string' && u.startsWith(`${SUPABASE_URL}/storage/`));

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
To update its status, reply to this email and keep the [FL-…] tag in the subject line.

Thank you for your service to the community.

Fault Line Community Reports`;

  const { data: autoSend } = await admin.rpc('get_setting', { p_key: 'auto_send' });

  const { data: row, error } = await admin
    .from('outbound_messages')
    .insert({
      kind: 'report_submission',
      report_id: report.id,
      cluster_id: link?.cluster_id ?? null,
      authority_id: authority.id,
      methods,
      recipient: methods[0]?.endpoint ?? null,
      subject: `Community Report: ${category} at ${location || 'reported location'}`,
      body,
      payload: {
        category: report.category,
        address: report.address,
        latitude: report.latitude,
        longitude: report.longitude,
        api_description: `${description || `${category} reported by a resident`}. Hazard: ${report.hazard_level}. Submitted via Fault Line (fault-line.dev).`,
        image_url: mediaUrls[0] ?? null,
        cluster_id: link?.cluster_id ?? null,
      },
      status: autoSend === true ? 'approved' : 'pending_review',
      created_by: user.id,
    })
    .select('ref, status')
    .single();

  if (error) {
    return error.code === '23505'
      ? json({ error: 'Report already queued' }, 409)
      : json({ error: 'Could not queue report' }, 500);
  }
  if (row.status === 'approved') await admin.rpc('trigger_outbound_dispatch');

  return json({ queued: true, ref: row.ref, status: row.status });
});
