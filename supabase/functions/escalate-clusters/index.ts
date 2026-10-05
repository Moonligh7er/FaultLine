// Supabase Edge Function: escalate-clusters
// Run daily via pg_cron.
//
// Finds confirmed clusters that meet escalation criteria:
//   - 3+ unique reporters (already "confirmed")
//   - 10+ total reports
//   - 30+ days since first report
// and QUEUES an escalation for each in public.outbound_messages. Nothing is
// sent here: rows wait for admin review ('pending_review'), or are created
// 'approved' when app_settings.auto_send is on. dispatch-outbound sends.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// x-cron-secret is checked against Vault via verify_cron_secret()
// (migration 024), so rotating the secret never needs a redeploy.
async function isCronCaller(req: Request): Promise<boolean> {
  const secret = req.headers.get('x-cron-secret');
  if (!secret) return false;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data, error } = await admin.rpc('verify_cron_secret', { p_secret: secret });
  return !error && data === true;
}

interface ClusterSummary {
  cluster_id: string;
  category: string;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  report_count: number;
  unique_reporters: number;
  max_hazard: string;
  first_reported: string;
  last_reported: string;
  days_open: number;
  authority_name: string;
  sample_descriptions: string[];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Auth: cron only. Queued messages can lead to real emails to authorities.
  if (!(await isCronCaller(req))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: clusters, error: fetchError } = await supabase.rpc('get_clusters_ready_for_escalation');
  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
  }
  if (!clusters || clusters.length === 0) {
    return new Response(JSON.stringify({ message: 'No clusters ready for escalation', count: 0 }));
  }

  const { data: autoSend } = await supabase.rpc('get_setting', { p_key: 'auto_send' });
  const initialStatus = autoSend === true ? 'approved' : 'pending_review';

  const results: Record<string, unknown>[] = [];
  let queuedApproved = 0;

  for (const cluster of clusters) {
    const { data: summaryRows } = await supabase.rpc('get_cluster_summary', { p_cluster_id: cluster.id });
    const summary: ClusterSummary | null = summaryRows?.[0] || null;
    if (!summary) continue;

    let methods: unknown[] = [];
    if (cluster.authority_id) {
      const { data: authority } = await supabase
        .from('authorities')
        .select('submission_methods')
        .eq('id', cluster.authority_id)
        .single();
      methods = (authority?.submission_methods || []) as unknown[];
    }
    if (methods.length === 0) {
      results.push({ clusterId: cluster.id, status: 'skipped', error: 'Authority has no submission methods configured' });
      continue;
    }

    const first = methods[0] as { endpoint?: string };
    const { data: row, error } = await supabase
      .from('outbound_messages')
      .insert({
        kind: 'cluster_escalation',
        cluster_id: cluster.id,
        authority_id: cluster.authority_id,
        methods,
        recipient: first?.endpoint ?? null,
        subject: buildSubject(summary),
        body: buildEmailBody(summary),
        payload: {
          category: summary.category,
          address: summary.address || null,
          latitude: summary.latitude,
          longitude: summary.longitude,
          api_description:
            `Community-verified issue reported ${summary.report_count} times by ${summary.unique_reporters} unique residents ` +
            `over ${summary.days_open} days. Max hazard level: ${summary.max_hazard}. Submitted via Fault Line (fault-line.dev).`,
          cluster_id: cluster.id,
        },
        status: initialStatus,
      })
      .select('ref, status')
      .single();

    if (error) {
      // 23505 = already queued (or rejected) for this cluster — leave it be.
      const already = error.code === '23505';
      results.push({ clusterId: cluster.id, status: already ? 'already_queued' : 'error', ...(already ? {} : { error: error.message }) });
      continue;
    }
    if (row.status === 'approved') queuedApproved++;
    results.push({ clusterId: cluster.id, status: 'queued', ref: row.ref, review: row.status });
  }

  if (queuedApproved > 0) await supabase.rpc('trigger_outbound_dispatch');

  return new Response(
    JSON.stringify({ message: 'Escalations queued', autoSend: autoSend === true, results }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});

function buildSubject(s: ClusterSummary): string {
  const category = s.category.replace(/_/g, ' ');
  const location = s.address || s.city || 'Unknown location';
  return `${s.report_count} Community Reports: ${category} at ${location}, ${s.state}`;
}

function buildEmailBody(s: ClusterSummary): string {
  const category = s.category.replace(/_/g, ' ');
  const hazard = s.max_hazard.replace(/_/g, ' ');
  const descriptions = s.sample_descriptions
    .filter(Boolean)
    .map((d, i) => `  ${i + 1}. "${d}"`)
    .join('\n');

  return `Dear ${s.authority_name || 'Public Works Department'},

We are writing to bring to your attention a community-reported infrastructure issue that has received significant attention from local residents.

ISSUE SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Category:          ${category}
Location:          ${s.address || 'See coordinates below'}
City/Town:         ${s.city || 'N/A'}, ${s.state}
GPS Coordinates:   ${s.latitude.toFixed(6)}, ${s.longitude.toFixed(6)}
Google Maps:       https://maps.google.com/?q=${s.latitude},${s.longitude}

COMMUNITY IMPACT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Reports:     ${s.report_count}
Unique Reporters:  ${s.unique_reporters}
Max Hazard Level:  ${hazard}
First Reported:    ${s.first_reported}
Most Recent:       ${s.last_reported}
Days Open:         ${s.days_open}

${descriptions ? `RESIDENT DESCRIPTIONS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${descriptions}\n` : ''}
This report was generated by Fault Line (fault-line.dev), a community infrastructure reporting platform. All reports were independently submitted by ${s.unique_reporters} different community members over ${s.days_open} days.

We respectfully request that this issue be reviewed and addressed. If this has already been resolved or is scheduled for repair, please let us know so we can update the community.

Thank you for your service to the community.

Respectfully,
Fault Line Community Reports
reports@fault-line.dev

---
Report ID: ${s.cluster_id}
To update the status of this issue, reply to this email and keep the [FL-…] tag in the subject line.`;
}
