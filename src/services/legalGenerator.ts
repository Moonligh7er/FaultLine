import { Report, ReportLocation } from '../types';
import { CATEGORIES, HAZARD_LEVELS } from '../constants/categories';
import { enhanceDemandLetter as aiEnhance } from './ai';

// ============================================================
// Legal Demand Letter Generator
// Auto-generates formal notice-of-defect letters citing
// state-specific statutes. Creates legal exposure for
// authorities that ignore reported hazards.
// ============================================================

// State-specific statutes for notice of defect / municipal liability
const STATE_STATUTES: Record<string, {
  statute: string;
  title: string;
  noticePeriodDays: number;
  description: string;
  filingRequirements: string;
}> = {
  MA: {
    statute: 'M.G.L. c. 84, § 15',
    title: 'Massachusetts Defective Highway Statute',
    noticePeriodDays: 30,
    description: 'Municipalities are liable for damages caused by defects in public ways if they had actual or constructive notice of the defect and failed to remedy it within a reasonable time.',
    filingRequirements: 'Written notice must be provided to the municipality within 30 days of the injury/damage. Claims must be filed within 3 years.',
  },
  RI: {
    statute: 'R.I. Gen. Laws § 24-5-14',
    title: 'Rhode Island Highway Defect Liability',
    noticePeriodDays: 60,
    description: 'Towns and cities are liable for damages from defective highways, bridges, and sidewalks when they had notice of the condition.',
    filingRequirements: 'Written notice to the town/city clerk within 60 days of the incident.',
  },
  NH: {
    statute: 'RSA 231:90-92',
    title: 'New Hampshire Highway Liability',
    noticePeriodDays: 60,
    description: 'Municipalities may be liable for damages caused by insufficiency of a highway or bridge if they had actual notice or the defect was so obvious it constituted constructive notice.',
    filingRequirements: 'Written notice within 60 days. Claim limit of $50,000 per occurrence.',
  },
};

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
}

export function generateDemandLetter(
  report: Report,
  authorityName: string,
  clusterReportCount: number = 1,
  claimantName?: string,
  damageDescription?: string,
): DemandLetterData {
  const state = report.location.state || 'MA';
  const stateLaw = STATE_STATUTES[state] || STATE_STATUTES['MA'];
  const category = CATEGORIES.find((c) => c.key === report.category);
  const hazard = HAZARD_LEVELS.find((h) => h.key === report.severity.hazardLevel);

  const reportDate = new Date(report.createdAt);
  const now = new Date();
  const daysSinceReport = Math.floor((now.getTime() - reportDate.getTime()) / 86400000);
  const isOverdue = daysSinceReport > stateLaw.noticePeriodDays;

  const location = report.location;
  const locationStr = [location.address, location.city, location.state].filter(Boolean).join(', ');
  const dateStr = reportDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const todayStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const letterText = `
${todayStr}

${authorityName}
${location.city || ''}${location.state ? `, ${location.state}` : ''}

RE: FORMAL NOTICE OF DEFECTIVE CONDITION — ${(category?.label || report.category).toUpperCase()}
Location: ${locationStr}
GPS: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
Original Report Date: ${dateStr}
Days Since Notice: ${daysSinceReport}

Dear ${authorityName},

${claimantName ? `I, ${claimantName}, am` : 'This letter serves as'} formal notice pursuant to ${stateLaw.statute} ("${stateLaw.title}") regarding a hazardous condition on a public way within your jurisdiction.

NATURE OF DEFECT
${'━'.repeat(50)}
Type: ${category?.label || report.category}
Location: ${locationStr}
Hazard Level: ${hazard?.label || report.severity.hazardLevel} (as assessed by ${clusterReportCount} independent community reporters)
${report.description ? `Description: ${report.description}` : ''}

NOTICE HISTORY
${'━'.repeat(50)}
This condition was first reported to your office on ${dateStr} — ${daysSinceReport} days ago. Since that date, ${clusterReportCount} independent community member${clusterReportCount > 1 ? 's have' : ' has'} reported the same hazard through the Fault Line community infrastructure reporting platform.

${isOverdue ? `NOTICE: The statutory response period of ${stateLaw.noticePeriodDays} days under ${stateLaw.statute} has EXPIRED. Your office has had ${daysSinceReport} days of notice — ${daysSinceReport - stateLaw.noticePeriodDays} days beyond the statutory period.` : `Under ${stateLaw.statute}, your office has ${stateLaw.noticePeriodDays} days from the date of notice to remedy the condition. ${stateLaw.noticePeriodDays - daysSinceReport} days remain.`}

LEGAL BASIS
${'━'.repeat(50)}
${stateLaw.description}

Filing requirements: ${stateLaw.filingRequirements}

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

${claimantName ? `Sincerely,\n${claimantName}` : 'Sincerely,\nFault Line Community Platform\nOn behalf of the reporting community'}

---
Report ID: ${report.id}
${report.clusterId ? `Cluster ID: ${report.clusterId}` : ''}
Generated by Fault Line — Community Infrastructure Accountability Platform
`.trim();

  return {
    letterText,
    statute: stateLaw.statute,
    statuteTitle: stateLaw.title,
    noticePeriodDays: stateLaw.noticePeriodDays,
    reportDate: dateStr,
    daysSinceReport,
    isOverdue,
    recipientAuthority: authorityName,
    location,
    category: category?.label || report.category,
    reportCount: clusterReportCount,
    hazardLevel: hazard?.label || report.severity.hazardLevel,
  };
}

export function getStateStatute(state: string) {
  return STATE_STATUTES[state] || null;
}

export function getSupportedStates(): string[] {
  return Object.keys(STATE_STATUTES);
}

// AI-enhanced version — falls back to base letter if AI unavailable
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
      report.location.state || 'MA',
      base.daysSinceReport,
      base.reportCount,
      base.hazardLevel,
    );
    if (enhanced && enhanced !== base.letterText) {
      return { ...base, letterText: enhanced };
    }
  } catch {
    // AI unavailable — base letter is already complete and functional
  }

  return base;
}
