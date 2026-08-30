import type { DigitalReportContext } from '../types';

// ============================================================
// Digital Infrastructure Snapshot Service (scaffold)
//
// When a resident files a digital-infrastructure report (broken city form,
// inaccessible PDF, missing translation, ADA web-accessibility violation),
// the URL of the affected resource needs to be captured at submission time —
// so the report can be evidenced later against remediation.
//
// This module defines the interface. The actual snapshot capture is
// performed by a Modal + Playwright worker (see modal/digital-snapshot/,
// scoped in DEFERRED #26). Until that worker ships, calls to captureSnapshot
// return a placeholder result and log a TODO — the report still submits and
// carries the target URL, just without an evidentiary snapshot.
// ============================================================

export interface SnapshotResult {
  ref: string;                       // Storage bucket key for the captured snapshot
  capturedAt: string;                // ISO timestamp
  htmlBytes: number;                 // Size of captured HTML
  screenshotBytes: number;           // Size of captured full-page screenshot
  httpStatus: number;                // Response status of the URL at capture time
  responseHeaders?: Record<string, string>;
  // If the capture failed, ref is empty string and error carries the reason.
  error?: string;
}

export interface SnapshotOptions {
  timeoutMs?: number;                // Default 15000
  viewport?: { width: number; height: number };
  waitForNetworkIdle?: boolean;
  stripSensitiveHeaders?: boolean;   // Strip auth-related response headers before storage
}

/**
 * Capture a snapshot of a URL for digital-infrastructure evidence.
 *
 * Real implementation:
 *   POST { url, options } to WEB_FORM_WORKER_URL/capture-snapshot with
 *   the worker secret header. The Modal worker uses Playwright to load
 *   the page, capture HTML + full-page screenshot, and stream both to a
 *   private Supabase storage bucket (`digital-infra-snapshots`). Returns
 *   the storage key.
 *
 * Placeholder implementation (current):
 *   Logs the request and returns an error result. Reports still submit
 *   with the target URL captured; they just lack evidentiary snapshots
 *   until the worker ships. See DEFERRED #26 for the worker deployment
 *   scope.
 */
export async function captureSnapshot(
  url: string,
  _options: SnapshotOptions = {},
): Promise<SnapshotResult> {
  // TODO(DEFERRED #26): plug in the Modal + Playwright snapshot worker.
  // Until then, return a placeholder that keeps the API surface stable
  // for consumers (the reporting UI can save the report with snapshotRef
  // undefined and prompt the user to try again once the worker is live).
  const capturedAt = new Date().toISOString();
  return {
    ref: '',
    capturedAt,
    htmlBytes: 0,
    screenshotBytes: 0,
    httpStatus: 0,
    error:
      'Snapshot service not yet deployed. URL captured with the report; evidentiary snapshot will be added when the Modal + Playwright worker ships (DEFERRED #26). See src/services/digitalSnapshot.ts for the interface.',
  };
}

/**
 * Build a DigitalReportContext from user-provided fields + an optional snapshot.
 * The reporting UI calls this to construct the `digital` sub-object on a Report.
 */
export function buildDigitalContext(input: {
  targetUrl: string;
  assistiveTech?: string;
  browser?: string;
  platform?: string;
  wcagCriterion?: string;
  snapshot?: SnapshotResult;
}): DigitalReportContext {
  const context: DigitalReportContext = {
    targetUrl: input.targetUrl,
  };
  if (input.assistiveTech) context.assistiveTech = input.assistiveTech;
  if (input.browser) context.browser = input.browser;
  if (input.platform) context.platform = input.platform;
  if (input.wcagCriterion) context.wcagCriterion = input.wcagCriterion;
  if (input.snapshot?.ref) context.snapshotRef = input.snapshot.ref;
  return context;
}

/**
 * Formatted context block for inclusion in a demand letter. Reads the
 * report's digital sub-object and returns the block that goes into the
 * EVIDENCE section of the generated letter.
 */
export function digitalContextForLetter(context: DigitalReportContext): string {
  const lines: string[] = [];
  lines.push(`URL: ${context.targetUrl}`);
  if (context.snapshotRef) {
    lines.push(`Snapshot: captured at submission (ref: ${context.snapshotRef})`);
  } else {
    lines.push('Snapshot: not captured (snapshot service not yet deployed)');
  }
  if (context.assistiveTech) {
    lines.push(
      `Assistive tech in use: ${context.assistiveTech}${context.browser ? ` + ${context.browser}` : ''}${context.platform ? ` on ${context.platform}` : ''}`,
    );
  }
  if (context.wcagCriterion) {
    lines.push(`WCAG success criterion: ${context.wcagCriterion}`);
  }
  return lines.join('\n');
}

/**
 * Category keys that require URL-first submission (digital-infrastructure Group F).
 * The reporting UI switches to the URL-first flow when the user selects any of these.
 */
export const URL_FIRST_CATEGORIES: ReadonlyArray<string> = [
  'broken_city_website_form',
  'screen_reader_inaccessible_pdf',
  'city_website_ada_violation',
  'missing_plain_language_version',
  'missing_captions_official_video',
  'broken_mobile_app_accessibility',
  'missing_digital_service_equivalent',
  'broken_government_email',
  'broken_phone_accessibility',
  'missing_responsive_design',
  'broken_subscription_mechanism',
] as const;

export function isUrlFirstCategory(categoryKey: string): boolean {
  return URL_FIRST_CATEGORIES.includes(categoryKey);
}
