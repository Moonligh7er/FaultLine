// ============================================================
// ADA Title III Standards Dataset (commercial-property side)
//
// Analogous to src/services/statutes/ but scoped to the 2010 ADA Standards
// for Accessible Design (28 CFR Part 36). Fault Line's commercial-property
// letter generator consumes this dataset to cite the specific standard a
// reported barrier violates.
//
// All entries start `pending-review` — commercial-side legal claims are
// meaningfully different from public-entity Title II claims and need
// independent qualified review before promotion to `verified`.
// ============================================================

export type TitleIIIVerificationStatus =
  | 'verified'
  | 'pending-review'
  | 'stale'
  | 'draft';

export interface TitleIIIStandard {
  standardId: string;              // Category key that this standard covers
  version: string;
  standardCitation: string;        // e.g., "2010 ADA Standards § 302.3"
  standardUrl: string;             // Primary-source .gov link
  standardTitle: string;
  description: string;             // Plain-language summary of the requirement
  measurableThreshold?: string;    // e.g., "Running slope 1:12 max" — where applicable
  knownAmbiguities: Array<{ concern: string; detail: string }>;
  verificationStatus: TitleIIIVerificationStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  nextReviewAt: string | null;
}

const STANDARDS: TitleIIIStandard[] = [
  {
    standardId: 'accessible-route-slope',
    version: '0.1.0',
    standardCitation: '2010 ADA Standards § 403.3',
    standardUrl: 'https://www.ada.gov/law-and-regs/design-standards/2010-stds/',
    standardTitle: 'Accessible route running slope',
    description:
      'Running slope of walking surfaces shall not be steeper than 1:20. Ramps (running slope steeper than 1:20) shall comply with § 405.',
    measurableThreshold: 'Running slope > 1:20 requires ramp compliance; ramp slope > 1:12 non-compliant.',
    knownAmbiguities: [
      {
        concern: 'Existing construction vs. new construction',
        detail:
          '2010 Standards apply to alterations and new construction; conditions predating the standard may fall under different compliance timelines. Consult counsel on which standards year applies.',
      },
    ],
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
  },
  {
    standardId: 'accessible-entrance',
    version: '0.1.0',
    standardCitation: '2010 ADA Standards § 206.4',
    standardUrl: 'https://www.ada.gov/law-and-regs/design-standards/2010-stds/',
    standardTitle: 'Accessible entrances',
    description:
      'At least 60% of all public entrances shall be accessible. Where a facility contains a restricted entrance, at least one restricted entrance shall be accessible.',
    knownAmbiguities: [
      {
        concern: 'Alternate accessible entrance sufficiency',
        detail:
          'An alternate accessible entrance may satisfy § 206.4 but the alternate must be identified by directional signage and open during the same hours as the primary entrance.',
      },
    ],
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
  },
  {
    standardId: 'accessible-parking',
    version: '0.1.0',
    standardCitation: '2010 ADA Standards § 208 + § 502',
    standardUrl: 'https://www.ada.gov/law-and-regs/design-standards/2010-stds/',
    standardTitle: 'Accessible parking spaces',
    description:
      'Minimum number of accessible parking spaces required by total parking count; van-accessible spaces required in ratio. Access aisles must be marked and connect to an accessible route.',
    measurableThreshold: 'See § 208 table for count requirements; van-accessible aisle min 96".',
    knownAmbiguities: [
      {
        concern: 'Blocking of access aisle',
        detail:
          'A parked vehicle or object blocking a marked access aisle is an ongoing violation independent of the aisle marking itself.',
      },
    ],
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
  },
  {
    standardId: 'accessible-restroom',
    version: '0.1.0',
    standardCitation: '2010 ADA Standards § 213',
    standardUrl: 'https://www.ada.gov/law-and-regs/design-standards/2010-stds/',
    standardTitle: 'Toilet facilities and bathing rooms',
    description:
      'Where toilet facilities are provided, they shall be accessible. Where multiple single-user rooms are clustered, at least 50% shall be accessible.',
    knownAmbiguities: [
      {
        concern: 'Employee-only vs. public toilets',
        detail:
          '§ 213 addresses toilet rooms provided to the public. Employee-only facilities are addressed separately and outside the commercial-property report scope.',
      },
    ],
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
  },
  {
    standardId: 'signage-tactile',
    version: '0.1.0',
    standardCitation: '2010 ADA Standards § 216 + § 703',
    standardUrl: 'https://www.ada.gov/law-and-regs/design-standards/2010-stds/',
    standardTitle: 'Signs identifying permanent rooms and spaces',
    description:
      'Signs designating permanent rooms and spaces shall include tactile characters and braille complying with § 703. Directional and informational signs have separate visual-character requirements.',
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    knownAmbiguities: [],
  },
];

// ── Public accessors ──────────────────────────────────────────────────────

export function getTitleIIIStandard(standardId: string): TitleIIIStandard | null {
  const match = STANDARDS.find((s) => s.standardId === standardId);
  if (!match || match.verificationStatus === 'draft') return null;
  return match;
}

export function allTitleIIIStandards(): TitleIIIStandard[] {
  return STANDARDS.filter((s) => s.verificationStatus !== 'draft');
}

export function titleIIIDisclaimer(standard: TitleIIIStandard): string {
  const versionLine = `Standard reference: ${standard.standardId} v${standard.version}`;
  switch (standard.verificationStatus) {
    case 'verified':
      return `${versionLine} · reviewed: ${standard.verifiedBy || 'unnamed reviewer'}, ${standard.verifiedAt || 'date unknown'}. Not legal advice.`;
    case 'stale':
      return `${versionLine} · review OVERDUE. Verify against current 2010 ADA Standards. Not legal advice.`;
    case 'pending-review':
      return `${versionLine} · NOT YET LEGALLY REVIEWED. Standard citation is our best current reading. Verify before relying on this letter. Not legal advice.`;
    case 'draft':
      return `${versionLine} · draft entry, not for user delivery.`;
  }
}
