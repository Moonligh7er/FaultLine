// Packet generator — produces briefing packets and press-ready summaries.
// See /briefing-packets for the format and guardrails commitment.

export type PacketType = 'council-district-briefing' | 'press-cluster-summary';

export interface DistrictMetrics {
  jurisdictionName: string;
  districtId: string;
  districtLabel: string;               // "District 4"
  totalOpenReports: number;
  totalOpenReportsPriorMonth: number;
  medianResponseDays: number;
  citywideMedianResponseDays: number;
  reportsPastStatutoryDeadline: number;
  newVerifiedClusters: number;
  resolvedClustersThisMonth: number;
  topOpenItems: Array<{
    location: string;                  // Human-readable street / cross-street
    category: string;                  // Category label
    reportCount: number;
    daysOpen: number;
    context?: string;
  }>;
  fastestResolutions: Array<{
    location: string;
    category: string;
    daysToResolution: number;
    creditedCrew?: string;
  }>;
  equityFlags: Array<{
    censusTractGeoid: string;
    peerPercentile: number;
    categories: string[];
    note: string;
  }>;
}

export interface CouncilBriefingInput {
  packetType: 'council-district-briefing';
  reportingMonth: string;              // "October 2026"
  metrics: DistrictMetrics;
  methodologyUrl: string;              // Link back to /methodology
  councilMemberName?: string;          // Omitted if unknown
}

export interface PressSummaryInput {
  packetType: 'press-cluster-summary';
  triggerDescription: string;          // "Statutory deadline exceeded on Elm St pothole cluster"
  jurisdictionName: string;
  clusterId: string;
  location: string;                    // Human-readable
  firstReportedAt: string;             // ISO
  daysSinceFirstReport: number;
  daysPastStatutoryDeadline: number;
  statuteCitation: string;
  statuteCitationUrl: string;
  reportCount: number;
  distinctReporters: number;
  vehicleDamageReportsAttached: number;
  responsibleAuthority: string;
  authorityFirstNotifiedAt: string;
  reNotifications: string[];           // ISO dates
  photoEvidence: Array<{
    capturedAt: string;
    caption?: string;
    url?: string;
  }>;
  rightOfReplyStatus: string;          // From describeStatus() in right-of-reply engine
  responseContent?: string;            // If authority responded
  reportUrl: string;                   // Public URL for the underlying cluster
  methodologyUrl: string;
  statuteDatasetVersion: string;
  statuteVerificationStatus: string;   // "pending-review" etc — surfaces to the reporter
}

export type PacketInput = CouncilBriefingInput | PressSummaryInput;

export interface PacketOutput {
  packetType: PacketType;
  jsonPayload: object;                 // Machine-readable version for staff import
  markdownBody: string;                // Plain-text body for email / PDF conversion
  publicUrl?: string;                  // Where the packet will be hosted (fault-line.dev/briefings/...)
  generatedAt: string;
}
