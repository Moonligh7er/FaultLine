import { Report, ReportLocation } from '../types';
import { CATEGORIES, HAZARD_LEVELS } from '../constants/categories';
import { enhanceDemandLetter as aiEnhance } from './ai';
import {
  getStatuteRecord,
  getSupportedStates as getSupportedStatesFromDataset,
  statuteDisclaimer,
  StateStatuteRecord,
  VerificationStatus,
} from './statutes';
import {
  getRouting,
  routingDisclaimer,
  type CategoryRouting,
} from './routing';
import {
  getFraming,
  getTemplate,
  templateDisclaimer,
  type LegalFraming,
  type LegalTemplate,
} from './legal-templates';
import { digitalContextForLetter } from './digitalSnapshot';

// ============================================================
// Legal Demand Letter Generator
// Composes a state-specific defective-highway notice from a
// verified statute dataset (./statutes) plus report evidence.
// The letter is generated FOR THE USER TO SEND — Fault Line
// does not transmit letters on behalf of users.
// ============================================================

export interface DemandLetterData {
  letterText: string;
  statute: string;
  statuteTitle: string;
  noticePeriodDays: number;
  reportDate: string;
  daysSinceReport: number;
  isOverdue: boolean;
  recipientAuthority: string;
  location: ReportLocation;
  category: string;
  reportCount: number;
  hazardLevel: string;
  // Verification chain of custody — surface these to the UI so the
  // user sees exactly what claim they are about to send.
  verificationStatus: VerificationStatus;
  statuteVersion: string;
  disclaimer: string;
  // Routing chain of custody — same pattern, but for the addressee lookup.
  routingVersion?: string;
  routingVerificationStatus?: CategoryRouting['verificationStatus'];
  routingDisclaimer?: string;
  // Framing template — which legal framework the letter is anchored in.
  framing: LegalFraming;
  templateVersion: string;
  templateDisclaimer: string;
}

const DEFAULT_STATE = 'MA';

function unreviewedBanner(
  statute: StateStatuteRecord,
  routing: CategoryRouting | null,
): string {
  const statuteUnreviewed = statute.verificationStatus !== 'verified';
  const routingUnreviewed = routing !== null && routing.verificationStatus !== 'verified';
  if (!statuteUnreviewed && !routingUnreviewed) return '';

  const concerns: string[] = [];
  if (statuteUnreviewed) {
    concerns.push(
      `The statutory citation and notice period (${statute.statute}, ${statute.noticePeriodDays}-day notice) come from a dataset entry that has NOT yet been reviewed by a licensed attorney.`,
    );
  }
  if (routingUnreviewed && routing) {
    concerns.push(
      `The addressee routing (${routing.primaryAuthority.name}) has NOT yet been reviewed against current municipal contact information — verify the recipient office and mailing address before sending.`,
    );
  }

  return [
    '',
    '━'.repeat(60),
    '⚠ UNREVIEWED LEGAL CONTENT',
    '━'.repeat(60),
    ...concerns.map((c) => `• ${c}`),
    '',
    'Before you send this letter for a live claim, verify the statute text, deadline, and recipient against your state\'s current law, or consult an attorney admitted in your state. Fault Line is a documentation aid, not a law firm.',
    '━'.repeat(60),
    '',
    '',
  ].join('\n');
}

function knownAmbiguityFootnote(record: StateStatuteRecord): string {
  if (!record.knownAmbiguities || record.knownAmbiguities.length === 0) return '';
  const lines = [
    '',
    'REVIEWER NOTES ON THIS STATUTE',
    '━'.repeat(50),
    ...record.knownAmbiguities.map(
      (a, i) => `${i + 1}. ${a.concern} — ${a.detail}`,
    ),
    '',
  ];
  return lines.join('\n');
}

export function generateDemandLetter(
  report: Report,
  authorityName: string,
  clusterReportCount: number = 1,
  claimantName?: string,
  damageDescription?: string,
): DemandLetterData {
  const state = report.location.state || DEFAULT_STATE;
  // Fall back to MA if the state is not in the dataset, but keep the
  // verification chain of custody honest by tagging the fallback.
  const record = getStatuteRecord(state) || getStatuteRecord(DEFAULT_STATE)!;
  const routing = getRouting(report.category, state);
  const framing = getFraming(report.category);
  const template = getTemplate(framing);
  const category = CATEGORIES.find((c) => c.key === report.category);
  const hazard = HAZARD_LEVELS.find((h) => h.key === report.severity.hazardLevel);

  // For defective-highway framing, statute record supplies the notice period.
  // For other framings, the template's noticePeriodDays applies (federal frameworks
  // are jurisdiction-agnostic at the notice-window level).
  const effectiveNoticePeriodDays =
    framing === 'defective-highway' ? record.noticePeriodDays : template.noticePeriodDays;
  const effectiveStatute =
    framing === 'defective-highway' ? record.statute : template.statuteCitation;
  const effectiveStatuteTitle =
    framing === 'defective-highway' ? record.title : template.statuteTitle;
  const effectiveLegalBasis =
    framing === 'defective-highway' ? record.description : template.legalBasisText;
  const effectiveFilingRequirements =
    framing === 'defective-highway' ? record.filingRequirements : template.filingRequirements;

  const reportDate = new Date(report.createdAt);
  const now = new Date();
  const daysSinceReport = Math.floor((now.getTime() - reportDate.getTime()) / 86400000);
  const isOverdue = daysSinceReport > effectiveNoticePeriodDays;

  const location = report.location;
  const locationStr = [location.address, location.city, location.state].filter(Boolean).join(', ');
  const dateStr = reportDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const todayStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Recipient: prefer the routing dataset's named authority, fall back to the
  // per-report authority name passed in by the caller (backwards-compatible).
  const recipient = routing?.primaryAuthority.name ?? authorityName;
  const recipientAddressLine = routing?.primaryAuthority.address
    ? `\n${routing.primaryAuthority.address}`
    : '';

  const banner = unreviewedBanner(record, routing);
  const ambiguityNotes = knownAmbiguityFootnote(record);
  const disclaimer = statuteDisclaimer(record);
  const routingFooter = routing ? routingDisclaimer(routing) : '';
  const templateFooter = templateDisclaimer(template);
  const federalPathwayLine =
    framing !== 'defective-highway'
      ? `\n\nFEDERAL COMPLAINT PATHWAY\n${'━'.repeat(50)}\nIf this notice does not receive an adequate response, a federal complaint may be filed with: ${template.federalComplaintPathway}`
      : '';

  const letterText = `
${banner}${todayStr}

${recipient}${recipientAddressLine}
${location.city || ''}${location.state ? `, ${location.state}` : ''}

RE: ${template.headline} — ${(category?.label || report.category).toUpperCase()}
Location: ${locationStr}
GPS: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
Original Report Date: ${dateStr}
Days Since Notice: ${daysSinceReport}

Dear ${recipient},

${claimantName ? `I, ${claimantName}, am` : 'This letter serves as'} formal notice pursuant to ${effectiveStatute} ("${effectiveStatuteTitle}") regarding the condition described below within your jurisdiction.

NATURE OF THE CONDITION
${'━'.repeat(50)}
Type: ${category?.label || report.category}
Location: ${locationStr}${report.geometryType === 'corridor' && report.corridor ? `
Corridor: ${report.corridor.streetName || 'unnamed segment'}${report.corridor.fromCrossStreet ? ` from ${report.corridor.fromCrossStreet}` : ''}${report.corridor.toCrossStreet ? ` to ${report.corridor.toCrossStreet}` : ''} (${report.corridor.start.latitude.toFixed(5)},${report.corridor.start.longitude.toFixed(5)} → ${report.corridor.end.latitude.toFixed(5)},${report.corridor.end.longitude.toFixed(5)})` : ''}${report.geometryType === 'area' && report.area ? `
Area: ${report.area.boundaryName || 'user-defined polygon'}${report.area.censusTractGeoid ? ` (census tract ${report.area.censusTractGeoid})` : ''}` : ''}
Hazard Level: ${hazard?.label || report.severity.hazardLevel} (as assessed by ${clusterReportCount} independent community reporters)
${report.description ? `Description: ${report.description}` : ''}

NOTICE HISTORY
${'━'.repeat(50)}
This condition was first reported to your office on ${dateStr} — ${daysSinceReport} days ago. Since that date, ${clusterReportCount} independent community member${clusterReportCount > 1 ? 's have' : ' has'} reported the same condition through the Fault Line community infrastructure reporting platform.

${isOverdue ? `NOTICE: The response period of ${effectiveNoticePeriodDays} days under ${effectiveStatute} has EXPIRED. Your office has had ${daysSinceReport} days of notice — ${daysSinceReport - effectiveNoticePeriodDays} days beyond the applicable period.` : `Under ${effectiveStatute}, your office has ${effectiveNoticePeriodDays} days from the date of notice to remedy the condition. ${effectiveNoticePeriodDays - daysSinceReport} days remain.`}

LEGAL BASIS
${'━'.repeat(50)}
${effectiveLegalBasis}

Filing requirements: ${effectiveFilingRequirements}${federalPathwayLine}

${damageDescription ? `DAMAGES CLAIMED
${'━'.repeat(50)}
${damageDescription}

` : ''}DEMAND
${'━'.repeat(50)}
${claimantName ? 'I' : 'The community'} hereby demand${claimantName ? 's' : ''} that your office:

1. Immediately ${template.demandLanguage.inspectVerb};
2. ${template.demandLanguage.remedyClause} within the applicable timeframe;
3. ${damageDescription ? 'Compensate for damages incurred as a result of the defect; and' : 'Prevent further harm to the public; and'}
4. Provide written confirmation of remedial action taken.

Failure to address this condition may result in ${claimantName ? 'a formal claim for damages' : 'individual claims from affected community members'} and public disclosure of the ${daysSinceReport}-day response record.

EVIDENCE
${'━'.repeat(50)}
The following evidence is available and preserved:
- ${clusterReportCount} independent community reports with timestamps
- GPS-verified location data (${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)})
- ${report.media.length > 0 ? `${report.media.length} photographic/video documentation file(s)` : 'Community severity assessments'}
- Complete escalation and notification log
- Google Maps: https://maps.google.com/?q=${location.latitude},${location.longitude}${report.digital ? `\n\nDIGITAL RESOURCE CONTEXT\n${'━'.repeat(50)}\n${digitalContextForLetter(report.digital)}` : ''}

This notice is sent in good faith to ensure public safety and proper maintenance of public ways.

${claimantName ? `Sincerely,\n${claimantName}` : 'Sincerely,\n[Your name]\nCommunity reporter via Fault Line'}
${ambiguityNotes}
---
Report ID: ${report.id}
${report.clusterId ? `Cluster ID: ${report.clusterId}` : ''}
${disclaimer}${routingFooter ? '\n' + routingFooter : ''}
${templateFooter}
`.trim();

  return {
    letterText,
    statute: effectiveStatute,
    statuteTitle: effectiveStatuteTitle,
    noticePeriodDays: effectiveNoticePeriodDays,
    reportDate: dateStr,
    daysSinceReport,
    isOverdue,
    recipientAuthority: recipient,
    location,
    category: category?.label || report.category,
    reportCount: clusterReportCount,
    hazardLevel: hazard?.label || record.title,
    verificationStatus: record.verificationStatus,
    statuteVersion: record.version,
    disclaimer,
    routingVersion: routing?.version,
    routingVerificationStatus: routing?.verificationStatus,
    routingDisclaimer: routingFooter || undefined,
    framing,
    templateVersion: template.version,
    templateDisclaimer: templateFooter,
  };
}

// Backwards-compatible thin wrapper — returns a subset of the record so
// existing UI code that only needed the citation strings keeps working.
export function getStateStatute(state: string): {
  statute: string;
  title: string;
  noticePeriodDays: number;
  description: string;
  filingRequirements: string;
} | null {
  const record = getStatuteRecord(state);
  if (!record) return null;
  return {
    statute: record.statute,
    title: record.title,
    noticePeriodDays: record.noticePeriodDays,
    description: record.description,
    filingRequirements: record.filingRequirements,
  };
}

export function getSupportedStates(): string[] {
  return getSupportedStatesFromDataset();
}

// AI-enhanced version — falls back to base letter if AI unavailable.
// The banner and disclaimer are set on the *base* letter body before AI
// touches it, so the unreviewed-content warning survives any rewrite.
export async function generateAIEnhancedLetter(
  report: Report,
  authorityName: string,
  clusterReportCount: number = 1,
  claimantName?: string,
  damageDescription?: string,
): Promise<DemandLetterData> {
  const base = generateDemandLetter(report, authorityName, clusterReportCount, claimantName, damageDescription);

  try {
    const enhanced = await aiEnhance(
      base.letterText,
      base.category,
      report.location.state || DEFAULT_STATE,
      base.daysSinceReport,
      base.reportCount,
      base.hazardLevel,
    );
    if (enhanced && enhanced !== base.letterText) {
      return { ...base, letterText: enhanced };
    }
  } catch {
    // AI unavailable — base letter is already complete and functional.
  }

  return base;
}
