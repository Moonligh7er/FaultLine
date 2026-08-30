import type {
  InsiderCategory,
  InsiderReportContext,
  Report,
  MediaAttachment,
} from '../types';

// ============================================================
// Insider Report Support
//
// Public-employee reporting path. Scope narrowly bounded per
// /whistleblower — infrastructure conditions only, never personnel /
// criminal / classified / retaliation.
//
// This module handles:
//   1. Insider-context field construction
//   2. EXIF metadata stripping on photo uploads
//   3. Out-of-scope category referrals (with jurisdiction-specific
//      links back to the correct channel: EEOC, IG, AG, WB attorney)
//   4. Verification-window computation for insider-only reports
//      (up to 180 days before expiring without escalation)
//
// Tor-compatibility formal verification remains in DEFERRED #29 —
// the web app is already largely Tor-usable, but formal validation
// + fingerprinting hygiene are separate work.
// ============================================================

// ── Insider-context construction ──────────────────────────────────────────

export function buildInsiderContext(input: {
  insiderCategory: InsiderCategory;
  observedDurationDays?: number;
  priorInternalReportRef?: string;
  documentaryReference?: string;
}): InsiderReportContext {
  const ctx: InsiderReportContext = { insiderCategory: input.insiderCategory };
  if (input.observedDurationDays !== undefined) {
    ctx.observedDurationDays = input.observedDurationDays;
  }
  if (input.priorInternalReportRef) {
    ctx.priorInternalReportRef = input.priorInternalReportRef;
  }
  if (input.documentaryReference) {
    ctx.documentaryReference = input.documentaryReference;
  }
  return ctx;
}

// Insider reports without community confirmation get up to 180 days
// before expiring without escalation, per the /whistleblower design.
const INSIDER_VERIFICATION_WINDOW_DAYS = 180;

export function insiderVerificationDeadline(now: Date = new Date()): string {
  const deadline = new Date(now.getTime() + INSIDER_VERIFICATION_WINDOW_DAYS * 86400000);
  return deadline.toISOString();
}

// ── EXIF stripping ────────────────────────────────────────────────────────

// EXIF stripping runs at the media pipeline layer. When an insider flag is
// set on a report OR the reporter has explicitly requested metadata stripping,
// media uploads go through this helper before storage.
//
// The actual byte-level EXIF removal is performed by expo-image-manipulator
// (which re-encodes JPEGs and drops metadata as a side effect) or by the
// Modal image-processing worker for uploads coming from the web app.
//
// This module exports the intent + validation; the implementation is chosen
// by the upload pipeline based on which runtime is active.

export interface StripMetadataOptions {
  reason: 'insider' | 'user-requested' | 'blanket-policy';
}

export interface StripMetadataResult {
  stripped: boolean;
  method: 'expo-image-manipulator' | 'modal-worker' | 'skipped';
  detail?: string;
}

/**
 * Mark a media attachment for metadata stripping. The actual byte-level
 * strip runs in the upload pipeline (expo-image-manipulator native / Modal
 * worker web).
 *
 * Real implementation is coordinated with `src/services/mediaPipeline.ts`;
 * this function returns intent metadata that the pipeline consumes.
 */
export function requestMetadataStrip(
  media: MediaAttachment,
  options: StripMetadataOptions,
): { media: MediaAttachment; strip: StripMetadataOptions } {
  return { media, strip: options };
}

/**
 * Should the media pipeline strip EXIF for this report?
 */
export function shouldStripMetadata(report: Report): boolean {
  return Boolean(report.insider);
}

// ── Out-of-scope referrals ────────────────────────────────────────────────

// When a user attempts to submit an insider report in an out-of-scope
// category (personnel grievance, criminal misconduct, classified info,
// retaliation), surface a referral to the correct channel.

export type OutOfScopeCategory =
  | 'personnel-grievance'
  | 'criminal-misconduct'
  | 'classified-info'
  | 'retaliation-claim'
  | 'policy-dispute'
  | 'confidential-materials';

export interface Referral {
  category: OutOfScopeCategory;
  headline: string;
  explanation: string;
  channels: Array<{ name: string; url?: string; notes?: string }>;
}

const REFERRAL_TABLE: Record<OutOfScopeCategory, Omit<Referral, 'category'>> = {
  'personnel-grievance': {
    headline: 'Personnel grievance — go to your state EEOC or union counsel',
    explanation:
      'Hostile work environment, harassment, or discrimination against you personally is an employment-law matter that requires specialized procedural steps to preserve your legal remedies. Fault Line is not the right channel.',
    channels: [
      { name: 'U.S. EEOC', url: 'https://www.eeoc.gov/filing-charge-discrimination' },
      { name: 'Your state civil rights office', notes: 'Search "[state] civil rights complaint"' },
      { name: 'Your union or association counsel if you have one' },
    ],
  },
  'criminal-misconduct': {
    headline: 'Criminal misconduct — go to Inspector General, Attorney General, or FBI',
    explanation:
      'Allegations of criminal conduct against named individuals require investigative authorities with subpoena power. Documenting this through a civic-tech app is not the appropriate mechanism.',
    channels: [
      { name: 'State Inspector General', notes: 'Search "[state] inspector general complaint"' },
      { name: 'State Attorney General', notes: 'Search "[state] attorney general public integrity"' },
      { name: 'FBI Public Corruption', url: 'https://www.fbi.gov/investigate/public-corruption' },
    ],
  },
  'classified-info': {
    headline: 'Classified information — Fault Line will not accept this',
    explanation:
      'Accepting classified information could create serious legal liability for the reporter, for Fault Line, and for anyone in a chain of custody. Do not submit through this channel.',
    channels: [
      {
        name: 'Intelligence Community Whistleblower Protection Act channels',
        url: 'https://www.dni.gov/index.php/who-we-are/organizations/icig/icig-what-we-do/icig-external-comms',
        notes: 'Use the ICWPA or your agency\'s IG only, with counsel.',
      },
      { name: 'A licensed national security whistleblower attorney', notes: 'Do this first.' },
    ],
  },
  'retaliation-claim': {
    headline: 'Retaliation claim — consult a whistleblower attorney',
    explanation:
      'If your employer has retaliated (or you fear retaliation) for a protected disclosure, the state and federal whistleblower-protection statutes have strict procedural requirements to preserve your remedies. Fault Line cannot substitute for that counsel.',
    channels: [
      { name: 'National Whistleblower Center attorney referral', url: 'https://www.whistleblowers.org/' },
      { name: 'Government Accountability Project attorney referral', url: 'https://whistleblower.org/' },
      { name: 'Your state bar\'s referral service' },
    ],
  },
  'policy-dispute': {
    headline: 'Policy disagreement — this is not an infrastructure failure',
    explanation:
      'Fault Line documents physical, digital, and access infrastructure conditions. Disagreement with budget priorities, program design, or policy direction is a political matter that belongs in a different channel.',
    channels: [
      { name: 'Municipal budget hearings and council public-comment periods' },
      { name: 'Advocacy organizations focused on the specific policy area' },
      { name: 'Elected officials — see Fault Line briefing packets for structured data if useful' },
    ],
  },
  'confidential-materials': {
    headline: 'Confidential materials — describe the infrastructure condition, do not send documents',
    explanation:
      'Attorney-client materials, HIPAA-covered records, personnel records of others, and other privileged documents should not be sent through Fault Line. Describe the underlying infrastructure condition; do not send the documents themselves.',
    channels: [
      { name: 'Submit only the infrastructure observation itself, without the confidential document' },
      { name: 'For legal-privileged documents: consult counsel before disclosure to anyone' },
    ],
  },
};

export function getReferral(category: OutOfScopeCategory): Referral {
  return { category, ...REFERRAL_TABLE[category] };
}

export function getAllReferrals(): Referral[] {
  return (Object.keys(REFERRAL_TABLE) as OutOfScopeCategory[]).map(getReferral);
}
