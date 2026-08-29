// Versioned schema for per-state defective-highway / municipal-liability statutes.
// A record is only considered production-safe when verificationStatus === 'verified'.
// Any other status forces the letter generator to prepend a stronger disclaimer.

export type VerificationStatus =
  | 'verified'           // A licensed attorney or credentialed legal researcher reviewed this entry against primary sources.
  | 'pending-review'     // Entry exists but has NOT been reviewed. Letter output must warn the user.
  | 'stale'              // Was verified once, but nextReviewAt has passed. Treat as pending-review until re-verified.
  | 'draft';             // Not shipped to users. Excluded from getSupportedStates().

export interface SourceCitation {
  label: string;         // Human-readable name (e.g., "Massachusetts General Laws, Chapter 84, Section 15").
  url: string;           // Direct link to the authoritative statute text on a .gov or .state.[xx].us domain when possible.
  accessedAt: string;    // ISO date the reviewer last read the source. Not the same as verifiedAt.
}

export interface KnownAmbiguity {
  concern: string;       // Short label — what could go wrong for a user relying on this.
  detail: string;        // What is disputed / unclear / jurisdiction-specific / recently litigated.
}

export interface StateStatuteRecord {
  // ── Identity ────────────────────────────────────────────────
  stateCode: string;                 // Two-letter USPS code, uppercase.
  version: string;                   // Semver per state. Bump when any field changes.
  statute: string;                   // Citation string used in the letter body (e.g., "M.G.L. c. 84, § 15").
  title: string;                     // Descriptive title used in the letter body.

  // ── Legal substance ────────────────────────────────────────
  noticePeriodDays: number;          // Days from incident to written notice deadline. THIS IS THE HARM VECTOR — get it wrong and a user can lose a claim.
  description: string;               // One-paragraph plain-language summary of the liability rule.
  filingRequirements: string;        // Where / to whom / by when the notice must be delivered, plus claim caps.
  knownAmbiguities: KnownAmbiguity[]; // Cases where a lawyer would want to advise before relying on this.

  // ── Verification chain of custody ──────────────────────────
  verificationStatus: VerificationStatus;
  verifiedBy: string | null;         // Name + role of the reviewer, or null if never reviewed. Never a bot.
  verifiedAt: string | null;         // ISO date of the review. Null if never reviewed.
  nextReviewAt: string | null;       // ISO date the entry must be re-verified. Typical: verifiedAt + 12 months.
  sources: SourceCitation[];         // The primary sources the reviewer cross-checked. At least one required for 'verified' status.
}

export interface DatasetMetadata {
  datasetVersion: string;            // Bumps when a state is added or removed.
  lastUpdatedAt: string;             // ISO date of the most recent dataset-level change.
  legalReviewPolicy: string;         // One-line pointer to the review protocol in this directory's README.
}
