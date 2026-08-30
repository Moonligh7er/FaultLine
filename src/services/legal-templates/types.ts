// Versioned legal-framing templates for the letter generator.
// Each framing represents a distinct statute + notice pathway + federal-fallback
// combination. Categories map to framings via getFraming().

export type LegalFraming =
  | 'defective-highway'     // Physical infrastructure defects — existing M.G.L. c. 84 / R.I. § 24-5-14 / RSA 231:90 path
  | 'ada-title-ii'          // ADA Title II — public entities (state / local government access)
  | 'fair-housing-504'      // Fair Housing Act + Section 504 — public housing
  | 'title-vi-language'     // Title VI + EO 13166 — language access at federally-funded services
  | 'transit-ada';          // 49 CFR Part 37 — transit authority accessibility

export interface LegalTemplate {
  framing: LegalFraming;
  version: string;
  headline: string;                    // e.g., "FORMAL ADA TITLE II NOTICE OF PROGRAM-ACCESS BARRIER"
  statuteCitation: string;             // e.g., "28 CFR Part 35"
  statuteUrl: string;                  // Primary-source .gov link
  statuteTitle: string;                // Human-readable title
  legalBasisText: string;              // 2-3 sentence explanation of the duty and liability trigger
  noticePeriodDays: number;            // Days until authority is expected to acknowledge
  filingRequirements: string;          // Where notice must be delivered
  federalComplaintPathway: string;     // Backstop federal complaint URL/agency name
  demandLanguage: {
    inspectVerb: string;               // "inspect the reported location" vs "evaluate the reported access barrier"
    remedyClause: string;              // "Remedy the hazardous condition" vs "Provide access to the program or service"
  };
  // Same verification chain of custody pattern as the statute + routing datasets.
  verificationStatus: 'verified' | 'pending-review' | 'stale' | 'draft';
  verifiedBy: string | null;
  verifiedAt: string | null;
  nextReviewAt: string | null;
}
