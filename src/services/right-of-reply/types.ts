// Right-of-reply pipeline — shared infrastructure used by:
//   - #27 Briefing Packets (press-summary distribution)
//   - #31 Commercial Property Reporting (public attribution)
//
// The pipeline tracks: authority pre-notification, response-window deadline,
// append-response ingestion, and gating of the downstream publication step
// until the window closes (or a response arrives that materially changes the
// distributable artifact).

export type RightOfReplySubject =
  | 'press-summary'          // A cluster-threshold press-ready summary
  | 'commercial-property'    // A property-level aggregated attribution
  | 'commercial-chain';      // A chain-level aggregated attribution

export type RightOfReplyStatus =
  | 'pending-notification'   // Ready to fire pre-notification but hasn't yet
  | 'notification-sent'      // Pre-notification delivered; window open
  | 'response-received'      // Authority/owner replied within the window
  | 'window-expired'         // Window closed without response
  | 'remediated'             // Owner remediated; publication suppressed (commercial only)
  | 'published'              // Downstream publication went out (or was suppressed on remediation)
  | 'withdrawn';             // Report withdrew before publication

export interface AuthorityContact {
  contactName: string;
  contactRole: string;
  email?: string;
  webForm?: string;
  address?: string;
}

export interface RightOfReplyEntry {
  id: string;
  subject: RightOfReplySubject;
  targetIdentifier: string;           // property address / chain-id / cluster-id
  authorityContact: AuthorityContact;
  status: RightOfReplyStatus;
  createdAt: string;                  // ISO
  notificationSentAt?: string;
  responseWindowDeadlineAt?: string;  // ISO — hard deadline
  responseReceivedAt?: string;
  responseContent?: string;           // Free-text response appended to the publication
  publishedAt?: string;
  suppressedReason?: 'remediated' | 'withdrawn' | 'insufficient-evidence';
  windowDays: number;                 // For audit: which window this ROR was scheduled under
}
