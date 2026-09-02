#!/usr/bin/env node
/**
 * Fault Line — Service Status Checker
 *
 * Probes every critical dependency and emits:
 *   - scripts/status/status.json (machine-readable)
 *   - status.html (root — served at https://fault-line.dev/status.html)
 *   - website/status.html (mirror for GitHub Pages)
 *
 * Read-only. Safe to run on any schedule (cron, GitHub Actions,
 * or manually before/after a deployment).
 *
 * Usage:
 *   node scripts/status/check-services.mjs
 *
 * Honest caveats:
 *   - This is a *point-in-time* probe. The generated status.html shows
 *     the state at the last run — it does not update between runs.
 *   - If the marketing site (fault-line.dev) itself is down, the status
 *     page is unreachable from the public web. For that case, external
 *     uptime monitoring (Better Stack / UptimeRobot) is the answer —
 *     see DEFERRED item on external monitoring.
 *   - A 404 or 401 at an API root URL is often expected (the API is up
 *     but requires auth). The `expectedStatus` field per probe encodes
 *     what counts as "healthy" for each endpoint.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const TIMEOUT_MS = 10_000;

// ─────────────────────────────────────────────────────────────────
// Probe targets
// ─────────────────────────────────────────────────────────────────

const PROBES = [
  {
    id: 'marketing-site',
    label: 'Marketing site',
    url: 'https://fault-line.dev/',
    tier: 'critical',
    expectedStatus: [200, 301, 302],
    hostedOn: 'GitHub Pages',
    impactIfDown: 'Marketing pages, blog, methodology, FAQ, changelog all unreachable.',
  },
  {
    id: 'webapp',
    label: 'Web app',
    url: 'https://app.fault-line.dev/',
    tier: 'critical',
    expectedStatus: [200, 301, 302],
    hostedOn: 'Vercel',
    impactIfDown: 'Residents cannot submit reports from the web. Note: a 200 here means the Next.js shell renders; it does not confirm Supabase is reachable.',
  },
  {
    id: 'supabase-rest',
    label: 'Supabase PostgREST API',
    url: 'https://dzewklljiksyivsfpunt.supabase.co/rest/v1/',
    tier: 'critical',
    expectedStatus: [200, 401, 404],
    hostedOn: 'Supabase',
    impactIfDown: 'Every DB read/write in the webapp and mobile app fails. Escalation cron and all Edge Functions halt.',
  },
  {
    id: 'supabase-auth',
    label: 'Supabase Auth',
    url: 'https://dzewklljiksyivsfpunt.supabase.co/auth/v1/health',
    tier: 'critical',
    expectedStatus: [200],
    hostedOn: 'Supabase',
    impactIfDown: 'Login and signed-in report submission both broken.',
  },
  {
    id: 'kokoro-tts',
    label: 'Kokoro TTS worker (Modal)',
    url: 'https://moons7onr--kokoro-tts-server-kokorotts-health.modal.run',
    tier: 'degrades-gracefully',
    expectedStatus: [200],
    hostedOn: 'Modal',
    impactIfDown: 'Voice narration falls back to expo-speech native TTS. Core app fully functional.',
    coldStartExpected: true,
  },
  {
    id: 'resend-api',
    label: 'Resend email API',
    url: 'https://api.resend.com/',
    tier: 'critical-backend',
    expectedStatus: [200, 401, 404],
    hostedOn: 'Resend',
    impactIfDown: 'Escalation email delivery to authorities halts. Report submission still works; nothing gets sent to municipal offices.',
  },
  {
    id: 'anthropic-api',
    label: 'Anthropic API',
    url: 'https://api.anthropic.com/',
    tier: 'degrades-gracefully',
    expectedStatus: [200, 401, 404, 405],
    hostedOn: 'Anthropic',
    impactIfDown: 'AI photo analysis + letter enhancement fall back to non-AI defaults. Reports still submit; letters still generate from templates.',
  },
  {
    id: 'openstreetmap',
    label: 'OpenStreetMap API',
    url: 'https://api.openstreetmap.org/api/versions',
    tier: 'degrades-gracefully',
    expectedStatus: [200],
    hostedOn: 'OpenStreetMap Foundation',
    impactIfDown: 'Map tiles may fail to render on the web app map view. Reports still submit with GPS.',
  },
  {
    id: 'seeclickfix-api',
    label: 'SeeClickFix API',
    url: 'https://seeclickfix.com/api/v2/places?per_page=1',
    tier: 'degrades-gracefully',
    expectedStatus: [200, 401, 403],
    hostedOn: 'SeeClickFix / CivicPlus',
    impactIfDown: 'Escalation to SeeClickFix-backed cities falls back to email fallback via the routing dataset.',
  },
  {
    id: 'doj-crd',
    label: 'DOJ Civil Rights portal',
    url: 'https://civilrights.justice.gov/report/',
    tier: 'reference',
    expectedStatus: [200, 301, 302],
    hostedOn: 'US Department of Justice',
    impactIfDown: 'Federal-fallback complaint pathway link in generated ADA Title II letters would 404 for recipients.',
  },
  {
    id: 'ma-legislature',
    label: 'MA statute source (malegislature.gov)',
    url: 'https://malegislature.gov/',
    tier: 'reference',
    expectedStatus: [200, 301, 302],
    hostedOn: 'Massachusetts General Court',
    impactIfDown: 'M.G.L. c. 84 § 15 citation links in generated MA demand letters would 404 for recipients.',
  },
];

// ─────────────────────────────────────────────────────────────────
// Probe execution
// ─────────────────────────────────────────────────────────────────

async function probe(target) {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(target.url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Fault-Line-Status/0.1 (moonlit-social-labs@proton.me)',
      },
      redirect: 'manual',
    });
    clearTimeout(timeout);
    const elapsedMs = Date.now() - started;
    const httpStatus = response.status;
    const healthy = target.expectedStatus.includes(httpStatus);
    return {
      status: healthy ? 'up' : 'degraded',
      httpStatus,
      elapsedMs,
      detail: healthy
        ? `HTTP ${httpStatus} in ${elapsedMs}ms`
        : `HTTP ${httpStatus} unexpected (expected one of: ${target.expectedStatus.join(', ')})`,
    };
  } catch (err) {
    const elapsedMs = Date.now() - started;
    const isTimeout = err.name === 'AbortError';
    const isDns = /getaddrinfo|ENOTFOUND|EAI_AGAIN/i.test(String(err.message || err));
    let detail;
    if (isTimeout) {
      detail = `Timeout after ${TIMEOUT_MS}ms${target.coldStartExpected ? ' (Modal cold-start is possible; retry to confirm)' : ''}`;
    } else if (isDns) {
      detail = `DNS resolution failed (${err.message}) — domain may not exist, or DNS is unreachable`;
    } else {
      detail = `Fetch failed: ${err.message || String(err)}`;
    }
    return {
      status: target.coldStartExpected && isTimeout ? 'degraded' : 'down',
      httpStatus: 0,
      elapsedMs,
      detail,
    };
  }
}

async function probeAll() {
  const results = await Promise.all(
    PROBES.map(async (target) => ({ target, result: await probe(target) })),
  );
  return results;
}

// ─────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────

function summarize(results) {
  const criticalDown = results.filter(
    (r) => (r.target.tier === 'critical' || r.target.tier === 'critical-backend') && r.result.status === 'down',
  );
  const anyDown = results.filter((r) => r.result.status === 'down');
  const anyDegraded = results.filter((r) => r.result.status === 'degraded');
  if (criticalDown.length > 0) {
    return {
      badge: 'major-outage',
      badgeLabel: 'Major outage',
      description: `${criticalDown.length} critical service${criticalDown.length === 1 ? '' : 's'} down: ${criticalDown.map((r) => r.target.label).join(', ')}.`,
    };
  }
  if (anyDown.length > 0) {
    return {
      badge: 'partial-outage',
      badgeLabel: 'Partial outage',
      description: `${anyDown.length} service${anyDown.length === 1 ? '' : 's'} down but no critical service is affected.`,
    };
  }
  if (anyDegraded.length > 0) {
    return {
      badge: 'degraded',
      badgeLabel: 'Degraded',
      description: `${anyDegraded.length} service${anyDegraded.length === 1 ? '' : 's'} degraded (cold-start or slow response).`,
    };
  }
  return {
    badge: 'operational',
    badgeLabel: 'All systems operational',
    description: 'Every probed service is up and responding within expected parameters.',
  };
}

// ─────────────────────────────────────────────────────────────────
// HTML generator
// ─────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  up: '#46C37A',       // signal-green
  degraded: '#F4B832', // amber (theme accent)
  down: '#E8463E',     // signal-red
};

const BADGE_COLORS = {
  operational: '#46C37A',
  degraded: '#F4B832',
  'partial-outage': '#F4B832',
  'major-outage': '#E8463E',
};

const TIER_LABELS = {
  critical: 'CRITICAL',
  'critical-backend': 'CRITICAL · BACKEND',
  'degrades-gracefully': 'DEGRADES GRACEFULLY',
  reference: 'REFERENCE',
};

function statusEmoji(status) {
  return { up: '🟢', degraded: '🟡', down: '🔴' }[status] || '⚪';
}

function renderHtml(results, summary, runAt) {
  const runAtLabel = new Date(runAt).toISOString().replace('T', ' at ').slice(0, 19) + ' UTC';
  const rows = results
    .map(({ target, result }) => `
      <tr>
        <td class="svc">
          <span class="dot" style="background:${STATUS_COLORS[result.status]}"></span>
          <span class="svc-label">${escapeHtml(target.label)}</span>
        </td>
        <td class="tier"><span class="tier-tag tier-${target.tier}">${TIER_LABELS[target.tier]}</span></td>
        <td class="host">${escapeHtml(target.hostedOn)}</td>
        <td class="detail">
          <div class="detail-line">${escapeHtml(result.detail)}</div>
          ${result.status !== 'up' ? `<div class="impact">${escapeHtml(target.impactIfDown)}</div>` : ''}
        </td>
      </tr>
    `)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://www.google-analytics.com https://analytics.google.com; object-src 'none'; base-uri 'self';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Fault Line — Service Status</title>
<meta name="description" content="Point-in-time status of Fault Line's critical service dependencies. Last checked ${runAtLabel}.">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://fault-line.dev/status.html">

<meta property="og:type" content="website">
<meta property="og:url" content="https://fault-line.dev/status.html">
<meta property="og:title" content="Fault Line — Service Status">
<meta property="og:description" content="Live status of Fault Line's critical service dependencies. Point-in-time probe, updated periodically.">

<link rel="stylesheet" href="theme.css?v=20260506">

<style>
main { max-width: 960px; margin: 0 auto; padding: 24px 32px 80px; }
main h1 { font-size: clamp(38px, 6vw, 60px); letter-spacing: -1.5px; margin-bottom: 8px; }
main h1 em { font-style: italic; color: var(--tile-hot); }
main .updated { font-family: var(--ff-mono); font-size: 12px; color: var(--steel-light); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 34px; }

.summary-panel {
  border: 1px solid ${BADGE_COLORS[summary.badge]};
  padding: 20px 24px;
  margin: 8px 0 32px;
  background: rgba(0, 0, 0, 0.15);
}
.summary-panel h2 {
  color: ${BADGE_COLORS[summary.badge]};
  font-family: var(--ff-mono);
  font-size: 14px;
  letter-spacing: 2px;
  text-transform: uppercase;
  margin: 0 0 8px;
}
.summary-panel p { font-family: var(--ff-body); color: var(--tile); font-size: 16px; line-height: 1.6; margin: 0; }

table.status {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0 24px;
  font-family: var(--ff-body);
  font-size: 14px;
}
table.status th {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.15);
  font-family: var(--ff-mono);
  font-size: 10px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--tile);
  background: rgba(0,0,0,0.2);
}
table.status td {
  padding: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  vertical-align: top;
  color: var(--tile-dim);
}
table.status td.svc { min-width: 220px; }
table.status td.svc .svc-label { color: var(--tile); font-weight: 600; }
table.status td.svc .dot {
  display: inline-block; width: 10px; height: 10px; border-radius: 50%;
  margin-right: 8px; vertical-align: middle;
}
table.status td.tier { white-space: nowrap; }
.tier-tag {
  display: inline-block;
  font-family: var(--ff-mono);
  font-size: 9px;
  letter-spacing: 1.5px;
  padding: 2px 8px;
  border-radius: 2px;
  text-transform: uppercase;
}
.tier-tag.tier-critical { background: rgba(232, 70, 62, 0.18); color: #E8463E; }
.tier-tag.tier-critical-backend { background: rgba(232, 70, 62, 0.12); color: #E8463E; }
.tier-tag.tier-degrades-gracefully { background: rgba(244, 184, 50, 0.15); color: #F4B832; }
.tier-tag.tier-reference { background: rgba(107, 122, 145, 0.20); color: #8C95A3; }
table.status td.host { color: var(--steel-light); font-family: var(--ff-mono); font-size: 12px; }
table.status td.detail .detail-line { color: var(--tile); font-family: var(--ff-mono); font-size: 12px; }
table.status td.detail .impact { color: var(--tile-dim); font-size: 13px; margin-top: 6px; font-style: italic; line-height: 1.5; }

.callout {
  border-left: 3px solid var(--tile-hot);
  padding: 14px 18px;
  margin: 32px 0;
  background: rgba(0,0,0,0.15);
  font-family: var(--ff-body);
  font-size: 14px;
  line-height: 1.6;
  color: var(--tile-dim);
}
.callout p { margin: 0 0 8px; }
.callout p:last-child { margin-bottom: 0; }
.callout strong { color: var(--tile); }

.legend {
  display: flex; flex-wrap: wrap; gap: 24px;
  margin: 12px 0 24px; font-family: var(--ff-body); font-size: 13px; color: var(--tile-dim);
}
.legend .legend-item { display: flex; align-items: center; gap: 6px; }
.legend .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
</style>
</head>
<body>

<div class="hazard"></div>

<nav class="nav">
  <a href="index.html" class="nav-brand"><span class="brand-fault">Fault</span><span class="brand-slash">\\</span><span class="brand-line">Line</span><span class="beta-badge">BETA</span></a>
  <div class="nav-links">
    <a href="index.html">Home</a>
    <a href="faq.html">FAQ</a>
    <a href="changelog.html">Changelog</a>
    <a href="status.html" aria-current="page">Status</a>
    <span class="active-dev-status"><span class="nav-dot"></span> Active Development</span>
  </div>
</nav>

<main>
<h1>Service <em>status</em>.</h1>
<p class="updated">Last checked · ${runAtLabel}</p>

<div class="summary-panel">
  <h2>${summary.badgeLabel}</h2>
  <p>${escapeHtml(summary.description)}</p>
</div>

<div class="legend">
  <div class="legend-item"><span class="dot" style="background:${STATUS_COLORS.up}"></span> Up &mdash; responding as expected</div>
  <div class="legend-item"><span class="dot" style="background:${STATUS_COLORS.degraded}"></span> Degraded &mdash; slow or unexpected but not fully down</div>
  <div class="legend-item"><span class="dot" style="background:${STATUS_COLORS.down}"></span> Down &mdash; unreachable</div>
</div>

<table class="status">
  <thead>
    <tr>
      <th>Service</th>
      <th>Tier</th>
      <th>Hosted on</th>
      <th>Detail</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>

<div class="callout">
  <p><strong>This is a point-in-time probe, not a real-time status.</strong> The results above reflect the state at the timestamp shown, not the state right now. The check runs periodically (via GitHub Actions or manual invocation of <code>node scripts/status/check-services.mjs</code>).</p>
  <p>If the marketing site itself is down, this page is not reachable either. For a truly independent status source, an external uptime service (Better Stack, UptimeRobot) is required &mdash; see the <a href="changelog.html">changelog</a> for the current infra roadmap.</p>
  <p><strong>What the tiers mean:</strong> <em>Critical</em> failures make the platform unusable for users. <em>Critical &middot; backend</em> failures break background pipelines (escalation, cron) without affecting the app shell. <em>Degrades gracefully</em> services have fallbacks &mdash; if they&rsquo;re down, the app still works with reduced capability. <em>Reference</em> targets are third-party pages Fault Line links out to; if they&rsquo;re down, the links 404 for recipients.</p>
</div>

</main>

<footer>
  <a href="index.html">Home</a> &middot;
  <a href="cities.html">For Cities</a> &middot;
  <a href="methodology.html">Methodology</a> &middot;
  <a href="faq.html">FAQ</a> &middot;
  <a href="changelog.html">Changelog</a> &middot;
  <a href="status.html">Status</a> &middot;
  <a href="feedback.html">Feedback</a> &middot;
  <a href="https://app.fault-line.dev" target="_blank" rel="noopener">Web app</a> &middot;
  <a href="https://ko-fi.com/moonlitsociallabs" target="_blank" rel="noopener">Ko-fi</a>
  <br><br>&copy; 2026 Moonlit Social Labs &middot; Fault Line is a product of Moonlit Social Labs
</footer>

</body>
</html>
`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

async function main() {
  const runAt = new Date().toISOString();
  console.log(`Probing ${PROBES.length} services...`);
  const results = await probeAll();
  const summary = summarize(results);

  for (const { target, result } of results) {
    console.log(
      `  ${statusEmoji(result.status)} ${target.id.padEnd(22)} ${result.status.padEnd(10)} ${result.detail}`,
    );
  }

  console.log(`\n[${summary.badge}] ${summary.description}`);

  // Write JSON
  const jsonPath = path.resolve('scripts/status/status.json');
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(
    jsonPath,
    JSON.stringify({ runAt, summary, results: results.map(({ target, result }) => ({ id: target.id, label: target.label, tier: target.tier, ...result })) }, null, 2),
    'utf8',
  );
  console.log(`\nWrote JSON: ${jsonPath}`);

  // Write HTML to root + website mirror
  const html = renderHtml(results, summary, runAt);
  const htmlPath = path.resolve('status.html');
  const mirrorPath = path.resolve('website/status.html');
  await fs.writeFile(htmlPath, html, 'utf8');
  console.log(`Wrote HTML: ${htmlPath}`);
  try {
    await fs.mkdir(path.dirname(mirrorPath), { recursive: true });
    await fs.writeFile(mirrorPath, html, 'utf8');
    console.log(`Wrote HTML mirror: ${mirrorPath}`);
  } catch (err) {
    console.warn(`Could not mirror to website/: ${err.message}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
