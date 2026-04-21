// Supabase Edge Function: sync-open311-statuses
// Runs hourly via pg_cron. Polls Open311 / SeeClickFix endpoints for any
// API-escalated cluster whose external ticket is still open, and updates
// the cluster + escalation_log with the city's reported status.
//
// Authenticates via the same CRON_SECRET header as escalate-clusters so the
// pg_cron job can call it without a user session.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Map Open311/SeeClickFix status strings back to our internal report status.
// Keep the set small — anything we don't recognize stays as-is and is logged.
const STATUS_MAP: Record<string, string> = {
  open: 'submitted',
  'in progress': 'in_progress',
  in_progress: 'in_progress',
  acknowledged: 'acknowledged',
  closed: 'resolved',
  resolved: 'resolved',
  fixed: 'resolved',
  completed: 'resolved',
  rejected: 'rejected',
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const cronSecret = req.headers.get('x-cron-secret');
  const expectedCronSecret = Deno.env.get('CRON_SECRET') || '';
  if (!cronSecret || cronSecret !== expectedCronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Find open API-submitted escalations that haven't been polled recently
  // (or ever). Only look at the last 180 days — don't keep polling tickets
  // forever; cities sometimes drop them silently.
  const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from('escalation_log')
    .select('id, cluster_id, method, recipient, external_ticket_id, external_status')
    .like('method', 'api:%')
    .not('external_ticket_id', 'is', null)
    .neq('external_status', 'resolved')
    .neq('external_status', 'closed')
    .neq('external_status', 'rejected')
    .gte('sent_at', cutoff)
    .order('last_status_check_at', { ascending: true, nullsFirst: true })
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const row of rows ?? []) {
    try {
      let newStatus: string | null = null;
      if (row.method === 'api:open311') {
        newStatus = await fetchOpen311Status(row.recipient, row.external_ticket_id!);
      } else if (row.method === 'api:seeclickfix') {
        newStatus = await fetchSeeClickFixStatus(row.external_ticket_id!);
      }

      await supabase
        .from('escalation_log')
        .update({
          last_status_check_at: new Date().toISOString(),
          external_status: newStatus ?? row.external_status,
        })
        .eq('id', row.id);

      // If status changed to a resolved-ish state, propagate to the cluster.
      if (newStatus && newStatus !== row.external_status) {
        const internal = STATUS_MAP[newStatus.toLowerCase()];
        if (internal) {
          await supabase
            .from('report_clusters')
            .update({
              status: internal,
              resolved_at: internal === 'resolved' ? new Date().toISOString() : null,
            })
            .eq('id', row.cluster_id);
        }
        results.push({
          logId: row.id,
          clusterId: row.cluster_id,
          statusChanged: true,
          from: row.external_status,
          to: newStatus,
          internalStatus: internal ?? '(unmapped)',
        });
      } else {
        results.push({ logId: row.id, statusChanged: false, status: newStatus ?? 'unknown' });
      }
    } catch (err) {
      results.push({ logId: row.id, error: String(err) });
    }
  }

  return new Response(
    JSON.stringify({ message: 'Status sync complete', polled: results.length, results }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});

/** Open311 GeoReport v2: GET /requests/:id.json  → status field */
async function fetchOpen311Status(
  endpoint: string,
  ticketId: string,
): Promise<string | null> {
  // Convert the POST endpoint URL into the GET-single-request URL.
  //   https://host/path/requests.json  →  https://host/path/requests/:id.json
  const url = endpoint.replace(/requests\.json$/i, `requests/${encodeURIComponent(ticketId)}.json`);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Open311 GET ${res.status}`);
  const json = await res.json();
  const first = Array.isArray(json) ? json[0] : json;
  return first?.status ?? null;
}

/** SeeClickFix v2: GET /issues/:id  → status field (e.g. "Open", "Acknowledged", "Closed") */
async function fetchSeeClickFixStatus(ticketId: string): Promise<string | null> {
  const url = `https://seeclickfix.com/api/v2/issues/${encodeURIComponent(ticketId)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`SeeClickFix GET ${res.status}`);
  const json = await res.json();
  return json?.status ?? null;
}
