// Supabase Edge Function: delete-account
// POST, signed-in user only (Authorization: Bearer <user JWT>). Deletes the
// caller's account (app-store account-deletion requirement):
//
//   1. their photos in storage (report-media/reports/<report id>/…)
//   2. their reports stay public as community records but are anonymized:
//      user_id cleared, is_anonymous on, photo links removed; report_owners
//      rows (owner of signed-in anonymous reports) deleted
//   3. their votes, city memberships and profile (rate-limit and AI usage
//      logs are keyed by the bare uuid and age out on their own)
//   4. the auth user itself
//
// Rate-limited per user (rate_limit_hit, migration 041). Returns {ok:true}.

import { createClient } from 'npm:@supabase/supabase-js@2.103.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const BUCKET = 'report-media';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.substring(7));
  if (authError || !user) return json({ error: 'Invalid token' }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: allowed, error: limitError } = await admin.rpc('rate_limit_hit', {
    p_bucket: 'delete_account', p_key: user.id, p_max: 3, p_window_seconds: 3600,
  });
  if (limitError || allowed !== true) return json({ error: 'Rate limit exceeded' }, 429);

  try {
    // Reports they own: signed-in reports (user_id) and signed-in anonymous
    // reports (report_owners, migration 036).
    const [{ data: own, error: e1 }, { data: owned, error: e2 }] = await Promise.all([
      admin.from('reports').select('id').eq('user_id', user.id),
      admin.from('report_owners').select('report_id').eq('user_id', user.id),
    ]);
    if (e1 || e2) throw new Error(`report lookup: ${(e1 ?? e2)!.message}`);
    const reportIds = [...new Set([
      ...(own ?? []).map((r: { id: string }) => r.id),
      ...(owned ?? []).map((r: { report_id: string }) => r.report_id),
    ])];

    // 1. Photos: everything under reports/<id>/ (thumbnails in reports/<id>/thumbs/).
    for (const id of reportIds) {
      for (const dir of [`reports/${id}`, `reports/${id}/thumbs`]) {
        for (;;) {
          const { data: files, error } = await admin.storage.from(BUCKET).list(dir, { limit: 100 });
          if (error) throw new Error(`storage list: ${error.message}`);
          const paths = (files ?? []).filter((f) => f.id).map((f) => `${dir}/${f.name}`);
          if (paths.length === 0) break;
          const { error: rmError } = await admin.storage.from(BUCKET).remove(paths);
          if (rmError) throw new Error(`storage remove: ${rmError.message}`);
          if (paths.length < 100) break;
        }
      }
    }

    // 2. Reports stay public, without the person or their photos.
    for (let i = 0; i < reportIds.length; i += 200) {
      const chunk = reportIds.slice(i, i + 200);
      const { error } = await admin.from('reports').update({ user_id: null, is_anonymous: true, media: [] }).in('id', chunk);
      if (error) throw new Error(`anonymize reports: ${error.message}`);
    }
    // 3. Ownership links, votes (they reference the profile), memberships,
    //    then the profile. Builders run in order, each when awaited.
    for (const [name, op] of [
      ['report_owners', admin.from('report_owners').delete().eq('user_id', user.id)],
      ['report_votes', admin.from('report_votes').delete().eq('user_id', user.id)],
      ['city_members', admin.from('city_members').delete().eq('user_id', user.id)],
      ['profiles', admin.from('profiles').delete().eq('id', user.id)],
    ] as [string, PromiseLike<{ error: { message: string } | null }>][]) {
      const { error } = await op;
      if (error) throw new Error(`${name}: ${error.message}`);
    }

    // 4. The account.
    const { error: delError } = await admin.auth.admin.deleteUser(user.id);
    if (delError) throw new Error(`auth delete: ${delError.message}`);

    return json({ ok: true });
  } catch (err) {
    console.error(`delete-account failed for ${user.id}`, String(err));
    return json({ error: 'Could not delete the account. Please try again or contact support.' }, 500);
  }
});
