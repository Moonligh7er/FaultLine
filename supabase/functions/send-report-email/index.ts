// Supabase Edge Function: send-report-email
// All email sending goes through this function.
// The Resend API key ONLY exists here — never in the client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev';
const REPLY_TO = Deno.env.get('REPLY_TO') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Auth: require valid user token
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.substring(7));
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'Email service not configured' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Rate limit: max 5 emails per user per hour
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const { count } = await supabase
    .from('escalation_log')
    .select('*', { count: 'exact', head: true })
    .eq('method', 'email')
    .gte('sent_at', oneHourAgo);

  if ((count || 0) >= 5) {
    return new Response(JSON.stringify({ error: 'Email rate limit exceeded' }), {
      status: 429, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { to, report, authorityName } = await req.json();

  if (!to || !report) {
    return new Response(JSON.stringify({ error: 'Missing required fields: to, report' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return new Response(JSON.stringify({ error: 'Invalid email address' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const category = (report.category || 'issue').replace('_', ' ');
  const location = [report.location?.address, report.location?.city, report.location?.state].filter(Boolean).join(', ');

  const subject = `[Fault Line] Community Report: ${category} at ${location || 'reported location'}`;

  const body = `Dear ${authorityName || 'Public Works Department'},

A community member has reported an infrastructure issue in your jurisdiction.

REPORT DETAILS
${'━'.repeat(40)}
Category: ${category}
Location: ${location || 'See coordinates below'}
GPS: ${report.location?.latitude?.toFixed(6)}, ${report.location?.longitude?.toFixed(6)}
Maps: https://maps.google.com/?q=${report.location?.latitude},${report.location?.longitude}
Hazard Level: ${report.severity?.hazardLevel || 'moderate'}
${report.description ? `Description: ${report.description}` : ''}

Community Impact: ${report.upvoteCount || 0} upvotes, ${report.confirmCount || 0} confirmations
${report.mediaUrls?.length ? `Photos: ${report.mediaUrls.join(', ')}` : ''}

This report was submitted via Fault Line, a community infrastructure reporting platform.

Thank you for your service to the community.

Fault Line Community Reports`;

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
      const errorBody = await response.text();
      return new Response(JSON.stringify({ error: `Email send failed: ${response.status}`, detail: errorBody }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    return new Response(JSON.stringify({ success: true, emailId: result.id }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
