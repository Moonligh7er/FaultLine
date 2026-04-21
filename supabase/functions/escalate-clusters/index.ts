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

// Optional API keys for direct city-system integration.
// When unset, API-method authorities fall back to email automatically.
const OPEN311_JURISDICTION_ID = Deno.env.get('OPEN311_JURISDICTION_ID') || '';
const OPEN311_API_KEY = Deno.env.get('OPEN311_API_KEY') || '';
const SEECLICKFIX_API_KEY = Deno.env.get('SEECLICKFIX_API_KEY') || '';

interface SubmissionMethod {
  method: 'api' | 'email' | 'web_form' | 'phone';
  endpoint: string;
  priority?: number;
  protocol?: 'open311' | 'seeclickfix' | string;
  notes?: string;
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

    // 3. Get authority + all submission methods
    let authorityName = '';
    let methods: SubmissionMethod[] = [];
    if (cluster.authority_id) {
      const { data: authority } = await supabase
        .from('authorities')
        .select('submission_methods, name')
        .eq('id', cluster.authority_id)
        .single();
      authorityName = authority?.name || '';
      methods = (authority?.submission_methods || []) as SubmissionMethod[];
    }

    // 4. Build escalation payload once
    const subject = buildSubject(summary);
    const body = buildEmailBody(summary);

    // 5. Try methods in priority order: api → email → web_form (manual)
    //    If the preferred method fails, fall back down the chain.
    const prioritized = prioritizeMethods(methods);
    let sent: { method: string; recipient: string } | null = null;
    const attempts: string[] = [];

    for (const m of prioritized) {
      try {
        if (m.method === 'api') {
          const apiResult = await submitViaApi(m, summary);
          if (apiResult.ok) {
            sent = { method: `api:${m.protocol || 'unknown'}`, recipient: m.endpoint };
            break;
          }
          attempts.push(`api:${m.protocol}: ${apiResult.error}`);
        } else if (m.method === 'email') {
          const sendResult = await sendEmail(m.endpoint, subject, body);
          if (sendResult.ok) {
            sent = { method: 'email', recipient: m.endpoint };
            break;
          }
          const errText = await sendResult.text().catch(() => 'unknown');
          attempts.push(`email → ${m.endpoint}: ${sendResult.status} ${errText}`);
        } else if (m.method === 'web_form') {
          // We can't auto-submit arbitrary web forms from a server, but we CAN
          // record the cluster as awaiting manual submission. The admin UI picks
          // these up with the prepared subject/body for one-click copy-paste.
          sent = { method: 'web_form_manual', recipient: m.endpoint };
          attempts.push(`web_form: queued for manual submission at ${m.endpoint}`);
          break;
        }
        // 'phone' is a no-op for automated escalation — skip.
      } catch (err) {
        attempts.push(`${m.method}: ${String(err)}`);
      }
    }

    if (sent) {
      await supabase.rpc('escalate_cluster', {
        p_cluster_id: cluster.id,
        p_method: sent.method,
        p_recipient: sent.recipient,
        p_subject: subject,
        p_body: body,
      });
      results.push({ clusterId: cluster.id, status: 'sent', method: sent.method, recipient: sent.recipient, attempts });
    } else if (methods.length === 0) {
      results.push({ clusterId: cluster.id, status: 'skipped', error: 'Authority has no submission methods configured' });
    } else {
      results.push({ clusterId: cluster.id, status: 'failed', error: 'All submission methods failed', attempts });
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

// ============================================================
// Submission-method prioritization + API dispatch
// ============================================================

/** Sort submission methods by priority (explicit priority first, then by
 *  category: api > email > web_form > phone). Phone is included last for
 *  completeness but the dispatcher ignores it. */
function prioritizeMethods(methods: SubmissionMethod[]): SubmissionMethod[] {
  const categoryRank: Record<string, number> = {
    api: 1,
    email: 2,
    web_form: 3,
    phone: 99,
  };
  return [...methods].sort((a, b) => {
    // Explicit priority wins
    if (a.priority !== undefined && b.priority !== undefined) {
      return a.priority - b.priority;
    }
    if (a.priority !== undefined) return -1;
    if (b.priority !== undefined) return 1;
    // Otherwise fall back to category
    return (categoryRank[a.method] ?? 100) - (categoryRank[b.method] ?? 100);
  }).filter(m => m.method !== 'phone');
}

/** Dispatch to the right API protocol. Missing keys → graceful fail so the
 *  caller falls through to the next method (typically email). */
async function submitViaApi(
  method: SubmissionMethod,
  s: ClusterSummary,
): Promise<{ ok: boolean; error?: string; ticketId?: string }> {
  const protocol = (method.protocol || '').toLowerCase();

  if (protocol === 'open311' || method.endpoint.includes('open311') || method.endpoint.includes('/open311/')) {
    return submitOpen311(method, s);
  }
  if (protocol === 'seeclickfix' || method.endpoint.includes('seeclickfix.com')) {
    return submitSeeClickFix(method, s);
  }
  return { ok: false, error: `Unknown API protocol: ${protocol || method.endpoint}` };
}

/** Open311 GeoReport v2 POST /requests.json
 *  Spec: http://wiki.open311.org/GeoReport_v2/
 *  Some endpoints require an API key + jurisdiction_id query params. */
async function submitOpen311(
  method: SubmissionMethod,
  s: ClusterSummary,
): Promise<{ ok: boolean; error?: string; ticketId?: string }> {
  // Map internal category to a service_code.
  // Cities publish their own service_codes; this is a best-effort guess.
  const serviceCodeMap: Record<string, string> = {
    pothole: 'pothole',
    streetlight: 'streetlight',
    sidewalk: 'sidewalk',
    signage: 'sign_damage',
    drainage: 'drainage',
    graffiti: 'graffiti',
    road_debris: 'road_debris',
    water_main: 'water_main',
    sewer: 'sewer',
    bridge: 'bridge',
    fallen_tree: 'tree_down',
    snow_ice: 'snow_ice',
  };
  const serviceCode = serviceCodeMap[s.category] || s.category;

  const body = new URLSearchParams();
  body.append('service_code', serviceCode);
  body.append('lat', String(s.latitude));
  body.append('long', String(s.longitude));
  if (s.address) body.append('address_string', s.address);
  body.append('description',
    `Community-verified issue reported ${s.report_count} times by ${s.unique_reporters} unique residents ` +
    `over ${s.days_open} days. Max hazard level: ${s.max_hazard}. Submitted via Fault Line (faultline.app).`,
  );
  if (OPEN311_API_KEY) body.append('api_key', OPEN311_API_KEY);
  if (OPEN311_JURISDICTION_ID) body.append('jurisdiction_id', OPEN311_JURISDICTION_ID);

  try {
    const res = await fetch(method.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `Open311 HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const json = await res.json().catch(() => null);
    const ticketId =
      json?.[0]?.service_request_id ||
      json?.[0]?.token ||
      json?.service_request_id ||
      undefined;
    return { ok: true, ticketId };
  } catch (err) {
    return { ok: false, error: `Open311 network error: ${String(err)}` };
  }
}

/** SeeClickFix API v2 POST /issues
 *  Docs: https://dev.seeclickfix.com/
 *  No API key required for issue creation — SeeClickFix accepts public
 *  anonymous submissions as long as the payload identifies the submitter
 *  via user[name] + user[email]. If SEECLICKFIX_API_KEY is set, we pass
 *  it along too (some jurisdictions prefer it), but absence is not fatal. */
async function submitSeeClickFix(
  method: SubmissionMethod,
  s: ClusterSummary,
): Promise<{ ok: boolean; error?: string; ticketId?: string }> {
  // SeeClickFix POST /issues expects form-encoded keys with bracket notation
  // for nested fields. We submit as Fault Line on behalf of the community.
  const body = new URLSearchParams();
  body.append('summary', `${s.category.replace('_', ' ')} at ${s.address || `${s.latitude}, ${s.longitude}`}`);
  body.append(
    'description',
    `Community-verified issue reported ${s.report_count} times by ${s.unique_reporters} residents ` +
    `over ${s.days_open} days. Max hazard: ${s.max_hazard}. Submitted via Fault Line (faultline.app).`,
  );
  body.append('address', s.address || '');
  body.append('lat', String(s.latitude));
  body.append('lng', String(s.longitude));
  body.append('user[name]', 'Fault Line Community Reports');
  body.append('user[email]', REPLY_TO || FROM_EMAIL);

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (SEECLICKFIX_API_KEY) {
    headers.Authorization = `Bearer ${SEECLICKFIX_API_KEY}`;
  }

  try {
    const res = await fetch(method.endpoint, { method: 'POST', headers, body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `SeeClickFix HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const json = await res.json().catch(() => null);
    return { ok: true, ticketId: json?.id ? String(json.id) : undefined };
  } catch (err) {
    return { ok: false, error: `SeeClickFix network error: ${String(err)}` };
  }
}
