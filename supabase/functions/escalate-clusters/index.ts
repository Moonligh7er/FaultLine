// Supabase Edge Function: escalate-clusters
// Run daily via pg_cron or Supabase scheduled invocation
//
// Finds confirmed clusters that meet escalation criteria:
//   - 3+ unique reporters (already "confirmed")
//   - 10+ total reports
//   - 30+ days since first report
// Then sends professional emails to the responsible authority via Resend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev';
const REPLY_TO = Deno.env.get('REPLY_TO') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

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

  // Auth: require either a valid user token or the service role secret as a cron key
  const authHeader = req.headers.get('authorization');
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedCronSecret = Deno.env.get('CRON_SECRET') || '';

  if (!cronSecret && !authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  if (cronSecret && cronSecret !== expectedCronSecret) {
    return new Response(JSON.stringify({ error: 'Invalid cron secret' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  if (authHeader && !cronSecret) {
    // Validate user token
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') || '');
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await userClient.auth.getUser(token);
    if (error || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 1. Find clusters ready for escalation
  const { data: clusters, error: fetchError } = await supabase.rpc(
    'get_clusters_ready_for_escalation'
  );

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
  }

  if (!clusters || clusters.length === 0) {
    return new Response(JSON.stringify({ message: 'No clusters ready for escalation', count: 0 }));
  }

  const results: { clusterId: string; status: string; error?: string }[] = [];

  for (const cluster of clusters) {
    // 2. Get full summary
    const { data: summaryRows } = await supabase.rpc('get_cluster_summary', {
      p_cluster_id: cluster.id,
    });

    const summary: ClusterSummary | null = summaryRows?.[0] || null;
    if (!summary) continue;

    // 3. Get authority submission methods
    let recipientEmail = '';
    if (cluster.authority_id) {
      const { data: authority } = await supabase
        .from('authorities')
        .select('submission_methods, name')
        .eq('id', cluster.authority_id)
        .single();

      if (authority?.submission_methods) {
        const emailMethod = authority.submission_methods.find(
          (m: any) => m.method === 'email'
        );
        if (emailMethod) {
          recipientEmail = emailMethod.endpoint;
        }
      }
    }

    if (!recipientEmail) {
      results.push({ clusterId: cluster.id, status: 'skipped', error: 'No email found for authority' });
      continue;
    }

    // 4. Build professional email
    const subject = buildSubject(summary);
    const body = buildEmailBody(summary);

    // 5. Send via Resend
    try {
      const sendResult = await sendEmail(recipientEmail, subject, body);

      if (sendResult.ok) {
        // 6. Log the escalation
        await supabase.rpc('escalate_cluster', {
          p_cluster_id: cluster.id,
          p_method: 'email',
          p_recipient: recipientEmail,
          p_subject: subject,
          p_body: body,
        });
        results.push({ clusterId: cluster.id, status: 'sent' });
      } else {
        const errorBody = await sendResult.text();
        results.push({ clusterId: cluster.id, status: 'failed', error: `Resend ${sendResult.status}: ${errorBody}` });
      }
    } catch (err) {
      results.push({ clusterId: cluster.id, status: 'failed', error: String(err) });
    }
  }

  return new Response(
    JSON.stringify({ message: 'Escalation complete', results }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});

function buildSubject(s: ClusterSummary): string {
  const category = s.category.replace('_', ' ');
  const location = s.address || s.city || 'Unknown location';
  return `[Fault Line] ${s.report_count} Community Reports: ${category} at ${location}, ${s.state}`;
}

function buildEmailBody(s: ClusterSummary): string {
  const category = s.category.replace('_', ' ');
  const hazard = s.max_hazard.replace('_', ' ');
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
This report was generated by Fault Line (faultline.app), a community infrastructure reporting platform. All reports were independently submitted by ${s.unique_reporters} different community members over ${s.days_open} days.

We respectfully request that this issue be reviewed and addressed. If this has already been resolved or is scheduled for repair, please let us know so we can update the community.

Thank you for your service to the community.

Respectfully,
Fault Line Community Reports
reports@faultline.app

---
Report ID: ${s.cluster_id}
To update the status of this issue, reply to this email.`;
}

async function sendEmail(to: string, subject: string, body: string): Promise<Response> {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Fault Line Community Reports <${FROM_EMAIL}>`,
      to: [to],
      subject,
      text: body,
      ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
    }),
  });
}
