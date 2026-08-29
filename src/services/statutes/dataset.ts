import type { StateStatuteRecord, DatasetMetadata } from './types';

// ═══════════════════════════════════════════════════════════════════════════
//  DEFECTIVE-HIGHWAY / MUNICIPAL-LIABILITY STATUTE DATASET
//
//  READ BEFORE EDITING: ./README.md
//
//  Each record below is legal claim about a specific jurisdiction. A wrong
//  noticePeriodDays or a mis-cited section can cost a user their actual
//  claim against a municipality. Do not edit these values without going
//  through the review protocol in README.md and updating the verification
//  chain of custody (verifiedBy / verifiedAt / sources).
// ═══════════════════════════════════════════════════════════════════════════

export const DATASET_METADATA: DatasetMetadata = {
  datasetVersion: '0.1.0',
  lastUpdatedAt: '2026-08-29',
  legalReviewPolicy: 'See src/services/statutes/README.md — no record ships as `verified` without a named licensed reviewer and at least one primary-source citation.',
};

// Ordered by state code. When adding a state, insert alphabetically.
const RECORDS: StateStatuteRecord[] = [
  {
    stateCode: 'MA',
    version: '0.1.0',
    statute: 'M.G.L. c. 84, § 15',
    title: 'Massachusetts Defective Highway Statute',
    noticePeriodDays: 30,
    description:
      'Municipalities are liable for damages caused by defects in public ways if they had actual or constructive notice of the defect and failed to remedy it within a reasonable time.',
    filingRequirements:
      'Written notice must be provided to the municipality within 30 days of the injury/damage. Claims must be filed within 3 years.',
    knownAmbiguities: [
      {
        concern: 'State highways vs. municipal ways',
        detail:
          'Defects on state-numbered routes may be MassDOT responsibility rather than the municipality, changing both the recipient and the applicable statute (M.G.L. c. 81, § 18). The letter generator should route by road ownership, not just GPS-in-city.',
      },
      {
        concern: 'Personal injury vs. property damage',
        detail:
          'The 30-day notice rule is well-settled for personal injury; property-damage-only claims (e.g., tire damage) have been treated differently in some appellate decisions. Users pursuing property-only damages should consult counsel.',
      },
      {
        concern: 'Notice content requirements',
        detail:
          'Notice must state the time, place, and cause. Vague notice has been held insufficient. Fault Line letters include GPS + date + hazard type to satisfy this, but a reviewer should confirm the specific wording still passes.',
      },
    ],
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [
      {
        label: 'M.G.L. c. 84, § 15 — Notice of injury on defective way',
        url: 'https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXIV/Chapter84/Section15',
        accessedAt: '2026-08-29',
      },
    ],
  },
  {
    stateCode: 'RI',
    version: '0.1.0',
    statute: 'R.I. Gen. Laws § 24-5-14',
    title: 'Rhode Island Highway Defect Liability',
    noticePeriodDays: 60,
    description:
      'Towns and cities are liable for damages from defective highways, bridges, and sidewalks when they had notice of the condition.',
    filingRequirements:
      'Written notice to the town/city clerk within 60 days of the incident.',
    knownAmbiguities: [
      {
        concern: 'Clerk-of-record delivery',
        detail:
          'Rhode Island courts have been strict about notice being delivered to the correct town/city clerk, not to public works. Fault Line letters should default to the clerk, with a fallback to the escalation recipient.',
      },
      {
        concern: 'State-maintained roads (RIDOT)',
        detail:
          'RIDOT liability for state highways follows a different framework and different notice rules. Route by road ownership.',
      },
    ],
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [
      {
        label: 'R.I. Gen. Laws § 24-5-14',
        url: 'http://webserver.rilin.state.ri.us/Statutes/TITLE24/24-5/24-5-14.HTM',
        accessedAt: '2026-08-29',
      },
    ],
  },
  {
    stateCode: 'NH',
    version: '0.1.0',
    statute: 'RSA 231:90-92',
    title: 'New Hampshire Highway Liability',
    noticePeriodDays: 60,
    description:
      'Municipalities may be liable for damages caused by insufficiency of a highway or bridge if they had actual notice or the defect was so obvious it constituted constructive notice.',
    filingRequirements:
      'Written notice within 60 days. Claim limit of $50,000 per occurrence.',
    knownAmbiguities: [
      {
        concern: 'Statutory cap',
        detail:
          'The $50,000 per-occurrence cap is a hard limit and should be surfaced to users before they invest effort in a claim. Confirm current cap against RSA at each review — legislative amendments have adjusted municipal-liability caps in other states in recent years.',
      },
      {
        concern: '"Insufficiency" threshold',
        detail:
          'Not every defect is an "insufficiency" under NH case law. Cosmetic or minor issues typically do not qualify. The letter should describe the hazard in terms that meet the insufficiency standard.',
      },
    ],
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [
      {
        label: 'RSA 231:90 — Liability of municipalities',
        url: 'https://www.gencourt.state.nh.us/rsa/html/xx/231/231-90.htm',
        accessedAt: '2026-08-29',
      },
      {
        label: 'RSA 231:91 — Notice requirements',
        url: 'https://www.gencourt.state.nh.us/rsa/html/xx/231/231-91.htm',
        accessedAt: '2026-08-29',
      },
      {
        label: 'RSA 231:92 — Limitations on recovery',
        url: 'https://www.gencourt.state.nh.us/rsa/html/xx/231/231-92.htm',
        accessedAt: '2026-08-29',
      },
    ],
  },
];

// ── Public accessors ───────────────────────────────────────────────────────

export function getStatuteRecord(stateCode: string): StateStatuteRecord | null {
  const normalized = stateCode?.toUpperCase();
  const record = RECORDS.find((r) => r.stateCode === normalized);
  if (!record) return null;
  if (record.verificationStatus === 'draft') return null;
  return effectiveRecord(record);
}

// getSupportedStates returns states usable by the letter generator (including pending-review,
// which is still usable but forces a stronger disclaimer at the top of any letter).
export function getSupportedStates(): string[] {
  return RECORDS
    .filter((r) => r.verificationStatus !== 'draft')
    .map((r) => r.stateCode);
}

// getVerifiedStates returns only states with `verified` status. Marketing surfaces
// that make hard legal claims (e.g., "cites your state's actual statute") should
// prefer this list once at least one state clears legal review.
export function getVerifiedStates(): string[] {
  return RECORDS
    .filter((r) => effectiveVerificationStatus(r) === 'verified')
    .map((r) => r.stateCode);
}

// Returns the record with its verificationStatus updated to 'stale' if the review
// window has lapsed. Downstream code should always consume the effective record.
function effectiveRecord(record: StateStatuteRecord): StateStatuteRecord {
  const status = effectiveVerificationStatus(record);
  if (status === record.verificationStatus) return record;
  return { ...record, verificationStatus: status };
}

function effectiveVerificationStatus(record: StateStatuteRecord): typeof record.verificationStatus {
  if (record.verificationStatus !== 'verified') return record.verificationStatus;
  if (!record.nextReviewAt) return 'stale';
  const dueDate = Date.parse(record.nextReviewAt);
  if (Number.isNaN(dueDate)) return 'stale';
  return Date.now() > dueDate ? 'stale' : 'verified';
}

// Human-readable status line for embedding in a demand letter footer or a
// disclaimer banner. Never returns empty — a 'verified' status still emits
// the versioning + review date so recipients can audit the source.
export function statuteDisclaimer(record: StateStatuteRecord): string {
  const status = effectiveVerificationStatus(record);
  const versionLine = `Statute reference: ${record.statute} · dataset ${record.stateCode} v${record.version}`;
  switch (status) {
    case 'verified':
      return `${versionLine} · legal review: ${record.verifiedBy || 'unnamed reviewer'}, ${record.verifiedAt || 'date unknown'}. Not legal advice.`;
    case 'stale':
      return `${versionLine} · legal review OVERDUE (last reviewed ${record.verifiedAt || 'never'}). Verify against current law before relying on this letter. Not legal advice.`;
    case 'pending-review':
      return `${versionLine} · NOT YET LEGALLY REVIEWED. This letter is a documentation aid, not verified legal notice. Consult a licensed attorney in ${record.stateCode} before relying on statutory deadlines. Not legal advice.`;
    case 'draft':
      return `${versionLine} · draft entry, not for user delivery.`;
  }
}
