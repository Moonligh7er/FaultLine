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
// ============================================================

export async function submitToAuthority(
  report: Report,
  authority: Authority
): Promise<SubmissionResult> {
  // Try submission methods in priority order
  const methods = [...authority.submissionMethods].sort((a, b) => a.priority - b.priority);

  for (const method of methods) {
    let result: SubmissionResult | null = null;

    switch (method.method) {
      case 'api':
        if (method.endpoint.includes('open311')) {
          result = await submitOpen311(report, method.endpoint);
        } else if (method.endpoint.includes('seeclickfix')) {
          result = await submitSeeClickFix(report, method.endpoint);
        }
        break;
      case 'email':
        result = await submitViaEmail(report, authority, method.endpoint);
        break;
    }

    if (result?.success) {
      // Log the submission
      await supabase.from('escalation_log').insert({
        cluster_id: report.clusterId,
        authority_id: authority.id,
        method: method.method,
        recipient: method.endpoint,
        subject: `Infrastructure report: ${report.category}`,
        status: 'sent',
        sent_at: new Date().toISOString(),
      });

      return result;
    }
  }

  return { success: false, method: 'none', error: 'All submission methods failed' };
}

// ============================================================
// OPEN311 API (Boston, many other cities)
// ============================================================

async function submitOpen311(report: Report, endpoint: string): Promise<SubmissionResult> {
  try {
    const categoryMap: Record<string, string> = {
      pothole: 'Pothole Repair',
      streetlight: 'Street Light Outages',
      sidewalk: 'Sidewalk Repair',
      graffiti: 'Graffiti Removal',
      signage: 'Sign Repair',
      drainage: 'Catch Basin',
      road_debris: 'Road Debris',
    };

    const serviceName = categoryMap[report.category] || 'General Request';

    const body = new URLSearchParams({
      service_code: report.category,
      lat: String(report.location.latitude),
      long: String(report.location.longitude),
      description: [
        report.description || `${serviceName} reported via Fault Line`,
        `Hazard: ${report.severity.hazardLevel}`,
        report.severity.sizeRating ? `Size: ${report.severity.sizeRating}` : '',
        `${report.upvoteCount} community upvotes, ${report.confirmCount} confirmations`,
      ].filter(Boolean).join('\n'),
      address_string: report.location.address || '',
    });

    // Add photo URL if available
    const photoUrl = report.media.find((m) => m.uploadedUrl)?.uploadedUrl;
    if (photoUrl) {
      body.append('media_url', photoUrl);
    }

    const response = await fetch(`${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      return { success: false, method: 'open311', error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const ticket = Array.isArray(data) ? data[0] : data;

    return {
      success: true,
      externalId: ticket?.service_request_id || ticket?.id,
      trackingUrl: ticket?.service_request_id
        ? `${endpoint.replace('/requests.json', '')}/requests/${ticket.service_request_id}`
        : undefined,
      method: 'open311',
    };
  } catch (err) {
    return { success: false, method: 'open311', error: String(err) };
  }
}

// ============================================================
// SEECLICKFIX API (Cambridge, many other cities)
// ============================================================

async function submitSeeClickFix(report: Report, endpoint: string): Promise<SubmissionResult> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: report.location.latitude,
        lng: report.location.longitude,
        address: report.location.address || '',
        summary: `${report.category.replace('_', ' ')} — reported via Fault Line`,
        description: [
          report.description || '',
          `Hazard level: ${report.severity.hazardLevel}`,
          report.severity.sizeRating ? `Size: ${report.severity.sizeRating}` : '',
          `Community verified: ${report.confirmCount} confirmations`,
        ].filter(Boolean).join('\n'),
        category_id: report.category,
        ...(report.media[0]?.uploadedUrl && {
          image_url: report.media[0].uploadedUrl,
        }),
      }),
    });

    if (!response.ok) {
      return { success: false, method: 'seeclickfix', error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    return {
      success: true,
      externalId: data?.id || data?.issue_id,
      trackingUrl: data?.html_url,
      method: 'seeclickfix',
    };
  } catch (err) {
    return { success: false, method: 'seeclickfix', error: String(err) };
  }
}

// ============================================================
// EMAIL SUBMISSION (via Resend edge function)
// ============================================================

async function submitViaEmail(
  report: Report,
  authority: Authority,
  email: string
): Promise<SubmissionResult> {
  try {
    const { data, error } = await supabase.functions.invoke('send-report-email', {
      body: {
        to: email,
        report: {
          category: report.category,
          location: report.location,
          severity: report.severity,
          description: report.description,
          upvoteCount: report.upvoteCount,
          confirmCount: report.confirmCount,
          mediaUrls: report.media.map((m) => m.uploadedUrl).filter(Boolean),
        },
        authorityName: authority.name,
      },
    });

    if (error) {
      return { success: false, method: 'email', error: error.message };
    }

    return {
      success: true,
      externalId: data?.emailId,
      method: 'email',
    };
  } catch (err) {
    return { success: false, method: 'email', error: String(err) };
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
