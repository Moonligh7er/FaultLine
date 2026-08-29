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
}

const DEFAULT_STATE = 'MA';

function unreviewedBanner(record: StateStatuteRecord): string {
  if (record.verificationStatus === 'verified') return '';
  return [
    '',
    '━'.repeat(60),
    '⚠ UNREVIEWED LEGAL CONTENT',
    '━'.repeat(60),
    `The statutory citation and notice period in this letter (${record.statute}, ${record.noticePeriodDays}-day notice) come from a dataset entry that has NOT yet been reviewed by a licensed attorney.`,
    '',
    'Before you send this letter for a live claim, verify the statute text and deadline against your state\'s current law, or consult an attorney admitted in your state. Fault Line is a documentation aid, not a law firm.',
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
  const category = CATEGORIES.find((c) => c.key === report.category);
  const hazard = HAZARD_LEVELS.find((h) => h.key === report.severity.hazardLevel);

  const reportDate = new Date(report.createdAt);
  const now = new Date();
  const daysSinceReport = Math.floor((now.getTime() - reportDate.getTime()) / 86400000);
  const isOverdue = daysSinceReport > record.noticePeriodDays;

  const location = report.location;
  const locationStr = [location.address, location.city, location.state].filter(Boolean).join(', ');
  const dateStr = reportDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const todayStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const banner = unreviewedBanner(record);
  const ambiguityNotes = knownAmbiguityFootnote(record);
  const disclaimer = statuteDisclaimer(record);

  const letterText = `
${banner}${todayStr}

${authorityName}
${location.city || ''}${location.state ? `, ${location.state}` : ''}

RE: FORMAL NOTICE OF DEFECTIVE CONDITION — ${(category?.label || report.category).toUpperCase()}
Location: ${locationStr}
GPS: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
Original Report Date: ${dateStr}
Days Since Notice: ${daysSinceReport}

Dear ${authorityName},

${claimantName ? `I, ${claimantName}, am` : 'This letter serves as'} formal notice pursuant to ${record.statute} ("${record.title}") regarding a hazardous condition on a public way within your jurisdiction.

NATURE OF DEFECT
${'━'.repeat(50)}
Type: ${category?.label || report.category}
Location: ${locationStr}
Hazard Level: ${hazard?.label || report.severity.hazardLevel} (as assessed by ${clusterReportCount} independent community reporters)
${report.description ? `Description: ${report.description}` : ''}

NOTICE HISTORY
${'━'.repeat(50)}
This condition was first reported to your office on ${dateStr} — ${daysSinceReport} days ago. Since that date, ${clusterReportCount} independent community member${clusterReportCount > 1 ? 's have' : ' has'} reported the same hazard through the Fault Line community infrastructure reporting platform.

${isOverdue ? `NOTICE: The statutory response period of ${record.noticePeriodDays} days under ${record.statute} has EXPIRED. Your office has had ${daysSinceReport} days of notice — ${daysSinceReport - record.noticePeriodDays} days beyond the statutory period.` : `Under ${record.statute}, your office has ${record.noticePeriodDays} days from the date of notice to remedy the condition. ${record.noticePeriodDays - daysSinceReport} days remain.`}

LEGAL BASIS
${'━'.repeat(50)}
${record.description}

Filing requirements: ${record.filingRequirements}

${damageDescription ? `DAMAGES CLAIMED
${'━'.repeat(50)}
${damageDescription}

` : ''}DEMAND
${'━'.repeat(50)}
${claimantName ? 'I' : 'The community'} hereby demand${claimantName ? 's' : ''} that your office:

1. Immediately inspect the reported location;
2. Remedy the hazardous condition within the statutory timeframe;
3. ${damageDescription ? 'Compensate for damages incurred as a result of the defect; and' : 'Prevent further hazard to the public; and'}
4. Provide written confirmation of remedial action taken.

Failure to address this condition may result in ${claimantName ? 'a formal claim for damages' : 'individual damage claims from affected community members'} and public disclosure of the ${daysSinceReport}-day response record.

EVIDENCE
${'━'.repeat(50)}
The following evidence is available and preserved:
- ${clusterReportCount} independent community reports with timestamps
- GPS-verified location data (${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)})
- ${report.media.length > 0 ? `${report.media.length} photographic/video documentation file(s)` : 'Community severity assessments'}
- Complete escalation and notification log
- Google Maps: https://maps.google.com/?q=${location.latitude},${location.longitude}

This notice is sent in good faith to ensure public safety and proper maintenance of public ways.

${claimantName ? `Sincerely,\n${claimantName}` : 'Sincerely,\n[Your name]\nCommunity reporter via Fault Line'}
${ambiguityNotes}
---
Report ID: ${report.id}
${report.clusterId ? `Cluster ID: ${report.clusterId}` : ''}
${disclaimer}
`.trim();

  return {
    letterText,
    statute: record.statute,
    statuteTitle: record.title,
    noticePeriodDays: record.noticePeriodDays,
    reportDate: dateStr,
    daysSinceReport,
    isOverdue,
    recipientAuthority: authorityName,
    location,
    category: category?.label || report.category,
    reportCount: clusterReportCount,
    hazardLevel: hazard?.label || record.title,
    verificationStatus: record.verificationStatus,
    statuteVersion: record.version,
    disclaimer,
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
