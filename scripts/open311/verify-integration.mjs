#!/usr/bin/env node
/**
 * Open311 / SeeClickFix Integration Verification Script
 *
 * Runs GET-only probes against a per-authority target list and reports
 * which endpoints are live, which return valid Open311 metadata, and
 * which are dead. Produces a machine-readable JSON report + a
 * markdown-formatted status table for docs/integration-status.md.
 *
 * Usage:
 *   node scripts/open311/verify-integration.mjs
 *   node scripts/open311/verify-integration.mjs --output docs/integration-status.md
 *
 * Never posts anything — read-only. Safe to run repeatedly; each run
 * updates the status table with the latest observed state.
 *
 * See DEFERRED #23 for the "why" — verification unblocks pilot-city
 * demos where public works directors ask "does this actually work
 * against our 311?" Being able to answer "yes, we tested it last week,
 * here's the log" is the difference between a signed pilot and a lost
 * lead.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const TIMEOUT_MS = 10_000;

// ─────────────────────────────────────────────────────────────────
// Top-10 pilot-target authorities (per pilot-outreach.html priority
// list; expanded as pilots engage). Categories:
//   'open311'  — expects /discovery response with jurisdiction + endpoints
//   'seeclickfix' — SeeClickFix aggregate endpoint per-place probe
//   'proprietary' — known proprietary 311 (should not fire an Open311 probe)
//   'web-form'    — falls through to Modal browser-automation worker
// ─────────────────────────────────────────────────────────────────
const TARGETS = [
  // Massachusetts
  {
    id: 'boston-ma',
    label: 'Boston MA — Boston 311 (Open311)',
    kind: 'open311',
    discoveryUrl: 'https://mayors24.cityofboston.gov/open311/v2/discovery.json',
    jurisdictionId: 'boston.gov',
    notes: 'POST requires API key — GET is public. See DEFERRED #9e for key request.',
  },
  {
    id: 'cambridge-ma',
    label: 'Cambridge MA — SeeClickFix',
    kind: 'seeclickfix',
    seeclickfixSlug: 'cambridge',
    notes: 'Standard SeeClickFix aggregate endpoint.',
  },
  {
    id: 'somerville-ma',
    label: 'Somerville MA — QScend (web-form fallback)',
    kind: 'web-form',
    notes: 'QScend proprietary — Fault Line escalates via web-form adapter in modal/web_form_submitter/.',
  },
  {
    id: 'worcester-ma',
    label: 'Worcester MA — SeeClickFix',
    kind: 'seeclickfix',
    seeclickfixSlug: 'worcester',
  },
  {
    id: 'lowell-ma',
    label: 'Lowell MA — SeeClickFix',
    kind: 'seeclickfix',
    seeclickfixSlug: 'lowell',
  },
  // Rhode Island
  {
    id: 'newport-ri',
    label: 'Newport RI — SeeClickFix',
    kind: 'seeclickfix',
    seeclickfixSlug: 'newport',
  },
  {
    id: 'providence-ri',
    label: 'Providence RI — PVD311 (proprietary)',
    kind: 'proprietary',
    notes: 'Proprietary 311; email/web-form fallback only.',
  },
  // New Hampshire
  {
    id: 'manchester-nh',
    label: 'Manchester NH — SeeClickFix',
    kind: 'seeclickfix',
    seeclickfixSlug: 'manchester',
  },
  {
    id: 'concord-nh',
    label: 'Concord NH — email fallback',
    kind: 'email',
    notes: 'No 311 API; direct email to public works.',
  },
  {
    id: 'portsmouth-nh',
    label: 'Portsmouth NH — SeeClickFix',
    kind: 'seeclickfix',
    seeclickfixSlug: 'portsmouth',
  },
];

const SEECLICKFIX_BASE = 'https://seeclickfix.com/api/v2';

// ─────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Fault-Line-Integration-Verifier/0.1 (moonlit-social-labs@proton.me)',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function verifyOpen311(target) {
  const started = Date.now();
  try {
    const res = await fetchWithTimeout(target.discoveryUrl);
    const elapsedMs = Date.now() - started;
    if (!res.ok) {
      return {
        status: 'unreachable',
        httpStatus: res.status,
        elapsedMs,
        detail: `Discovery returned HTTP ${res.status}.`,
      };
    }
    const body = await res.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return {
        status: 'invalid-response',
        httpStatus: res.status,
        elapsedMs,
        detail: 'Discovery response is not valid JSON.',
      };
    }
    const hasEndpoints = Array.isArray(body.endpoints) && body.endpoints.length > 0;
    return {
      status: hasEndpoints ? 'live' : 'partial',
      httpStatus: res.status,
      elapsedMs,
      detail: hasEndpoints
        ? `Discovery live · ${body.endpoints.length} endpoint(s) advertised.`
        : 'Discovery reachable but no endpoints advertised.',
      jurisdiction: body.contact || target.jurisdictionId,
    };
  } catch (err) {
    return {
      status: 'unreachable',
      httpStatus: 0,
      elapsedMs: Date.now() - started,
      detail: `Fetch failed: ${err.message || String(err)}`,
    };
  }
}

async function verifySeeClickFix(target) {
  const started = Date.now();
  const url = `${SEECLICKFIX_BASE}/issues?place_url=${encodeURIComponent(target.seeclickfixSlug)}&per_page=1`;
  try {
    const res = await fetchWithTimeout(url);
    const elapsedMs = Date.now() - started;
    if (!res.ok) {
      return {
        status: 'unreachable',
        httpStatus: res.status,
        elapsedMs,
        detail: `SeeClickFix returned HTTP ${res.status}.`,
      };
    }
    const body = await res.json().catch(() => null);
    if (!body || !Array.isArray(body.issues)) {
      return {
        status: 'invalid-response',
        httpStatus: res.status,
        elapsedMs,
        detail: 'SeeClickFix response is not the expected shape.',
      };
    }
    return {
      status: 'live',
      httpStatus: res.status,
      elapsedMs,
      detail: `SeeClickFix aggregate endpoint live · ${body.metadata?.pagination?.total_entries ?? 0} issues in place.`,
    };
  } catch (err) {
    return {
      status: 'unreachable',
      httpStatus: 0,
      elapsedMs: Date.now() - started,
      detail: `Fetch failed: ${err.message || String(err)}`,
    };
  }
}

async function verifyTarget(target) {
  switch (target.kind) {
    case 'open311':
      return verifyOpen311(target);
    case 'seeclickfix':
      return verifySeeClickFix(target);
    case 'proprietary':
      return {
        status: 'not-applicable',
        elapsedMs: 0,
        detail: 'Proprietary 311; no public Open311/SeeClickFix probe.',
      };
    case 'web-form':
      return {
        status: 'not-applicable',
        elapsedMs: 0,
        detail: 'Web-form fallback via Modal browser-automation worker; no live probe here.',
      };
    case 'email':
      return {
        status: 'not-applicable',
        elapsedMs: 0,
        detail: 'Email fallback only; no API probe.',
      };
    default:
      return {
        status: 'unknown',
        elapsedMs: 0,
        detail: `Unknown target kind: ${target.kind}.`,
      };
  }
}

// ─────────────────────────────────────────────────────────────────

function statusEmoji(status) {
  switch (status) {
    case 'live':
      return '🟢';
    case 'partial':
      return '🟡';
    case 'unreachable':
    case 'invalid-response':
      return '🔴';
    case 'not-applicable':
      return '⚪';
    default:
      return '❓';
  }
}

function renderMarkdown(results, runAt) {
  const rows = results.map((r) => {
    return `| ${statusEmoji(r.result.status)} ${r.target.id} | ${r.target.label} | ${r.result.status} | ${r.result.httpStatus ?? '—'} | ${r.result.elapsedMs} ms | ${r.result.detail.replace(/\|/g, '\\|')} |`;
  });
  const summary = summarize(results);
  return [
    '# Open311 / SeeClickFix Integration Status',
    '',
    `**Last verified:** ${runAt}`,
    '',
    `**Summary:** ${summary.live} live · ${summary.partial} partial · ${summary.unreachable} unreachable · ${summary.notApplicable} not-applicable`,
    '',
    'This file is auto-generated by `scripts/open311/verify-integration.mjs`.',
    'Run it before scheduling a pilot-city demo — being able to answer',
    '"yes, we tested it last week" is the difference between a signed pilot and a lost lead.',
    '',
    '| Target | Label | Status | HTTP | Elapsed | Detail |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
    '## Legend',
    '',
    '- 🟢 **live** — endpoint responded successfully with expected schema',
    '- 🟡 **partial** — endpoint reachable but incomplete metadata',
    '- 🔴 **unreachable** / **invalid-response** — endpoint failed to respond correctly',
    '- ⚪ **not-applicable** — proprietary / email / web-form path, no live probe',
    '',
    '## Per-target notes',
    '',
    ...results.flatMap((r) =>
      r.target.notes ? [`- **${r.target.id}:** ${r.target.notes}`] : [],
    ),
    '',
  ].join('\n');
}

function summarize(results) {
  const counts = { live: 0, partial: 0, unreachable: 0, notApplicable: 0, other: 0 };
  for (const r of results) {
    if (r.result.status === 'live') counts.live++;
    else if (r.result.status === 'partial') counts.partial++;
    else if (r.result.status === 'unreachable' || r.result.status === 'invalid-response')
      counts.unreachable++;
    else if (r.result.status === 'not-applicable') counts.notApplicable++;
    else counts.other++;
  }
  return counts;
}

// ─────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : null;

  console.log(`Verifying ${TARGETS.length} targets (timeout ${TIMEOUT_MS} ms each)...`);
  const results = [];
  for (const target of TARGETS) {
    const result = await verifyTarget(target);
    console.log(`  ${statusEmoji(result.status)} ${target.id.padEnd(20)} ${result.status.padEnd(20)} ${result.detail}`);
    results.push({ target, result });
  }

  const runAt = new Date().toISOString();
  const summary = summarize(results);
  console.log(`\nSummary: ${summary.live} live · ${summary.partial} partial · ${summary.unreachable} unreachable · ${summary.notApplicable} not-applicable`);

  const jsonReport = { runAt, summary, results };
  const jsonPath = outputPath
    ? outputPath.replace(/\.md$/, '.json')
    : path.resolve('scripts/open311/integration-status.json');
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf8');
  console.log(`Wrote JSON report to ${jsonPath}`);

  if (outputPath) {
    const md = renderMarkdown(results, runAt);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, md, 'utf8');
    console.log(`Wrote markdown report to ${outputPath}`);
  } else {
    const defaultMdPath = path.resolve('docs/integration-status.md');
    const md = renderMarkdown(results, runAt);
    await fs.mkdir(path.dirname(defaultMdPath), { recursive: true });
    await fs.writeFile(defaultMdPath, md, 'utf8');
    console.log(`Wrote markdown report to ${defaultMdPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
