import type { CategoryRouting, RoutingDatasetMetadata } from './types';

// ═══════════════════════════════════════════════════════════════════════════
//  PER-CATEGORY AUTHORITY ROUTING DATASET
//
//  READ BEFORE EDITING: ./README.md
//
//  Every record below is a claim about which government office is
//  responsible for a particular infrastructure or access failure in a
//  particular jurisdiction. A wrong routing target means a resident's
//  report reaches the wrong desk and the statutory clock does not start.
//
//  All initial records are `pending-review` — usable by the letter
//  generator, but every generated letter prepends an unreviewed-content
//  banner so the resident sees that the underlying routing claim has not
//  yet been attorney-verified.
//
//  Coverage seeded here: MA / RI / NH pilot states + federal fallbacks.
//  Additional jurisdictions added as pilot cities commit.
// ═══════════════════════════════════════════════════════════════════════════

export const ROUTING_METADATA: RoutingDatasetMetadata = {
  datasetVersion: '0.1.0',
  lastUpdatedAt: '2026-08-30',
  reviewPolicy:
    'See src/services/routing/README.md — no record ships as `verified` without a named licensed reviewer and at least one primary-source citation.',
};

// Records ordered by (jurisdiction, categoryKey) for readability.
const RECORDS: CategoryRouting[] = [
  // ─────────────────────────────────────────────────────────────
  // FEDERAL FALLBACKS — apply when jurisdiction-specific routing
  // is not available. Every access & equity category has a
  // federal-level agency that will accept a complaint.
  // ─────────────────────────────────────────────────────────────
  {
    categoryKey: 'ada-title-ii-any',
    version: '0.1.0',
    jurisdictionScope: 'federal-fallback',
    primaryAuthority: {
      name: 'U.S. Department of Justice, Civil Rights Division',
      webForm: 'https://civilrights.justice.gov/report/',
      notes:
        'Federal complaint pathway for any ADA Title II violation by a state or local government entity. Use this when a jurisdiction-specific ADA coordinator cannot be identified or when the coordinator is the source of the failure.',
    },
    legalStatute: {
      citation: '28 CFR Part 35 (ADA Title II)',
      url: 'https://www.ada.gov/law-and-regs/regulations/title-ii-2010-regulations/',
    },
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [
      {
        label: 'DOJ ADA Title II regulations',
        url: 'https://www.ada.gov/law-and-regs/regulations/title-ii-2010-regulations/',
        accessedAt: '2026-08-30',
      },
      {
        label: 'DOJ Civil Rights complaint portal',
        url: 'https://civilrights.justice.gov/report/',
        accessedAt: '2026-08-30',
      },
    ],
  },
  {
    categoryKey: 'fair-housing-any',
    version: '0.1.0',
    jurisdictionScope: 'federal-fallback',
    primaryAuthority: {
      name: 'U.S. Department of Housing and Urban Development, Fair Housing Enforcement Center',
      webForm: 'https://www.hud.gov/program_offices/fair_housing_equal_opp/online-complaint',
      notes:
        'Federal complaint pathway for Fair Housing Act and Section 504 Rehabilitation Act violations, including public housing conditions.',
    },
    legalStatute: {
      citation: 'Fair Housing Act (42 U.S.C. § 3601 et seq.) + Section 504',
      url: 'https://www.hud.gov/program_offices/fair_housing_equal_opp',
    },
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [
      {
        label: 'HUD Fair Housing complaint portal',
        url: 'https://www.hud.gov/program_offices/fair_housing_equal_opp/online-complaint',
        accessedAt: '2026-08-30',
      },
    ],
  },
  {
    categoryKey: 'title-vi-language-access-any',
    version: '0.1.0',
    jurisdictionScope: 'federal-fallback',
    primaryAuthority: {
      name: 'U.S. Department of Justice, Civil Rights Division — Federal Coordination and Compliance Section',
      webForm: 'https://civilrights.justice.gov/report/',
      notes:
        'Federal complaint pathway for Title VI (national origin discrimination via English-only or inadequate language access) violations by federally-funded entities.',
    },
    legalStatute: {
      citation: 'Title VI Civil Rights Act of 1964 + EO 13166',
      url: 'https://www.justice.gov/crt/fcs/TitleVI',
    },
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [
      {
        label: 'DOJ Title VI legal manual',
        url: 'https://www.justice.gov/crt/fcs/TitleVI',
        accessedAt: '2026-08-30',
      },
    ],
  },
  {
    categoryKey: 'fta-transit-ada-any',
    version: '0.1.0',
    jurisdictionScope: 'federal-fallback',
    primaryAuthority: {
      name: 'Federal Transit Administration, Office of Civil Rights',
      webForm: 'https://www.transit.dot.gov/regulations-and-guidance/civil-rights-ada/file-complaint-fta',
      notes:
        'Federal complaint pathway for transit authority accessibility failures (49 CFR Part 37 / 38).',
    },
    legalStatute: {
      citation: '49 CFR Part 37 (DOT ADA transit rules)',
      url: 'https://www.ecfr.gov/current/title-49/subtitle-A/part-37',
    },
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [
      {
        label: 'FTA ADA complaint filing guidance',
        url: 'https://www.transit.dot.gov/regulations-and-guidance/civil-rights-ada/file-complaint-fta',
        accessedAt: '2026-08-30',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // MASSACHUSETTS
  // ─────────────────────────────────────────────────────────────
  {
    categoryKey: 'pothole',
    version: '0.1.0',
    jurisdictionScope: 'MA',
    primaryAuthority: {
      name: 'Municipal Public Works Department',
      notes:
        'For state-numbered routes (Route 2, Route 9, etc.), route to MassDOT instead — this is the leading cause of jurisdiction misassignment in MA.',
    },
    escalationAuthority: {
      name: 'Municipal clerk of record',
      notes:
        'Written notice under M.G.L. c. 84 § 18 must be provided to the municipality within 30 days of the injury/damage.',
    },
    legalStatute: {
      citation: 'M.G.L. c. 84 § 15 (defective highway statute)',
      url: 'https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXIV/Chapter84/Section15',
    },
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [
      {
        label: 'M.G.L. c. 84 § 15',
        url: 'https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXIV/Chapter84/Section15',
        accessedAt: '2026-08-30',
      },
      {
        label: 'M.G.L. c. 84 § 18 (notice requirement)',
        url: 'https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXIV/Chapter84/Section18',
        accessedAt: '2026-08-30',
      },
    ],
  },
  {
    categoryKey: 'sidewalk',
    version: '0.1.0',
    jurisdictionScope: 'MA',
    primaryAuthority: { name: 'Municipal Public Works Department' },
    escalationAuthority: {
      name: 'Municipal clerk of record',
      notes: 'Same 30-day notice window as pothole reports under M.G.L. c. 84 § 18.',
    },
    legalStatute: {
      citation: 'M.G.L. c. 84 § 15',
      url: 'https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXIV/Chapter84/Section15',
    },
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [
      {
        label: 'M.G.L. c. 84 § 15',
        url: 'https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXIV/Chapter84/Section15',
        accessedAt: '2026-08-30',
      },
    ],
  },
  {
    categoryKey: 'streetlight',
    version: '0.1.0',
    jurisdictionScope: 'MA',
    primaryAuthority: {
      name: 'Municipal Public Works or Utility Provider',
      notes:
        'Municipal responsibility varies by city — some MA cities own streetlights, others lease from Eversource / National Grid. Confirm during pilot-city onboarding.',
    },
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [],
  },
  {
    categoryKey: 'missing_curb_cut',
    version: '0.1.0',
    jurisdictionScope: 'MA',
    primaryAuthority: {
      name: 'Municipal ADA Coordinator',
      notes:
        'Every public entity with 50+ employees is required by 28 CFR § 35.107 to designate an ADA coordinator. Coordinator identity confirmed during pilot-city onboarding.',
    },
    escalationAuthority: {
      name: 'Massachusetts Office on Disability',
      email: 'MOD@mass.gov',
      webForm: 'https://www.mass.gov/orgs/massachusetts-office-on-disability',
      notes: 'State-level ADA compliance office.',
    },
    federalFallback: {
      name: 'U.S. Department of Justice, Civil Rights Division',
      webForm: 'https://civilrights.justice.gov/report/',
    },
    legalStatute: {
      citation: '28 CFR Part 35 (ADA Title II) + PROWAG',
      url: 'https://www.ada.gov/law-and-regs/regulations/title-ii-2010-regulations/',
    },
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [
      {
        label: 'Massachusetts Office on Disability',
        url: 'https://www.mass.gov/orgs/massachusetts-office-on-disability',
        accessedAt: '2026-08-30',
      },
    ],
  },
  {
    categoryKey: 'broken_elevator_public_housing',
    version: '0.1.0',
    jurisdictionScope: 'MA',
    primaryAuthority: {
      name: 'Local Public Housing Authority',
      notes: 'PHA of the housing development where the elevator is located.',
    },
    escalationAuthority: {
      name: 'HUD Boston Regional Office',
      address: '10 Causeway St., Room 301, Boston MA 02222',
      notes: 'HUD Region 1 covers all of MA / RI / NH / ME / VT / CT.',
    },
    legalStatute: {
      citation: 'Fair Housing Act + Section 504 Rehabilitation Act',
      url: 'https://www.hud.gov/program_offices/fair_housing_equal_opp',
    },
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [
      {
        label: 'HUD Region 1 (Boston) office',
        url: 'https://www.hud.gov/states/massachusetts',
        accessedAt: '2026-08-30',
      },
    ],
  },
  {
    categoryKey: 'broken_city_website_form',
    version: '0.1.0',
    jurisdictionScope: 'MA',
    primaryAuthority: {
      name: 'Municipal IT department + department owning the form',
    },
    escalationAuthority: {
      name: 'Municipal ADA Coordinator',
      notes:
        '2024 DOJ web-accessibility rule (28 CFR Part 35) makes broken forms a Title II violation when they exclude assistive-tech users.',
    },
    federalFallback: {
      name: 'U.S. Department of Justice, Civil Rights Division',
      webForm: 'https://civilrights.justice.gov/report/',
    },
    legalStatute: {
      citation: '28 CFR Part 35 (2024 web-accessibility rule) + WCAG 2.1 AA',
      url: 'https://www.federalregister.gov/documents/2024/04/24/2024-07758/nondiscrimination-on-the-basis-of-disability-accessibility-of-web-information-and-services-of-state',
    },
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [
      {
        label: 'DOJ 2024 web-accessibility final rule',
        url: 'https://www.federalregister.gov/documents/2024/04/24/2024-07758/nondiscrimination-on-the-basis-of-disability-accessibility-of-web-information-and-services-of-state',
        accessedAt: '2026-08-30',
      },
      {
        label: 'WCAG 2.1 AA',
        url: 'https://www.w3.org/TR/WCAG21/',
        accessedAt: '2026-08-30',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // RHODE ISLAND
  // ─────────────────────────────────────────────────────────────
  {
    categoryKey: 'pothole',
    version: '0.1.0',
    jurisdictionScope: 'RI',
    primaryAuthority: {
      name: 'Municipal Public Works Department',
      notes:
        'For state-maintained highways (I-95, Route 95, etc.), route to RIDOT instead. Municipal-vs-state distinction matters and is the leading cause of misrouted RI reports.',
    },
    escalationAuthority: {
      name: 'Town or City Clerk',
      notes:
        'Written notice under R.I. Gen. Laws § 24-5-14 must be delivered to the clerk of record within 60 days — NOT to the DPW. RI courts have been strict about this.',
    },
    legalStatute: {
      citation: 'R.I. Gen. Laws § 24-5-14',
      url: 'http://webserver.rilegislature.gov/Statutes/TITLE24/24-5/24-5-14.HTM',
    },
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [
      {
        label: 'R.I. Gen. Laws § 24-5-14',
        url: 'http://webserver.rilegislature.gov/Statutes/TITLE24/24-5/24-5-14.HTM',
        accessedAt: '2026-08-30',
      },
    ],
  },
  {
    categoryKey: 'sidewalk',
    version: '0.1.0',
    jurisdictionScope: 'RI',
    primaryAuthority: { name: 'Municipal Public Works Department' },
    escalationAuthority: {
      name: 'Town or City Clerk',
      notes: 'Same clerk-of-record delivery requirement as pothole reports.',
    },
    legalStatute: {
      citation: 'R.I. Gen. Laws § 24-5-14',
      url: 'http://webserver.rilegislature.gov/Statutes/TITLE24/24-5/24-5-14.HTM',
    },
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [],
  },
  {
    categoryKey: 'missing_curb_cut',
    version: '0.1.0',
    jurisdictionScope: 'RI',
    primaryAuthority: {
      name: 'Municipal ADA Coordinator',
      notes: 'Coordinator identity confirmed during pilot-city onboarding.',
    },
    escalationAuthority: {
      name: 'Rhode Island Governor\'s Commission on Disabilities',
      webForm: 'https://gcd.ri.gov/',
      notes: 'State-level ADA compliance office.',
    },
    federalFallback: {
      name: 'U.S. Department of Justice, Civil Rights Division',
      webForm: 'https://civilrights.justice.gov/report/',
    },
    legalStatute: {
      citation: '28 CFR Part 35 + PROWAG',
      url: 'https://www.ada.gov/law-and-regs/regulations/title-ii-2010-regulations/',
    },
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [
      {
        label: 'RI Governor\'s Commission on Disabilities',
        url: 'https://gcd.ri.gov/',
        accessedAt: '2026-08-30',
      },
    ],
  },
  {
    categoryKey: 'broken_elevator_public_housing',
    version: '0.1.0',
    jurisdictionScope: 'RI',
    primaryAuthority: {
      name: 'Local Public Housing Authority',
    },
    escalationAuthority: {
      name: 'HUD Boston Regional Office (covers RI)',
      address: '10 Causeway St., Room 301, Boston MA 02222',
    },
    legalStatute: {
      citation: 'Fair Housing Act + Section 504',
      url: 'https://www.hud.gov/program_offices/fair_housing_equal_opp',
    },
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [],
  },

  // ─────────────────────────────────────────────────────────────
  // NEW HAMPSHIRE
  // ─────────────────────────────────────────────────────────────
  {
    categoryKey: 'pothole',
    version: '0.1.0',
    jurisdictionScope: 'NH',
    primaryAuthority: {
      name: 'Municipal Public Works Department',
      notes:
        'For state-numbered routes, route to NHDOT instead. NH also excludes weather-caused conditions (ice, snow) unless unreasonable time has passed — RSA 231:92-a.',
    },
    escalationAuthority: {
      name: 'Municipal clerk or municipal counsel',
      notes:
        'Written notice under RSA 231:90 must be provided within 60 days. Cap of $50,000 per occurrence — verify current cap against RSA at each review.',
    },
    legalStatute: {
      citation: 'RSA 231:90-92',
      url: 'https://www.gencourt.state.nh.us/rsa/html/xx/231/231-90.htm',
    },
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [
      {
        label: 'RSA 231:90 (duty)',
        url: 'https://www.gencourt.state.nh.us/rsa/html/xx/231/231-90.htm',
        accessedAt: '2026-08-30',
      },
      {
        label: 'RSA 231:91 (notice requirements)',
        url: 'https://www.gencourt.state.nh.us/rsa/html/xx/231/231-91.htm',
        accessedAt: '2026-08-30',
      },
      {
        label: 'RSA 231:92 (damage cap + weather exclusion)',
        url: 'https://www.gencourt.state.nh.us/rsa/html/xx/231/231-92.htm',
        accessedAt: '2026-08-30',
      },
    ],
  },
  {
    categoryKey: 'sidewalk',
    version: '0.1.0',
    jurisdictionScope: 'NH',
    primaryAuthority: { name: 'Municipal Public Works Department' },
    escalationAuthority: {
      name: 'Municipal clerk or municipal counsel',
      notes: 'Same 60-day window + $50k cap as pothole reports.',
    },
    legalStatute: {
      citation: 'RSA 231:90-92',
      url: 'https://www.gencourt.state.nh.us/rsa/html/xx/231/231-90.htm',
    },
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [],
  },
  {
    categoryKey: 'missing_curb_cut',
    version: '0.1.0',
    jurisdictionScope: 'NH',
    primaryAuthority: {
      name: 'Municipal ADA Coordinator',
      notes: 'Coordinator identity confirmed during pilot-city onboarding.',
    },
    escalationAuthority: {
      name: 'New Hampshire Governor\'s Commission on Disability',
      webForm: 'https://www.nh.gov/disability/',
      notes: 'State-level ADA compliance office.',
    },
    federalFallback: {
      name: 'U.S. Department of Justice, Civil Rights Division',
      webForm: 'https://civilrights.justice.gov/report/',
    },
    legalStatute: {
      citation: '28 CFR Part 35 + PROWAG',
      url: 'https://www.ada.gov/law-and-regs/regulations/title-ii-2010-regulations/',
    },
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [
      {
        label: 'NH Governor\'s Commission on Disability',
        url: 'https://www.nh.gov/disability/',
        accessedAt: '2026-08-30',
      },
    ],
  },
  {
    categoryKey: 'broken_elevator_public_housing',
    version: '0.1.0',
    jurisdictionScope: 'NH',
    primaryAuthority: { name: 'Local Public Housing Authority' },
    escalationAuthority: {
      name: 'HUD Boston Regional Office (covers NH)',
      address: '10 Causeway St., Room 301, Boston MA 02222',
    },
    legalStatute: {
      citation: 'Fair Housing Act + Section 504',
      url: 'https://www.hud.gov/program_offices/fair_housing_equal_opp',
    },
    verificationStatus: 'pending-review',
    verifiedBy: null,
    verifiedAt: null,
    nextReviewAt: null,
    sources: [],
  },
];

// ── Public accessors ───────────────────────────────────────────────────────

export function getRouting(
  categoryKey: string,
  jurisdictionScope: string,
): CategoryRouting | null {
  const normalizedJurisdiction = jurisdictionScope?.toUpperCase();
  const specific = RECORDS.find(
    (r) => r.categoryKey === categoryKey && r.jurisdictionScope === normalizedJurisdiction,
  );
  if (specific && specific.verificationStatus !== 'draft') {
    return effectiveRecord(specific);
  }
  // Fall through to federal fallback if there's a matching one
  const federal = RECORDS.find(
    (r) => r.categoryKey === categoryKey && r.jurisdictionScope === 'federal-fallback',
  );
  if (federal && federal.verificationStatus !== 'draft') {
    return effectiveRecord(federal);
  }
  return null;
}

export function getRoutingsByJurisdiction(jurisdictionScope: string): CategoryRouting[] {
  const normalized = jurisdictionScope?.toUpperCase();
  return RECORDS.filter(
    (r) => r.jurisdictionScope === normalized && r.verificationStatus !== 'draft',
  ).map(effectiveRecord);
}

export function getSupportedJurisdictions(): string[] {
  return Array.from(
    new Set(
      RECORDS.filter((r) => r.verificationStatus !== 'draft').map(
        (r) => r.jurisdictionScope,
      ),
    ),
  );
}

function effectiveRecord(record: CategoryRouting): CategoryRouting {
  const status = effectiveVerificationStatus(record);
  if (status === record.verificationStatus) return record;
  return { ...record, verificationStatus: status };
}

function effectiveVerificationStatus(
  record: CategoryRouting,
): CategoryRouting['verificationStatus'] {
  if (record.verificationStatus !== 'verified') return record.verificationStatus;
  if (!record.nextReviewAt) return 'stale';
  const dueDate = Date.parse(record.nextReviewAt);
  if (Number.isNaN(dueDate)) return 'stale';
  return Date.now() > dueDate ? 'stale' : 'verified';
}

export function routingDisclaimer(record: CategoryRouting): string {
  const status = effectiveVerificationStatus(record);
  const versionLine = `Routing reference: ${record.categoryKey} / ${record.jurisdictionScope} · dataset v${record.version}`;
  switch (status) {
    case 'verified':
      return `${versionLine} · reviewed: ${record.verifiedBy || 'unnamed reviewer'}, ${record.verifiedAt || 'date unknown'}. Not legal advice.`;
    case 'stale':
      return `${versionLine} · review OVERDUE (last reviewed ${record.verifiedAt || 'never'}). Verify against current authority contact before relying on this routing. Not legal advice.`;
    case 'pending-review':
      return `${versionLine} · NOT YET LEGALLY REVIEWED. Routing target is our best current reading. Verify against current authority contact list before sending. Not legal advice.`;
    case 'draft':
      return `${versionLine} · draft entry, not for user delivery.`;
  }
}
