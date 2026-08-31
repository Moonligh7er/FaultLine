// ============================================================
// Property-Ownership Lookup (Assessor Bridge)
//
// For a given commercial property address, resolve the responsible owner
// of record via the applicable municipal assessor / registry of deeds.
//
// Municipal assessor coverage is per-city — some publish open data, some
// publish PDF-only, some don't publish at all. During pilot, each pilot
// city provides an ingestion path (open-data URL, batch export, or manual
// coordinator). This module defines the interface + a per-jurisdiction
// adapter registry.
//
// See DEFERRED #31 → Assessor Property-Ownership Lookup sub-item.
// ============================================================

export type AssessorVerificationStatus =
  | 'verified'         // Reviewed against current assessor record
  | 'pending-review'   // Best-guess from public source, not yet cross-checked
  | 'stale'            // Was verified but past nextReviewAt
  | 'draft';           // Not shipped to users

export interface OwnerOfRecord {
  ownerName: string;
  ownerMailingAddress?: string;
  ownerType?: 'individual' | 'llc' | 'corporation' | 'trust' | 'government' | 'other';
  parcelId?: string;              // Municipal parcel / lot identifier
  lastAssessedValue?: number;
  assessorSourceUrl?: string;     // URL back to the assessor record
  verifiedAt?: string;            // ISO date the record was cross-checked
  verificationStatus: AssessorVerificationStatus;
}

// Adapter interface — one per pilot jurisdiction as they onboard.
export interface AssessorAdapter {
  jurisdictionId: string;         // e.g., "boston-ma" | "cambridge-ma" | "providence-ri"
  sourceLabel: string;            // Human-readable — "City of Cambridge Assessing Department"
  sourceUrl?: string;             // Where residents can verify manually
  lookup: (address: string) => Promise<OwnerOfRecord | null>;
}

// ── Adapter registry ──────────────────────────────────────────────────────
//
// Real adapters are added during pilot-city onboarding. Each pilot city
// provides one of:
//   1. Open-data API URL (best case — Cambridge, Boston BPDA)
//   2. Downloadable CSV/GeoJSON that we import periodically
//   3. Manual per-property lookup URL that a Fault Line volunteer verifies
//
// Until at least one pilot city commits, all lookups return null with a
// clear message explaining what's missing. The commercial-report flow can
// still submit — publication is gated on owner identification anyway per
// the /business-property aggregation threshold.

const ADAPTERS: AssessorAdapter[] = [];

// ── Public accessors ──────────────────────────────────────────────────────

export function registerAdapter(adapter: AssessorAdapter): void {
  // Idempotent — replaces existing adapter for the same jurisdictionId.
  const existing = ADAPTERS.findIndex((a) => a.jurisdictionId === adapter.jurisdictionId);
  if (existing >= 0) {
    ADAPTERS[existing] = adapter;
  } else {
    ADAPTERS.push(adapter);
  }
}

export function listAdapters(): AssessorAdapter[] {
  return [...ADAPTERS];
}

export async function lookupOwner(
  address: string,
  jurisdictionId: string,
): Promise<OwnerOfRecord | null> {
  const adapter = ADAPTERS.find((a) => a.jurisdictionId === jurisdictionId);
  if (!adapter) {
    // No adapter for this jurisdiction. Caller should surface a message
    // asking the resident to include the property owner name manually,
    // or defer publication until an adapter is added.
    return null;
  }
  try {
    return await adapter.lookup(address);
  } catch {
    return null;
  }
}

/**
 * Return a human-readable disclaimer describing the assessor record's
 * verification status. Included in commercial demand letters and public
 * aggregations so recipients know the ownership claim's provenance.
 */
export function ownerDisclaimer(owner: OwnerOfRecord | null): string {
  if (!owner) {
    return 'Owner of record: not resolved. This jurisdiction does not yet have an assessor adapter registered with Fault Line — verify ownership independently before mailing.';
  }
  switch (owner.verificationStatus) {
    case 'verified':
      return `Owner of record: verified against assessor source${owner.assessorSourceUrl ? ` (${owner.assessorSourceUrl})` : ''} on ${owner.verifiedAt || 'date unknown'}.`;
    case 'stale':
      return `Owner of record: was verified but review is OVERDUE. Verify against current assessor record before mailing.`;
    case 'pending-review':
      return `Owner of record: NOT YET VERIFIED against assessor source. Best-guess from public record. Verify before mailing.`;
    case 'draft':
      return `Owner of record: draft entry, not for user delivery.`;
  }
}
