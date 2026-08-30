// Aggregation thresholds for commercial-property publication.
// Values match the /business-property methodology page verbatim —
// changing them requires an updated page + guardrail review.

export const COMMERCIAL_PROPERTY_THRESHOLDS = {
  // Property-level attribution: name a specific address publicly only after N
  // verified reports from M distinct reporters over D days.
  property: {
    minReports: 5,
    minDistinctReporters: 3,
    windowDays: 90,
  },

  // Chain-level attribution: name a corporate brand publicly only after N
  // verified reports across L distinct locations from M distinct reporters
  // over D days.
  chain: {
    minReports: 15,
    minDistinctLocations: 5,
    minDistinctReporters: 10,
    windowDays: 180,
  },

  // Right-of-reply window before public attribution: property owner receives
  // pre-notification with N days to respond, remediate, or dispute.
  rightOfReplyWindowDays: 14,
} as const;
