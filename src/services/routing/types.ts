// Versioned schema for per-category authority routing (Access & Equity + physical infrastructure).
// Mirrors the pattern established in src/services/statutes/ — every entry carries a
// verification chain of custody, and the letter generator prepends an unreviewed-content
// banner when the underlying routing has not been attorney-reviewed.

export type RoutingVerificationStatus =
  | 'verified'
  | 'pending-review'
  | 'stale'
  | 'draft';

export interface AuthorityContact {
  name: string;                   // "Municipal ADA Coordinator" — the role, not the individual
  email?: string;                 // Only if publicly listed on a .gov page
  webForm?: string;               // URL of the public reporting form, if one exists
  address?: string;               // Physical address for mailed notices when required (RI clerk-of-record cases)
  notes?: string;                 // "Notice must be delivered to clerk of record, not DPW"
}

export interface RoutingSource {
  label: string;
  url: string;
  accessedAt: string;             // ISO date the reviewer last read the source
}

export interface CategoryRouting {
  // ── Identity ────────────────────────────────────────────
  categoryKey: string;            // Matches src/constants/categories.ts key OR access-equity taxonomy row id
  version: string;                // Semver per routing record
  jurisdictionScope: string;      // "MA" | "RI" | "NH" | "federal-fallback" | "US-national" etc.

  // ── Routing ─────────────────────────────────────────────
  primaryAuthority: AuthorityContact;
  escalationAuthority?: AuthorityContact;
  federalFallback?: AuthorityContact;

  // ── Legal framing ──────────────────────────────────────
  legalStatute?: {
    citation: string;             // "28 CFR Part 35" | "M.G.L. c. 84 § 15" etc.
    url: string;
    notes?: string;
  };

  // ── Verification chain of custody ──────────────────────
  verificationStatus: RoutingVerificationStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  nextReviewAt: string | null;
  sources: RoutingSource[];
}

export interface RoutingDatasetMetadata {
  datasetVersion: string;
  lastUpdatedAt: string;
  reviewPolicy: string;           // Points at ./README.md
}
