import { supabase } from './supabase';
import { Report, Authority } from '../types';

// ============================================================
// Direct Authority API Integration
// Bidirectional sync with 311 systems and SeeClickFix
// ============================================================

export interface SubmissionResult {
  success: boolean;
  externalId?: string; // Ticket/case ID from the authority's system
  trackingUrl?: string; // URL to check status
  method: string;
  error?: string;
}

export interface StatusUpdate {
  externalId: string;
  status: string;
  lastUpdated: string;
  notes?: string;
}

// ============================================================
// SUBMIT TO AUTHORITY
// Queues the report server-side (send-report-email edge function). Nothing
// is sent from the device: the message waits in the outbound review queue
// (or is auto-approved when auto_send is on) and dispatch-outbound delivers
// it via the authority's city API or email.
// ============================================================

export async function submitToAuthority(
  report: Report,
  authority: Authority
): Promise<SubmissionResult> {
  try {
    const { data, error } = await supabase.functions.invoke('send-report-email', {
      body: { reportId: report.id, authorityId: authority.id },
    });
    if (error) return { success: false, method: 'queue', error: error.message };
    return { success: true, externalId: data?.ref, method: 'queue' };
  } catch (err) {
    return { success: false, method: 'queue', error: String(err) };
  }
}

// ============================================================
// BIDIRECTIONAL STATUS SYNC
// Pull status updates from 311/SeeClickFix
// ============================================================

export async function syncReportStatus(
  externalId: string,
  method: string,
  endpoint: string
): Promise<StatusUpdate | null> {
  if (method === 'open311') {
    return syncOpen311Status(externalId, endpoint);
  }
  if (method === 'seeclickfix') {
    return syncSeeClickFixStatus(externalId, endpoint);
  }
  return null;
}

async function syncOpen311Status(requestId: string, endpoint: string): Promise<StatusUpdate | null> {
  try {
    const baseUrl = endpoint.replace('/requests.json', '');
    const response = await fetch(`${baseUrl}/requests/${requestId}.json`);
    if (!response.ok) return null;

    const data = await response.json();
    const request = Array.isArray(data) ? data[0] : data;

    const statusMap: Record<string, string> = {
      open: 'submitted',
      acknowledged: 'acknowledged',
      in_progress: 'in_progress',
      closed: 'resolved',
    };

    return {
      externalId: requestId,
      status: statusMap[request?.status] || request?.status || 'submitted',
      lastUpdated: request?.updated_datetime || new Date().toISOString(),
      notes: request?.status_notes,
    };
  } catch {
    return null;
  }
}

async function syncSeeClickFixStatus(issueId: string, endpoint: string): Promise<StatusUpdate | null> {
  try {
    const baseUrl = endpoint.replace('/issues', '');
    const response = await fetch(`${baseUrl}/issues/${issueId}`);
    if (!response.ok) return null;

    const data = await response.json();

    const statusMap: Record<string, string> = {
      Open: 'submitted',
      Acknowledged: 'acknowledged',
      'In Progress': 'in_progress',
      Closed: 'resolved',
      Archived: 'closed',
    };

    return {
      externalId: issueId,
      status: statusMap[data?.status] || 'submitted',
      lastUpdated: data?.updated_at || new Date().toISOString(),
      notes: data?.comment_count ? `${data.comment_count} comments` : undefined,
    };
  } catch {
    return null;
  }
}

// ============================================================
// BATCH STATUS SYNC
// Run periodically to update all submitted reports
// ============================================================

export async function batchSyncStatuses(): Promise<{ updated: number; failed: number }> {
  const { data: submissions } = await supabase
    .from('escalation_log')
    .select('*')
    .eq('status', 'sent')
    .not('recipient', 'is', null);

  if (!submissions) return { updated: 0, failed: 0 };

  let updated = 0;
  let failed = 0;

  for (const sub of submissions) {
    if (!sub.submission_reference) continue;

    const statusUpdate = await syncReportStatus(
      sub.submission_reference,
      sub.method,
      sub.recipient
    );

    if (statusUpdate) {
      // Update cluster status
      await supabase
        .from('report_clusters')
        .update({ status: statusUpdate.status, updated_at: new Date().toISOString() })
        .eq('id', sub.cluster_id);
      updated++;
    } else {
      failed++;
    }
  }

  return { updated, failed };
}
