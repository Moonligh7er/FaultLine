import type {
  AuthorityContact,
  RightOfReplyEntry,
  RightOfReplyStatus,
  RightOfReplySubject,
} from './types';

// ============================================================
// Right-of-Reply Engine
//
// Pure functions that compute status transitions and next-actions for
// right-of-reply entries. Persistence is not this module's job — a caller
// in Supabase Edge Functions or the app itself is expected to write the
// returned entry to the `right_of_reply` table.
//
// Windows per the published methodology:
//   - press-summary:        24 hours   (see /briefing-packets §5)
//   - commercial-property:  14 days    (see /business-property §5)
//   - commercial-chain:     14 days
// ============================================================

const WINDOW_HOURS_BY_SUBJECT: Record<RightOfReplySubject, number> = {
  'press-summary': 24,
  'commercial-property': 24 * 14,
  'commercial-chain': 24 * 14,
};

/**
 * Create a new right-of-reply entry. Status starts at 'pending-notification'
 * — the caller schedules a job to send the pre-notification, which flips
 * status to 'notification-sent'.
 */
export function createEntry(input: {
  id: string;
  subject: RightOfReplySubject;
  targetIdentifier: string;
  authorityContact: AuthorityContact;
  now?: Date;
}): RightOfReplyEntry {
  const now = input.now ?? new Date();
  const windowHours = WINDOW_HOURS_BY_SUBJECT[input.subject];
  return {
    id: input.id,
    subject: input.subject,
    targetIdentifier: input.targetIdentifier,
    authorityContact: input.authorityContact,
    status: 'pending-notification',
    createdAt: now.toISOString(),
    windowDays: windowHours / 24,
  };
}

/**
 * Transition entry to 'notification-sent' and set the response-window deadline.
 * Idempotent — if the entry is already past pending-notification, returns unchanged.
 */
export function markNotificationSent(
  entry: RightOfReplyEntry,
  now: Date = new Date(),
): RightOfReplyEntry {
  if (entry.status !== 'pending-notification') return entry;
  const windowHours = WINDOW_HOURS_BY_SUBJECT[entry.subject];
  const deadline = new Date(now.getTime() + windowHours * 3600_000);
  return {
    ...entry,
    status: 'notification-sent',
    notificationSentAt: now.toISOString(),
    responseWindowDeadlineAt: deadline.toISOString(),
  };
}

/**
 * Ingest an authority/owner response. Response content is appended to any
 * downstream publication. Status flips to 'response-received' but the window
 * is NOT closed — additional responses can arrive up to the deadline.
 */
export function appendResponse(
  entry: RightOfReplyEntry,
  responseContent: string,
  now: Date = new Date(),
): RightOfReplyEntry {
  if (entry.status === 'published' || entry.status === 'withdrawn') return entry;
  const existing = entry.responseContent ? entry.responseContent + '\n\n---\n\n' : '';
  return {
    ...entry,
    status: 'response-received',
    responseReceivedAt: entry.responseReceivedAt ?? now.toISOString(),
    responseContent: existing + responseContent,
  };
}

/**
 * Owner remediated the reported condition before publication. Publication
 * is suppressed — no public attribution occurs. Applies to commercial subjects.
 */
export function markRemediated(entry: RightOfReplyEntry): RightOfReplyEntry {
  if (entry.subject === 'press-summary') return entry; // Press summaries don't remediate — the underlying report resolution does
  return {
    ...entry,
    status: 'remediated',
    suppressedReason: 'remediated',
  };
}

/**
 * Compute the effective status against the current time. If the response
 * window has expired without a response, transitions to 'window-expired' —
 * downstream publication can proceed.
 */
export function effectiveStatus(
  entry: RightOfReplyEntry,
  now: Date = new Date(),
): RightOfReplyStatus {
  if (
    entry.status !== 'notification-sent' &&
    entry.status !== 'response-received'
  ) {
    return entry.status;
  }
  if (!entry.responseWindowDeadlineAt) return entry.status;
  const deadline = Date.parse(entry.responseWindowDeadlineAt);
  if (Number.isNaN(deadline)) return entry.status;
  if (now.getTime() < deadline) return entry.status;
  // Window has passed
  return entry.status === 'response-received' ? 'response-received' : 'window-expired';
}

/**
 * Is this entry ready for downstream publication? True if window is closed
 * (with or without response) and no remediation / withdrawal blocked it.
 */
export function isReadyToPublish(
  entry: RightOfReplyEntry,
  now: Date = new Date(),
): boolean {
  const status = effectiveStatus(entry, now);
  if (status === 'remediated' || status === 'withdrawn' || status === 'published') {
    return false;
  }
  if (status === 'window-expired') return true;
  if (status === 'response-received') {
    if (!entry.responseWindowDeadlineAt) return true;
    return now.getTime() >= Date.parse(entry.responseWindowDeadlineAt);
  }
  return false;
}

/**
 * Mark the entry as published. Downstream publication (press distribution,
 * public listing) happens outside this module.
 */
export function markPublished(
  entry: RightOfReplyEntry,
  now: Date = new Date(),
): RightOfReplyEntry {
  return {
    ...entry,
    status: 'published',
    publishedAt: now.toISOString(),
  };
}

/**
 * Human-readable description of the entry's current gating state.
 * Used in the packet-generator to explain why a summary is/isn't published yet.
 */
export function describeStatus(
  entry: RightOfReplyEntry,
  now: Date = new Date(),
): string {
  const status = effectiveStatus(entry, now);
  switch (status) {
    case 'pending-notification':
      return `Pre-notification pending. Will be sent to ${entry.authorityContact.contactName}.`;
    case 'notification-sent': {
      if (!entry.responseWindowDeadlineAt) return `Notification sent.`;
      const ms = Date.parse(entry.responseWindowDeadlineAt) - now.getTime();
      const hours = Math.max(0, Math.ceil(ms / 3600_000));
      return `Notification sent. Response window: ${hours} hours remaining.`;
    }
    case 'response-received':
      return `Response received from ${entry.authorityContact.contactName}. Window ongoing — response will be appended to publication.`;
    case 'window-expired':
      return `Response window expired without material reply. Ready to publish.`;
    case 'remediated':
      return `Owner remediated during notification window. Publication suppressed.`;
    case 'published':
      return `Published at ${entry.publishedAt}.`;
    case 'withdrawn':
      return `Withdrawn (${entry.suppressedReason ?? 'unspecified'}).`;
  }
}
