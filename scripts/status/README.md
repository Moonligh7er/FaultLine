# Fault Line — Service Status Checker

Point-in-time probe of every critical dependency (marketing site, web app, Supabase, Modal workers, Resend, Anthropic, external references). Generates `status.html` for public consumption + `status.json` for machine consumers.

## Run manually

```bash
node scripts/status/check-services.mjs
```

Outputs:

- `scripts/status/status.json` — machine-readable
- `status.html` — served at `https://fault-line.dev/status.html`
- `website/status.html` — mirror

## Interpret the results

Each probe has a `tier`:

- **critical** — failure makes the platform unusable
- **critical-backend** — failure breaks background pipelines (escalation, cron) without breaking the app shell
- **degrades-gracefully** — the app has a fallback; user impact minimal
- **reference** — third-party pages Fault Line links out to (statute sources, DOJ portal); links 404 if down

Summary badge is computed:
- Any critical service down → `major-outage`
- Any service down → `partial-outage`
- Any service degraded → `degraded`
- All up → `operational`

## Schedule via GitHub Actions

For hourly polling (no external service, no cost beyond CI minutes):

```yaml
# .github/workflows/status-check.yml
name: Status check
on:
  schedule:
    - cron: '0 * * * *'   # hourly
  workflow_dispatch:
jobs:
  probe:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: node scripts/status/check-services.mjs
      - name: Commit updated status
        run: |
          git config user.name  "status-bot"
          git config user.email "status-bot@moonlitsociallabs"
          git add status.html website/status.html scripts/status/status.json
          git diff --staged --quiet || git commit -m "Auto-update service status"
          git push
```

The auto-commit push triggers a fresh GitHub Pages deploy, so `status.html` on the live site refreshes hourly.

## Cold-start caveat

Modal workers (Kokoro TTS, digital snapshot) scale to zero and cold-start on first request. A single 10-second timeout is normal, not an outage. The probe marks `coldStartExpected: true` targets as `degraded` (not `down`) when they time out; re-run to confirm.

## Adding a new probe

Append an object to `PROBES` in `check-services.mjs`:

```js
{
  id: 'my-service',
  label: 'My New Service',
  url: 'https://api.example.com/health',
  tier: 'degrades-gracefully',      // or 'critical' | 'critical-backend' | 'reference'
  expectedStatus: [200],
  hostedOn: 'Vendor Name',
  impactIfDown: 'What breaks if this fails.',
  coldStartExpected: false,          // optional
}
```

## Honest limits

- **Not real-time.** Status is fresh as of the last run — see the "Last checked" timestamp on the page.
- **Not truly independent.** If the marketing site is down, `status.html` is unreachable. External uptime monitoring (Better Stack, UptimeRobot) is the answer for that case — captured in `DEFERRED.md`.
- **Not deep health.** A 200 at an API root doesn't guarantee every endpoint works. This checks reachability + expected status codes; it doesn't exercise real API calls.
