# DEFERRED — Items Requiring External Action or Credentials

These items cannot be completed without external accounts, credentials, or assets.
Each item includes what's needed and what has already been prepared.

**HIGH PRIORITY items** (flagged in the section heading) should be evaluated first — they either unblock other work, close a real user-visible gap, or represent load-bearing plumbing whose absence quietly costs momentum.

---

## ✅ SHIPPED (2026-08-30) · Routing Wire-In + Framing Templates + URL-First + Corridor + Insider + Commercial Scaffolds

Extensive engineering delivery on 2026-08-30 replaced most of what was previously "gated on pilot city." What shipped:

- **Routing wired into `legalGenerator.ts`** (formerly HIGH PRIORITY #30). Letters now consume `getRouting()` alongside `getStatuteRecord()`. `unreviewedBanner()` was generalized to fire on either statute-unverified or routing-unverified (or both). Recipient in letter body uses routing's `primaryAuthority.name` with the passed-in `authorityName` as backwards-compat fallback. `DemandLetterData` gained `routingVersion`, `routingVerificationStatus`, `routingDisclaimer`.
- **Legal-templates module** (`src/services/legal-templates/`) — new versioned module with 5 framings (`defective-highway`, `ada-title-ii`, `fair-housing-504`, `title-vi-language`, `transit-ada`). Every A&E category maps to a framing via `getFraming()`. Letter generator dispatches on framing to produce framing-specific headline, citation, notice period, demand verbs, and federal-fallback complaint pathway. All templates `pending-review`.
- **Digital-infrastructure context** (`src/services/digitalSnapshot.ts`) — `DigitalReportContext` type on `Report`, `URL_FIRST_CATEGORIES` list, `captureSnapshot()` stub with clear TODO for the Modal + Playwright worker (worker deployment stays in #26 remainder), `digitalContextForLetter()` producing an EVIDENCE-section block that gets appended to the letter when the report has `digital`.
- **Corridor/area geometry** (`src/services/corridorAggregation.ts`) — `ReportGeometryType`, `CorridorGeometry`, `AreaGeometry` types on `Report`. `suggestCorridors()` and `suggestAreas()` algorithms compute suggestions from point-report clusters using published thresholds (5+ reports at 3+ distinct points for corridor; 8+ at 5+ for area). `shameIndexWeight()` returns 3× for corridors, 3.5× for areas per methodology. Letter generator NATURE OF THE CONDITION section renders corridor / area geometry when present.
- **Insider-report support** (`src/services/insiderReports.ts`) — `InsiderReportContext` and `InsiderCategory` types on `Report`. `buildInsiderContext()`, `shouldStripMetadata()`, `requestMetadataStrip()`, 180-day `insiderVerificationDeadline()`, full referral table for 6 out-of-scope categories (personnel grievance → EEOC; criminal → IG/AG/FBI; classified → refuse + ICWPA/counsel; retaliation → whistleblower attorneys; policy dispute → councils/advocacy; confidential materials → describe only). Tor formal verification stays deferred per user instruction.
- **Commercial-property module** (`src/services/commercial/`) — `ReportSubject` and `CommercialPropertyContext` types on `Report`. `aggregation.ts` computes property-level and chain-level aggregations against published thresholds (5/3/90 and 15/5/10/180). `chains.ts` seeded with ~40 US corporate chains including MA/RI/NH-relevant ones (Market Basket, Stop & Shop, Shaw's), all `pending-review`. `ada-title-iii.ts` versioned dataset of 5 2010 ADA Standards citations (accessible-route-slope, accessible-entrance, accessible-parking, accessible-restroom, signage-tactile). Right-of-reply pipeline itself is the remainder of #31.
- **`ReportCategory` type** grew from 24 → 63 (39 new Access & Equity categories) as part of the earlier 2026-08-30 batch; commercial + digital + corridor + insider all reference these categories cleanly.

**Everything passes `tsc --noEmit --skipLibCheck` clean.** No new errors introduced.

### What actually remains for each item

The residual items below reflect what is *genuinely* still blocked (external hire / pilot-city data / real infrastructure deployment) — not just deprioritized.

- **#22 (statute review):** truly BLOCKED-EXTERNAL. Requires paid qualified attorney per state.
- **#23 (Open311 verification):** BUILDABLE-TODAY, deprioritized. ~4 hours for the top-10 pilot targets against public endpoints; run before the first pilot demo.
- **#24 (Rapid Response Roll data model):** partly BUILDABLE (resolution-event schema in Supabase, community re-photo verification UI); partly BLOCKED-DATA (pilot city's DPW → crew mapping is theirs).
- **#25 (A&E full ship):** partly SHIPPED (letter templates ✓, category constants ✓, legal-framing dispatch ✓). BUILDABLE remainder: photo-optional reporting-UI flow in `ReportScreen.tsx`. BLOCKED-DATA remainder: municipal ADA coordinator contacts per pilot city (already recorded per-category in `src/services/routing/dataset.ts` for MA/RI/NH placeholders — real coordinator names come from pilots).
- **#26 (Digital infra):** partly SHIPPED (digital context type, URL-first category list, snapshot service interface, letter integration). BUILDABLE remainder: Modal + Playwright snapshot worker deployment (`modal/digital-snapshot/main.py`). Reporting-UI flow that switches to URL-first on category selection.
- **#27 (Briefing packets):** BUILDABLE remainder: packet generator service + right-of-reply pipeline (which #31 also reuses). BLOCKED-DATA remainder: council-district boundaries + verified elected-official addresses per pilot city.
- **#28 (Corridor/area):** partly SHIPPED (geometry types, auto-suggestion algorithm, Shame Index weight, letter integration). BUILDABLE remainder: Supabase migration for PostGIS linestring/polygon columns on `reports`; nightly cron to run `suggestCorridors()`; map-drawing UI in web + native reporting screens.
- **#29 (Insider):** partly SHIPPED (insider-context types, EXIF strip helper, referral copy for out-of-scope categories, 180-day verification deadline computation). BLOCKED-EXTERNAL remainder: attorney review of MA/RI/NH whistleblower-protection landscape. DEFERRED remainder: Tor-compatibility formal verification (per user instruction).
- **#31 (Commercial property):** partly SHIPPED (report subtype types, aggregation pipeline, chain database seed with 40 chains, Title III standards dataset with 5 standards). BUILDABLE remainder: right-of-reply pipeline (shared with #27); reporter-reputation tracking; competitive-reporter enhanced-review flag. BLOCKED-EXTERNAL remainder: attorney review of reporter-attestation + anti-SLAPP language.

**How to consume the honest gating table:** anything below marked "SHIPPED (partial)" has code in `src/services/` you can inspect and integrate. Anything marked "BLOCKED-EXTERNAL" needs a check to a lawyer or a signed pilot agreement. Anything marked "BUILDABLE-TODAY" is next-up engineering work.

---

## 1. Google Analytics — Replace Placeholder Measurement ID

**Status:** Script installed on all 7 website pages with placeholder `G-XXXXXXXXXX`
**What's needed:** A GA4 property and its Measurement ID
**Steps:**
1. Go to [analytics.google.com](https://analytics.google.com) and create a GA4 property
2. Copy the Measurement ID (format: `G-XXXXXXXXXX`)
3. Find-and-replace `G-XXXXXXXXXX` across all files in `website/`

---

## 2. AdSense — Add Auto-Ad Script to Pages

**Status:** `ads.txt` is live at `moonligh7er.github.io/ads.txt` with the correct publisher ID `pub-1548397763792213`. CSP headers already allow AdSense scripts.
**What's needed:** AdSense account approval, then add the auto-ad script
**Steps:**
1. Once AdSense approves the site, add to each page's `<head>`:
   ```html
   <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1548397763792213" crossorigin="anonymous"></script>
   ```
2. Optionally add manual ad unit `<ins>` tags for specific placements
3. Review [AdSense program policies](https://support.google.com/adsense/answer/48182) before going live

---

## 3. AdMob — Replace Placeholder Ad Unit IDs

**Status:** `react-native-google-mobile-ads` installed, `AdBanner.tsx` wired up with real SDK, shows test ads in dev mode, returns null in production when IDs contain `xxxx`
**What's needed:** An AdMob account with app registrations and banner ad unit IDs
**Steps:**
1. Create account at [admob.google.com](https://admob.google.com)
2. Register Android and iOS apps
3. Create banner ad units for each platform
4. Update `.env`:
   ```
   ADMOB_APP_ID_ANDROID=ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY
   ADMOB_APP_ID_IOS=ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY
   ADMOB_BANNER_ID_ANDROID=ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ
   ADMOB_BANNER_ID_IOS=ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ
   ```

---

## 4. OG Social Share Image

**Status:** `og:image` and `twitter:image` meta tags added to all 7 pages pointing to `og-image.png`
**What's needed:** A 1200x630px social share image
**Steps:**
1. Design a branded 1200x630px image (app name, tagline, visual)
2. Save as `website/og-image.png`
3. Test with [opengraph.xyz](https://opengraph.xyz) or Twitter Card Validator

---

## 5. Apple App Store Credentials

**Status:** `eas.json` has placeholders: `YOUR_APPLE_ID`, `YOUR_ASC_APP_ID`, `YOUR_TEAM_ID`
**What's needed:** Apple Developer Program membership ($99/yr)
**Steps:**
1. Enroll at [developer.apple.com](https://developer.apple.com)
2. Create an App Store Connect app
3. Update `eas.json` → `submit.production.ios` with:
   - `appleId`: your Apple ID email
   - `ascAppId`: the App Store Connect app ID
   - `appleTeamId`: your team ID

---

## 6. App Store Download URLs

**Status:** Download buttons on `index.html` link to `#download` (placeholder)
**What's needed:** Published apps on Google Play and Apple App Store
**Steps:**
1. Build and submit via EAS: `npx eas build --platform all --profile production`
2. Publish to stores
3. Replace the two `<a href="#"` buttons in the CTA section of `index.html` with real store URLs

---

## 7. Sentry Crash Reporting

**Status:** `@sentry/react-native` installed, crash reporting service built, `.env.example` has placeholder. `sentry-cli` is installed locally but not authenticated.
**What's needed:** Interactive login, then project creation
**Steps:**
1. Run in terminal: `npx sentry-cli login` (opens browser for auth)
2. Run: `npx sentry-cli projects create --org YOUR_ORG -n faultline-mobile --platform react-native`
3. Copy the DSN and add to `.env`:
   ```
   SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
   SENTRY_ORG=your-org
   SENTRY_PROJECT=faultline-mobile
   ```

---

## 8. Domain & Email

**Status:** All canonical URLs point to `fault-line.dev/`. Contact emails use `faultline.app` domain.
**What's needed:** A purchased domain
**Steps:**
1. Buy domain (fault-line.dev (purchased 2026-05-06))
2. Point DNS to hosting (GitHub Pages, Vercel, or Netlify)
3. Find-and-replace `fault-line.dev` with your domain across `website/`, `robots.txt`, `sitemap.xml`
4. Configure email (Resend or similar) for hello@, privacy@, legal@ addresses
5. Update `robots.txt` and `sitemap.xml` with new domain

---

## 9. Supabase Edge Function Secrets

**Status:** ✅ DONE as of 2026-04-20. All required secrets set:
- ✅ `ANTHROPIC_API_KEY`
- ✅ `RESEND_API_KEY`
- ✅ `CRON_SECRET`
- ✅ `FROM_EMAIL=onboarding@resend.dev` (Resend's test sender — works without domain verification)
- ✅ `REPLY_TO=moonlit-social-labs@proton.me` (replies route to Michael's inbox)

Edge functions updated to include `reply_to` header and redeployed.

**Still needed:**
- ✅ DONE 2026-04-20: Daily cron scheduled via `pg_cron` (migration 009). Runs at 14:00 UTC (10:00 AM Eastern). Job name: `escalate-clusters-daily`. Enabled `pg_cron` + `pg_net` extensions. `CRON_SECRET` rotated to a fresh value, set in Supabase secrets, and embedded in the cron job header.

---

## 9b. Buy a Domain and Verify in Resend (HARD BLOCKER — not just credibility)

**Status:** 🔴 **HARD BLOCKER for every email escalation.** Confirmed 2026-04-21 via live E2E test.

**What the E2E test found:** The escalation pipeline works perfectly — cron fires, dispatcher picks the right method, Supabase writes the escalation_log row, Resend API is called correctly. BUT Resend rejects every send to any recipient other than the account owner (`moonligh7er@gmail.com`) with HTTP 403 and the message:

> *"You can only send testing emails to your own email address (moonligh7er@gmail.com). To send emails to other recipients, please verify a domain at resend.com/domains, and change the `from` address to an email using this domain."*

This is Resend's sandbox mode. It's the default for unverified accounts. Until a domain is verified in Resend, NONE of the 36 authorities with verified emails across New England can actually receive escalation emails. The code is ready; the account isn't.

**Not a blocker for API-based authorities** (Boston Open311, Cambridge/New Haven/Danbury/Portland ME SeeClickFix). Those 5 post directly to the city systems and don't route through Resend.

**Cost:** ~$12-15/year for the domain. Resend verification is free.

**Steps:**
1. Buy `faultline.app` (or `.org`, `.dev`, `.io`) at Namecheap, Porkbun, or Cloudflare Registrar
2. Log in to Resend → Domains → Add Domain → enter your domain
3. Resend gives you 3 DNS records (SPF TXT, DKIM TXT, return-path CNAME) — add them to your DNS provider
4. Wait 5-15 min → click "Verify" in Resend → green checkmark
5. Update Supabase secrets: `npx supabase secrets set FROM_EMAIL=reports@fault-line.dev --project-ref dzewklljiksyivsfpunt`
6. (No redeploy needed — functions pick up new secret on next invocation)
7. Update canonical URLs across website pages (find-and-replace `fault-line.dev` → your new domain)

---

## 9c. Register the Resend Webhook (bounce/delivery tracking)

**Status:** Code shipped, needs 2-minute click-through in the Resend dashboard.

**Why:** The Next.js route `/api/webhooks/resend` is live and will record delivery / bounce / complaint events against `escalation_log` rows + auto-flag authorities whose email has gone dead. But Resend won't fire events anywhere until you register the webhook URL in their dashboard.

**Steps:**
1. Log in to [resend.com/webhooks](https://resend.com/webhooks)
2. Click **Add Webhook**
3. **Endpoint URL:** `https://fault-line-web.vercel.app/api/webhooks/resend`
4. **Events:** tick `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`
5. Save → Resend shows you a signing secret starting with `whsec_`
6. Copy that secret into Vercel: `fault-line-web` → Settings → Environment Variables → add `RESEND_WEBHOOK_SECRET = whsec_...` for Production (and Preview if you want)
7. Redeploy fault-line-web (or just wait for next push)

**Verification:** After a real escalation fires, the `escalation_log` row for it should have `delivered_at` set (or `bounced_at` if the city email was bad). Authority `email_health` column updates to `soft_bouncing` / `hard_bouncing` on bounces.

---

## 9d. Deploy the Modal Browser-Automation Worker

**Status:** Code shipped at `modal/web_form_submitter/main.py`. Not yet deployed.

**Why:** This worker fills city web forms headlessly (Playwright + Chromium). When `escalate-clusters` falls through to `web_form` method and `WEB_FORM_WORKER_URL` is set, it POSTs to the worker — if the worker succeeds, the cluster is marked `web_form_auto:<adapter>` instead of `web_form_manual`. Lights up ~14 more New England authorities that would otherwise need manual follow-up (CivicPlus covers most of them).

**Steps:**
1. Install the Modal CLI locally (one-time, if not already): `pip install modal && modal setup`
2. `cd Fault-Line/modal/web_form_submitter`
3. Generate a worker secret (random 32-byte base64): `openssl rand -base64 32`
4. Register it with Modal: `modal secret create fault-line-web-form-worker WEB_FORM_WORKER_SECRET=<the-random-string>`
5. Deploy: `modal deploy main.py`
6. Modal prints the endpoint URL — something like `https://moons7onr--fault-line-web-form-submitter-submit.modal.run`
7. Set both secrets in Supabase so `escalate-clusters` can call the worker:
   ```
   npx supabase secrets set \
     WEB_FORM_WORKER_URL=https://moons7onr--fault-line-web-form-submitter-submit.modal.run \
     WEB_FORM_WORKER_SECRET=<the-same-random-string> \
     --project-ref dzewklljiksyivsfpunt
   ```
8. Test with a real web_form authority cluster (or a dry run curl against the Modal endpoint with a simple form URL)

**Known limits:**
- Current adapters cover CivicPlus (dominant CMS), SeeClickFix embedded forms, and a generic heuristic fallback. Granicus and custom city portals may need per-site adapters added over time.
- The worker checks for "thank you" / "received" / "submitted" text in the response — a pessimistic heuristic that catches most successful submissions but will mark some real successes as failures when a city uses nonstandard wording. Those land in the manual queue, not lost.
- Cost: ~$0.002 per submission (Modal billed per execution-second; avg run is 15-20s).

---

## 9e. Open311 City Expansion (Tier 2 — per-city endpoint research)

**Status (2026-04-21 update):** Research pass complete. The Tier 2 hypothesis ("dozens of major US cities have their own standalone Open311 endpoints") did not survive contact with reality. Of the 30-city target list plus follow-ups in MA/CO/OR/CT/RI/NH/NM/FL:

- **One** confirmed live standalone Open311 endpoint: **Boston** (`https://mayors24.cityofboston.gov/open311/v2/`, jurisdiction_id=`boston.gov`, API key required for POST). Already seeded in DB.
- **Majority** of "has_open311: yes" cities (MA Commonwealth Connect members, CT/NH/NM trio, Eugene OR) actually route through SeeClickFix's aggregate Open311 endpoint — already covered by our SCF routing. New rows for the ones the scraper missed shipped in Migration 014.
- **Proprietary / no API** (no seed possible): Chicago (CHI311), SF (SF311), Seattle (Find It Fix It), Austin 3-1-1, Philly (PublicStuff), Denver/Colorado Springs/Boulder/Aurora CO, Portland OR (PDX Reporter, historical endpoint dead), Salem/Gresham/Hillsboro OR, Somerville MA (QScend), Providence RI, Tampa FL — reachable only via email fallback or future web-form scraping.

**Remaining Open311-specific work:** Request API keys from Boston (to enable POST), probe historical endpoints (pdxreporter.org, 311api.cityoforlando.net) at runtime in case they're still alive. ~1-2 hrs.

---

## 9f. Missing Big-City SeeClickFix Seed (dormant-flagged cities) — RESOLVED 2026-04-21

**Original concern:** Migration 013's scraper of `seeclickfix.com/recent_place_stats` might have missed big cities that use SCF via `web_portal/<hash>` URLs instead of short slugs.

**Investigation outcome:** Of the 8 cities flagged (Chicago, SF, Seattle, Austin, Houston, Ann Arbor, Philly, Minneapolis):
- **Already had SCF rows** from Migration 013 (scraper did catch them): Houston TX, Ann Arbor MI, Minneapolis MN, Albuquerque NM, Orlando FL.
- **Confirmed NOT using SCF** (proprietary 311): Chicago, San Francisco, Seattle, Austin, Philadelphia — do not seed.
- **Additional SCF-backed cities found missing** (scraper gap confirmed and filled via Migration 014): Hartford / Stamford / Waterbury CT; Lowell / New Bedford / Quincy / Springfield MA; Santa Fe / Las Cruces / Rio Rancho NM; Eugene OR. 11 INSERTs applied.

Boundaries for the 11 new rows will be populated by the next `enrich-authority-boundaries` run.

---

## 9g. Census Boundary Coverage Gap (Tier 3 remainder)

**Status:** 584 of 784 authorities have boundaries via Migration 013 + enrich-authority-boundaries (Layers 28/22/34). The remaining 193 SeeClickFix-origin rows that Census couldn't match have been **deactivated** (`is_active = false`) as of 2026-04-21 to keep routing and admin UIs clean. They are preserved (not deleted) for future recovery.

**The 193 deactivated rows are a mix of:**
- Unincorporated neighborhoods / SeeClickFix watch-areas that aren't real municipal authorities (Catalina Foothills, Flowing Wells, Drexel Heights, etc. — Tucson-area CDPs; Sterling Ranch CAB — an HOA; Hamden_Feature 001 — a SeeClickFix internal tag)
- Real CDPs whose name didn't exact-match Census BASENAME (Sun City, Green Valley, Casas Adobes — valid places, just naming-fuzzy)
- Name encoding issues (Cañon City with mangled ñ, parenthetical aliases like "El Paso de Robles (Paso Robles)")

**To restore coverage for the real-CDP subset (~50-74 rows estimated), three fixes:**

1. **Fuzzy match pass** — retry with `ILIKE '${name}%'`, Unicode normalization, and `St.` ↔ `Saint` / `N.` ↔ `North` alias substitution. Would recover most Category-2 real CDPs. Runs against `is_active = false AND boundary_checked_at IS NOT NULL` rows, auto-reactivates on match. ~1-2 hrs.

2. **Manual alias table** — seed known overrides for encoding-damaged names (Cañon City → "Canon City" Census name, El Paso de Robles → "Paso Robles"). ~50 entries, ongoing maintenance.

3. **Geocode-and-buffer fallback** — when no Census polygon exists, geocode the city via Census Geocoder API (already in pinned-fetch allowlist) and buffer by ~3 miles to create a loose polygon. Enables routing even for tiny unincorporated places. ~1-2 hrs.

**Reactivation script** (when fixes ship):
```sql
-- Safe reversal of the 2026-04-21 deactivation
UPDATE authorities SET is_active = true
WHERE is_active = false AND name LIKE '% (SeeClickFix)';
```

**Effort:** 1-2 hours to ship #1 and #3. #2 is ongoing.

---

## 9h. PostGIS `spatial_ref_sys` Privilege Hardening — RESOLVED 2026-05-06

**Status:** Supabase relocated the PostGIS extension to the `extensions` schema. All 5 verification checks passed:

| Check | Result |
|---|---|
| Extension schema | `extensions` ✓ |
| `spatial_ref_sys` schema | `extensions` ✓ |
| `ST_MakePoint` resolves via search_path | ✓ |
| `find_authority_by_point(42.3601, -71.0589)` | returns Boston 311 ✓ |
| Advisor PostGIS lints | both cleared ✓ |

The relocation surfaced 4 unrelated SECURITY DEFINER lints (`handle_new_user`, `rls_auto_enable` callable as anon/authenticated via RPC). Migration 017 revoked EXECUTE — trigger invocation paths unaffected. Net advisor state: 3 lints, all intentional (`submission_log` audit table, `ai_cache` + `feedback` permissive INSERT).

**Why this is better than the original ask (revoke privileges):**
- Removes `spatial_ref_sys` from `public` schema entirely → no longer exposed to PostgREST → write-attack path is *structurally* impossible, not just policy-blocked
- Clears both lints in one action: `rls_disabled_in_public on spatial_ref_sys` (ERROR) AND `extension_in_public on postgis` (WARN)
- Aligns with Supabase's own recommended posture for PostGIS

**Why we couldn't do it ourselves:**
Same ownership issue as the privilege fix — `ALTER EXTENSION postgis SET SCHEMA extensions` requires the extension owner (`supabase_admin`), which we don't have. PostGIS is also marked non-relocatable (`extrelocatable=false`) by default; the relocation SQL flips this temporarily, ALTERs the schema, then flips it back.

**The SQL Supabase will run:**
```sql
BEGIN;
UPDATE pg_extension SET extrelocatable = true WHERE extname = 'postgis';
ALTER EXTENSION postgis SET SCHEMA extensions;
ALTER EXTENSION postgis UPDATE TO "3.3.7next";  -- matches existing version
ALTER EXTENSION postgis UPDATE;
UPDATE pg_extension SET extrelocatable = false WHERE extname = 'postgis';
COMMIT;
```

No data loss — relocation only, no `DROP EXTENSION`. Existing `boundary_geojson` (jsonb) data on `authorities` and any geometry on `reports` / `clusters` stays put.

**Why our code already works post-relocation:**
Migration 016 pinned `search_path = public, extensions` on all 17 PostGIS-using functions (`find_authority_by_point`, `set_report_point`, `set_cluster_point`, `assign_report_to_cluster`, etc.). Verified via `pg_proc.proconfig` — only outlier is `rls_auto_enable` which uses `pg_catalog` only and doesn't touch PostGIS.

**Post-relocation verification checklist:**

1. Confirm the move:
   ```sql
   SELECT extname, n.nspname AS schema FROM pg_extension e
   JOIN pg_namespace n ON n.oid = e.extnamespace WHERE extname = 'postgis';
   -- expect: schema = 'extensions'
   ```
2. `spatial_ref_sys` moved with it:
   ```sql
   SELECT schemaname FROM pg_tables WHERE tablename = 'spatial_ref_sys';
   -- expect: 'extensions'
   ```
3. PostGIS still usable via search_path:
   ```sql
   SELECT ST_AsGeoJSON(ST_MakePoint(0,0));
   ```
4. Real boundary lookup still works:
   ```sql
   SELECT * FROM find_authority_by_point(42.3601, -71.0589);
   -- expect: Boston row (or whatever covers that point)
   ```
5. Re-run advisor (`mcp call get_advisors security`) — the two PostGIS lints should both be gone, leaving only the intentional ones (`submission_log` audit table, `ai_cache` + `feedback` permissive INSERT).

---

## 10. Supabase Migration 007 — Apply RPC Auth Guards

**Status:** Migration file created at `supabase/migration_007_rpc_auth_guards.sql`
**What's needed:** Run in Supabase SQL Editor
**Steps:**
1. Open Supabase Dashboard → SQL Editor
2. Paste and run `migration_007_rpc_auth_guards.sql`
3. Verify `increment_upvote` and `increment_confirm` now require authentication

---

## 11. Submit to Search Engines

**Steps:**
1. Submit sitemap to [Google Search Console](https://search.google.com/search-console)
2. Submit sitemap to [Bing Webmaster Tools](https://www.bing.com/webmasters)
3. Do this after domain is purchased and DNS is configured

---

## 12. EAS Project ID

**Status:** Referenced in `app.config.js` with empty default. EAS CLI is not installed.
**What's needed:** Install EAS CLI and authenticate
**Steps:**
1. Run in terminal: `npm install -g eas-cli`
2. Run: `eas login` (interactive auth)
3. Run: `eas init` (in the project root)
4. Copy the project ID to `.env`:
   ```
   EAS_PROJECT_ID=your-project-id
   ```

---

## 13. Web App Version

**Status:** Expo web support is technically available (`npm run web`), but several native-only dependencies need handling before it's viable.
**Blockers to resolve:**
- `react-native-maps` — no web support, needs a swap to `react-leaflet` or Google Maps JS SDK on web
- `react-native-google-mobile-ads` — no web support, needs web ad alternative (AdSense) on web
- `expo-camera` / `expo-sensors` / `expo-speech-recognition` — partial or no web support, needs graceful fallbacks
- `expo-secure-store` — no web support, falls back to AsyncStorage automatically (fine)

**Approach when ready:**
1. Add `"web"` platform to `app.config.js`
2. Use `Platform.OS === 'web'` guards or separate web components for incompatible features
3. Deploy web build via Vercel or Netlify: `npx expo export --platform web`
4. Consider hosting at a subdomain (e.g., `app.faultline.app`) separate from the marketing site

---

## 14. Fault Line Web App — External Setup

**Status:** Next.js 15 web app fully built in sibling directory `../fault-line-web/`. Production build passes, all phases complete. Security hardened (CSP nonces, httpOnly cookies, CSRF guard, rate limiting, magic-byte upload validation, RLS-first).
**What's needed:** Three external services + environment values. Each is free to start.

**Steps:**

1. **Supabase env values** — web app currently has placeholder `.env.example`. Copy real values into `fault-line-web/.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://dzewklljiksyivsfpunt.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<same publishable key as mobile .env>
   SUPABASE_SERVICE_ROLE_KEY=<from Supabase Dashboard → Project Settings → API>
   ```
   Also create a `report-photos` Storage bucket in Supabase Dashboard if it doesn't exist yet, with policies allowing authenticated users to upload to `auth.uid()/*`.

2. **Upstash Redis** (rate limiting — free tier fine):
   1. Sign up at [upstash.com](https://upstash.com)
   2. Create a Redis database (global, REST-enabled)
   3. Copy the REST URL + token into `fault-line-web/.env.local`:
      ```
      UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
      UPSTASH_REDIS_REST_TOKEN=xxx
      ```
   The client code in `src/lib/rate-limit.ts` already handles this; it fails-open in dev and fails-closed in prod when unconfigured.

3. **Sentry** (error monitoring — free tier up to 5K events/mo):
   1. Sign up at [sentry.io](https://sentry.io)
   2. Create a new Next.js project
   3. Copy the DSN and create a Sentry auth token (Organization Settings → Auth Tokens)
   4. Add to `fault-line-web/.env.local`:
      ```
      NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
      SENTRY_ORG=your-org
      SENTRY_PROJECT=fault-line-web
      SENTRY_AUTH_TOKEN=sntrys_xxx
      ```
   The config files (`sentry.*.config.ts`, `src/instrumentation.ts`) are already in place. Source map uploads auto-enable when `SENTRY_AUTH_TOKEN` is set.

4. **Vercel deployment**:
   1. Push `fault-line-web/` to its own GitHub repo (e.g. `fault-line-web`)
   2. Go to [vercel.com/new](https://vercel.com/new) and import the repo
   3. Framework preset: Next.js (auto-detected)
   4. Add all env vars from `.env.example` in Project Settings → Environment Variables
   5. Deploy. Vercel auto-assigns a `*.vercel.app` URL with HTTPS
   6. `vercel.json` already contains safe defaults (security headers, region pinning)

5. **Custom domain** (optional — recommended `app.faultline.app` once you own `faultline.app`):
   1. Vercel Project → Settings → Domains → Add
   2. Point DNS CNAME to `cname.vercel-dns.com`
   3. Update `NEXT_PUBLIC_APP_ORIGIN` env var to match
   4. Vercel auto-issues SSL and adds the domain to HSTS preload

---

## 15. Ad-Free Paid Tier — Feature Flag Scaffold (RevenueCat + Stripe)

**Status:** Not started. App is currently free with AdMob ads only.
**Decision:** User chose "scaffold behind a feature flag" — build all the infrastructure but keep a feature flag returning `false` until ready to launch. App ships as free; flip the flag when stores approve.
**What's needed:** App Store + Play Store app registrations (item #5/#6), then RevenueCat + Stripe setup
**Steps (mobile — RevenueCat):**
1. Complete items #5 and #6 first (Apple credentials + store submissions)
2. Create a RevenueCat account at [revenuecat.com](https://www.revenuecat.com)
3. Create an "Ad-Free" subscription product in App Store Connect and Google Play Console ($2.99/mo or $19.99/yr)
4. Install SDK: `npx expo install react-native-purchases`
5. Add `react-native-purchases` to `app.config.js` plugins
6. Create `src/services/purchases.ts` — initialize SDK, expose `isAdFree()` check + `AD_FREE_ENABLED` feature flag (defaults to `false`)
7. In `AdBanner.tsx`, gate rendering on `!isAdFree()`
8. Add a "Remove Ads" button to `ProfileScreen.tsx` that triggers the purchase flow (hidden when flag is false)
9. Add RevenueCat API keys to `.env`:
   ```
   REVENUECAT_API_KEY_ANDROID=your_key
   REVENUECAT_API_KEY_IOS=your_key
   ```

**Steps (web — Stripe):**
1. Create a Stripe account and product ($2.99/mo recurring)
2. Install `stripe` and `@stripe/stripe-js` in `fault-line-web`
3. Create `/api/stripe/checkout` route (create Checkout Session) + `/api/stripe/webhook` route (handle subscription events, store entitlement in Supabase profiles table)
4. Create `/pricing` page with plan comparison + Stripe checkout button
5. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to `.env.example`
6. Gate ad display (once AdSense is wired) on `!isAdFree()` check against Supabase profile
7. Feature flag: set `AD_FREE_ENABLED=false` in env, all entitlement checks short-circuit to `false`

---

## 16. Next.js Web App — Update About / Privacy / Terms Attribution

**Status:** ✅ DONE. All three routes updated with Moonlit Social Labs attribution, correct contact email, expanded content matching marketing-site depth.

---

## 17. Replace Google Analytics Placeholder (GA4)

**Status:** The measurement ID `G-XXXXXXXXXX` is on all 7 marketing pages and in `.env.example` for the Next.js app.
**What's needed:** Create a GA4 property at [analytics.google.com](https://analytics.google.com), copy the measurement ID (format: `G-XXXXXXXXXX`).
**Steps:**
1. Create GA4 property → copy Measurement ID
2. Find-and-replace `G-XXXXXXXXXX` in all files under `website/` (7 files + features-plain.html + landing.html)
3. Set `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-YOURVALUE` in `fault-line-web/.env.local`

---

## 18. Create OG Social Share Image

**Status:** `og:image` and `twitter:image` meta tags point to `og-image.png` on all pages. Current file is a placeholder.
**What's needed:** A branded 1200×630px social-share image.
**Steps:**
1. Design (or AI-generate) a 1200×630 image showing app name, tagline, visual
2. Save as `website/og-image.png`
3. Test with [opengraph.xyz](https://opengraph.xyz) or Twitter Card Validator

---

## 19. App Store Paperwork & Screenshots

**Status:** Templates exist in `store-metadata/` (description.md, google-data-safety.md, content-rating.md, apple-privacy-labels.md). Actual screenshots and store submissions require a running app on real devices.
**Steps:**
1. Build the app: `npx eas build --platform all --profile preview`
2. Run on device/simulator, take 8 screenshots per `store-metadata/description.md` spec
3. Fill out Google Play Data Safety form using `google-data-safety.md`
4. Fill out Apple Privacy Labels using `apple-privacy-labels.md`
5. Complete Content Rating questionnaire using `content-rating.md`

---

## 20. Eliminate `website/` ↔ root mirror — switch GH Pages to `/docs`

**Status:** The marketing site currently lives in **two places** in this repo: `website/<file>` (canonical) and `<file>` at repo root (mirror). This was a workaround when GitHub Pages was 404-ing because GH Pages free tier serves from repo root or `/docs`, not arbitrary subdirectories like `/website`.

**Cost of current setup:**
- ~50 MB of binary duplication (every PNG in `og/`, `blog-heroes/`, `social/`, `twitch/` plus `og-image.png` is stored twice)
- Every edit to `website/*.html` must be mirrored to `*.html` at root or the deploy goes stale
- Easy to forget; introduces a class of "I changed it, why isn't it live" bugs (already saved to memory as `feedback_website_root_mirror.md`)

**The fix:**
1. Rename `website/` → `docs/`:
   ```bash
   git mv website docs
   ```
2. Update any internal references that say `website/` (check `scripts/`, root HTML) — most use relative paths so this is light.
3. Delete the root duplicates:
   ```bash
   rm about.html blog.html features.html features-plain.html feedback.html index.html landing.html privacy.html terms.html theme.css og-image.png robots.txt sitemap.xml CNAME ads.txt
   rm -rf og/ blog-heroes/ social/ twitch/
   ```
4. GitHub repo → Settings → Pages → Source: change from `master / (root)` to `master / /docs`. Save. Wait ~1 min for rebuild.
5. Verify: `curl -sI https://fault-line.dev/` returns 200. Spot-check a blog hero image.

**Effort:** ~10 minutes. Halves repo size, eliminates the dual-write tax permanently.

**Why deferred:** Not blocking anything; current setup works. Worth doing on a quiet day before next round of marketing-site edits.

---

## 21. Move `CRON_SECRET` from inline pg_cron literal → Supabase Vault

**Status:** Currently the cron secret is duplicated in two places that must stay in sync:
1. Supabase Edge Function secrets (where `Deno.env.get('CRON_SECRET')` resolves) — used by the function to validate the `x-cron-secret` header.
2. **As a literal string inside the `pg_cron` job's `command` SQL** — anyone with `SELECT` on `cron.job` can read it.

**Verify the leak:**
```sql
SELECT command FROM cron.job WHERE jobname = 'escalate-clusters-daily';
-- → command contains x-cron-secret literal value 'ww52+zdtNkTY50LZaddmGG4JDso5uuFZUECUJxrdHNY=' in clear text
```

**The cleaner pattern:** Store the secret in Supabase Vault (encrypted at rest, only readable via `vault.decrypted_secrets` view that decrypts on demand and respects RLS). pg_cron reads it at execution time instead of having it embedded.

**Migration sketch:**
```sql
-- Step 1: stash the secret in Vault. Returns a UUID id; name is human-readable lookup key.
SELECT vault.create_secret(
  'ww52+zdtNkTY50LZaddmGG4JDso5uuFZUECUJxrdHNY=',
  'cron_secret',
  'Shared secret for authenticating pg_cron → Edge Function calls'
);

-- Step 2: rewrite the cron command to read from Vault at runtime instead of using a literal.
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'escalate-clusters-daily'),
  command := $cmd$
    SELECT net.http_post(
      url := 'https://dzewklljiksyivsfpunt.supabase.co/functions/v1/escalate-clusters',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cmd$
);

-- Step 3: same for sync-open311-statuses-hourly (jobid 2).

-- Step 4: confirm — re-querying cron.job's command field should now show
-- the Vault SELECT instead of the literal secret.
```

**After the migration, rotation becomes:**
1. Update the Vault entry value (one place).
2. Update the Supabase Edge Function `CRON_SECRET` env to match (the other place).
3. No `cron.alter_job` calls needed — the command always pulls fresh from Vault.

**Pros:**
- pg_cron's `command` field no longer leaks the secret to anyone with `SELECT` on `cron.job`
- Audit trail via Vault read access logs
- Rotation is two updates, not three (no SQL on the cron jobs themselves)

**Cons:**
- One extra abstraction layer
- Slightly slower (Vault decryption per cron firing — negligible)

**Effort:** 30 minutes including migration file + test fire to confirm both cron jobs still reach the edge functions.

**Why deferred:** Current setup works and only `postgres` role can read `cron.job` (not anon/authenticated/PUBLIC), so the leak is theoretical for now. But the Vault pattern is the recommended Supabase posture and worth converging on before the team grows beyond solo.

---

## 22. Legal Review of Statute Dataset (HARM VECTOR)

**Status:** All three shipping states (MA, RI, NH) sit at `verificationStatus: 'pending-review'` in `src/services/statutes/dataset.ts`. The letter generator now prepends a prominent **⚠ UNREVIEWED LEGAL CONTENT** banner to every letter and appends a chain-of-custody disclaimer (statute + version + review status), so users are honestly warned — but a wrong `noticePeriodDays` can still cost a real user their claim.

**What's needed:** A qualified reviewer (attorney admitted in the state, or a legal researcher with documented municipal-liability experience — a software engineer or AI does not qualify) to work through each record against primary sources.

**Full review protocol:** `src/services/statutes/README.md` — the promotion checklist to flip `pending-review` → `verified`.

**Priority order (per README):**
1. **MA** — 30-day window; property-vs-personal-injury distinction is the main audit point. Highest volume, shortest window, most consequential to get wrong.
2. **NH** — the $50,000 statutory cap needs current-year confirmation.
3. **RI** — clerk-of-record delivery is the main audit point.

**When each state clears review, update:**
1. Flip `verificationStatus: 'verified'`
2. Fill `verifiedBy`, `verifiedAt`, `nextReviewAt` (default `verifiedAt + 12 months`)
3. Add / update `sources[]` with the primary-source URLs the reviewer actually consulted
4. Bump the record's `version` in `dataset.ts`
5. Add a line to `src/services/statutes/CHANGELOG.md`

**Cost:** ~2-4 hours of qualified legal review per state; ~$400-800 total for a solo consulting attorney at typical civic-tech rates. Grant-fundable line item.

**Why deferred:** The engineering scaffolding is done — the dataset is structured, versioned, versioning propagates to the letter output, and the unreviewed banner protects users in the interim. This is purely a "hire a lawyer" step.

---

## 23. Verify Open311 / SeeClickFix Integration Claims End-to-End Per Authority

**Status:** The marketing site (`features.html`, `landing.html`, `cities.html`) advertises "Open311 integration" and "SeeClickFix integration" as capabilities. The routing infrastructure exists (Migrations 013 / 014 seeded 795 authorities with `open311_endpoint` or `seeclickfix_place_id` metadata), but the end-to-end flow — Fault Line report → authority's actual ticketing system → resident sees a status update flow back — has not been verified per-authority except for Boston Open311 (which itself needs a POST API key to activate; see DEFERRED #9e).

**Why this matters:** Municipal buyers on the `/cities` page will test integration claims first. If a public works director tries a demo report against their city's SeeClickFix and it doesn't land as a ticket in their existing dashboard, the credibility hit is disproportionate — they'll assume nothing else works either.

**What's needed:** A per-authority integration test matrix. Suggested cadence:
1. **Pilot cities first.** Before scheduling a demo per `cities.html`, run a scripted end-to-end test that files a low-severity report against that authority and verifies the round-trip: (a) escalation pipeline picked the right method, (b) authority's system accepted it, (c) status change on their side reflects back in Fault Line.
2. **Boston Open311.** Request the POST API key (already flagged in DEFERRED #9e). Until we have the key, the marketing copy should say "Open311 read-only" for Boston, not "integration."
3. **SeeClickFix aggregate endpoint.** Verify against 3–5 cities across CT / MA / NM / OR. Document per-city quirks in a `docs/integration-status.md` table.
4. **QScend cities (Salem OR / Somerville MA / Gresham OR / Hillsboro OR).** These require adapter code in `modal/web_form_submitter/`; verify the adapter succeeds for each before advertising.

**Effort:** ~15–30 minutes per authority. First pass ~4 hours for the top 10 pilot targets.

**Why deferred:** No pilot city has requested a demo yet. This becomes urgent the day a public works director asks "does it actually work against our 311?" — at which point being able to answer "yes, we tested it last week, here's the log" is the difference between a signed pilot and a lost lead.

---

## 24. Rapid Response Roll — Underlying Data Model & Computation

**Status:** Design + public methodology page shipped at `rapid-response.html` (2026-08-30). The page publicly commits the eligibility criteria, minimum-data thresholds, ranking weights, and non-gaming guardrails. **No live listings yet** — the data model to detect and rank rapid responses does not exist in the current schema.

**What's needed:** Three engineering prereqs, in dependency order.

### 1. Extend `escalation_log` (or add a `resolutions` table) with resolution-event fields

Every "this got fixed" event needs a structured row with:
- `resolved_at` (timestamp)
- `resolution_source` — enum: `community_repeat_photo` | `authority_ticket_status` | `both`. Authority self-attestation alone is not sufficient for Roll eligibility per methodology §2.
- `verified_by_reporter_ids` (array of resident user IDs who submitted repeat-photo verification)
- `responsible_department_slug` — normalized department identifier, joins to a new `departments` table (per-city crew mappings, populated during pilot-city onboarding)
- `reopen_check_scheduled_at` — 180-day timer. If the same cluster/GPS reopens within that window, `resolution_durable = false`.
- `severity_at_escalation` — snapshot of the highest-severity report in the cluster at escalation time (source of truth for eligibility — not authority reclassification, per methodology §8).

Migration sketch: `supabase/migration_018_resolution_events.sql`.

### 2. Ship community re-photo verification in the app

The current app has a "before/after photo" concept in the feature grid but no first-class verification flow. What's needed:
- When a report enters "authority claims resolved" state, nearby users get a proximity-aware notification: "A hazard you're near was just marked fixed. Confirm?"
- Photo submission at the same GPS (within 20 m) with categorization: `confirmed_fixed` | `still_present` | `worse` | `different_hazard`.
- Two `confirmed_fixed` re-photos from distinct reporters is the durability threshold.
- One `still_present` or `worse` re-photo reopens the report and drops any Roll eligibility for that resolution event.

### 3. One pilot city's department/crew jurisdictional mapping

The Roll needs to attribute resolutions to specific departments (Cambridge DPW → East Cambridge crew, etc.), not just to a city. Cities have this data internally (work-order systems assign tickets to crews) but do not publish it in a standardized way. Getting one pilot city to share this mapping during onboarding — even as a static JSON we manually maintain — is the unlock.

### Computation and publication schedule

- **Nightly:** recompute `resolution_events` for the trailing 90-day window; check reopen timers; update department-level medians.
- **Weekly:** publish the Roll (dampens single-week noise; matches Shame Index cadence per `methodology.html`).
- **On threshold crossing:** first time a department qualifies, fire the notification email to the authority contact of record (per methodology §7) — this is the pilot-city relationship win.

### Effort

Rough estimate: ~1 week of engineering for #1 + #2; #3 is a pilot-city conversation, not engineering. Realistically nothing ships live until a pilot city agrees to the crew mapping — that gates everything else.

### Why deferred

The methodology page is out and immutable. When a public works director asks Fault Line "what does this mean for us?", the answer is now documented and grant-worthy on its own. The engineering can wait until a pilot conversation makes it urgent. Same posture as DEFERRED #23 — build the data plane when there's a real customer to consume it, not before.

---

## 25. Access & Equity Taxonomy — Category Constants, Routing Dataset, Letter Templates

**⚡ SHIPPED (partial, 2026-08-30):** Category constants (`src/constants/categories.ts` + `ReportCategory` type), routing dataset (`src/services/routing/`), and legal-framing letter templates for ADA Title II / Fair Housing + Section 504 / Title VI language / transit ADA (`src/services/legal-templates/`) are live and typecheck clean. Remaining: photo-optional reporting-UI flow (BUILDABLE-TODAY); municipal ADA coordinator contact verification per pilot city (BLOCKED-DATA per pilot).


**Status:** Taxonomy design + public methodology page shipped at `access-equity.html` (2026-08-30). The page publicly commits 32 categories across 6 groups (Physical mobility / ADA · Sensory & cognitive · Age & vulnerability · Housing · Transit · Digital public infrastructure) plus 1 computed aggregation (Environmental justice). Each category is documented with named responsible authority, escalation path, and cited legal framework. **The categories are not yet enabled in the app UI.**

**What's needed:** Four engineering deliverables, in dependency order.

### 1. Extend `src/constants/categories.ts` with the 27 new categories

The current file has 23 physical-infrastructure categories plus `other`. Access & Equity adds ~27 new keys — one per taxonomy row plus the aggregation flag. Each new entry needs:
- `key` (typed enum value, add to `ReportCategory` in `src/types/`)
- `label`, `icon` (MaterialCommunityIcons name)
- `description`
- `severityDimensions` — some access categories don't use `size` (a missing curb cut has no dimensions); most use `hazard` + `urgency`
- `quickReportEnabled` — for the 10-second quick-report grid. Recommend enabling: `missing_curb_cut`, `ada_blocked_path`, `broken_elevator_public_housing`, `missing_crossing_guard`. Everything else lives in the full form.

Also add a new group taxonomy so the reporting UI can visually group them.

### 2. Versioned routing dataset

New file: `src/services/routing/authorities-by-category.ts` (mirrors the pattern already established in `src/services/statutes/`). Structure per entry:
```
{
  categoryKey: 'missing_curb_cut',
  primaryAuthorityType: 'municipal_ada_coordinator',
  escalationAuthorityType: 'state_ada_compliance',
  federalFallback: { agency: 'DOJ Civil Rights', url: 'https://civilrights.justice.gov/report/' },
  legalFramework: { statute: '28 CFR Part 35', url: '...' },
  jurisdictionOverrides: { /* per-state adjustments */ },
  verificationStatus: 'pending-review',
  verifiedBy: null, verifiedAt: null, nextReviewAt: null
}
```

Same chain-of-custody as the statute dataset — every entry starts as `pending-review`, requires a named qualified reviewer (attorney or credentialed civil-rights researcher) to flip to `verified`. Companion `README.md` documenting the review protocol.

Practical seeding: MA / RI / NH pilot states get concrete municipal_ada_coordinator + state_ada_compliance authorities looked up during pilot-city onboarding. Fallback for unmapped jurisdictions is the federal agency (DOJ for ADA Title II, HUD for Fair Housing, EPA for environmental justice).

### 3. Extend letter templates

The current letter generator (`src/services/legalGenerator.ts`) targets state defective-highway statutes. Access & Equity reports need distinct letter templates:
- **ADA Title II notice-of-violation letter** — cites 28 CFR Part 35, program-access requirements, requests remediation within specified timeframe, notes DOJ complaint pathway.
- **Fair Housing / Section 504 letter** — cites FHA + Section 504, applies to public housing categories, notes HUD complaint pathway.
- **Title VI language-access letter** — cites Title VI + EO 13166, applies to federally-funded services, notes agency Civil Rights office.
- **State ADA law letter** — where a state has stronger ADA law than the federal floor (some do), cite the state statute.

Each template gets the same `pending-review` chain of custody as the state defective-highway templates. Unreviewed templates prepend the same banner the current letter engine already does.

### 4. Photo-optional reporting flow

Some Access & Equity categories don't photograph well:
- English-only phone tree (audio evidence, not photo)
- Screen-reader-inaccessible PDF (screenshot of the failure, or a screen-reader output paste)
- Broken city form (browser recording, or a text description of the failure)
- Missing translation on official signage (photo works — this one's fine)

The reporting UI needs an alternate flow: text-first or audio-first submission. Photo remains preferred where possible but is not blocking.

### Effort

Rough estimate: ~2 weeks of engineering for #1 + #2 + #3; #4 is a UI refactor that touches the report submission flow and takes another week. Realistically nothing ships live until at least one pilot city commits to using the taxonomy (same gating dependency as DEFERRED #24) — pilot conversations should surface which categories they most want first, and those get prioritized.

### Why deferred

The taxonomy is out. It's what a public works director, ADA coordinator, transit advocate, or grant reviewer can consult *today*. Engineering the plumbing before there's a pilot city committed to using any of the categories would be building for an imaginary customer. The taxonomy itself is the deliverable that unlocks the pilot conversations. When a pilot city says "we'd use the ADA categories first," we build those first.

### Grant relevance

Access & Equity is directly fundable by equity-focused civic-tech funders (Ford Foundation Civic Engagement, MacArthur Foundation, Rita Allen, Robert Wood Johnson for public-health-adjacent categories). The taxonomy page + one pilot city partnership on ADA categories is a strong Tier A application skeleton on its own. See `GRANTS.md §2` (asset table) and `§4` (funder tiers).

---

## 26. Digital Public Infrastructure — URL-First Reporting Flow & Automated Snapshot

**⚡ SHIPPED (partial, 2026-08-30):** `DigitalReportContext` type on `Report`, `URL_FIRST_CATEGORIES` list, snapshot service scaffold (`src/services/digitalSnapshot.ts` — captureSnapshot() returns a placeholder until the Modal + Playwright worker deploys), `digitalContextForLetter()` producing an EVIDENCE-section block in letters. ADA Title II framing wired via #25 legal-templates. Remaining: Modal + Playwright snapshot worker deployment (BUILDABLE-TODAY); reporting-UI flow that switches to URL-first on category selection (BUILDABLE-TODAY).


**Status:** Public deep-dive page shipped at `digital-infrastructure.html` (2026-08-30). Twelve categories documented with named responsible authorities, legal frameworks, and the DOJ 2024 rule compliance-deadline context. **The URL-first reporting flow needed to submit these reports does not exist in the current app.**

**What's needed:** Four engineering deliverables.

### 1. URL-first reporting flow

The current reporting UI is photo-first (10-second capture flow). Digital-infrastructure reports need an alternate flow:
- Primary input: URL of the broken page + short text description of the failure
- Optional inputs: screenshot, screen-reader/assistive-tech identifier, browser + platform metadata
- No photo required (some failures aren't visually observable — screen-reader traps, invisible keyboard traps, missing alt text on programmatic content)

The report submission form needs a new category-conditional branch: when the user selects a digital-infrastructure category, the UI switches from photo-first to URL-first. Categories that photograph well (missing translation on physical signage) can still use the photo path.

### 2. Automated page-snapshot on submission

When a URL-first report is submitted, a backend worker captures a snapshot of the page state at submission time:
- HTML source
- Screenshot at full-page resolution
- Response headers (indicates server-side language selection, redirects, etc.)
- HTTP status code
- Snapshot timestamp

Snapshots prevent cities from remediating the URL and claiming the report was inaccurate. The evidence is the snapshot, not the current page state.

Implementation approach: extend the existing Modal browser-automation worker (`modal/web_form_submitter/main.py`) with a new `capture_snapshot` endpoint using Playwright. Store snapshots in a new Supabase bucket (`digital-infra-snapshots`, private, signed-URL access for authorized viewers only — reporter, ADA coordinator, DOJ complaint if filed).

### 3. ADA Title II demand-letter template

New template in the letter generator that:
- Cites 28 CFR Part 35 + specific WCAG 2.1 AA success criterion violated
- Includes the URL and the automated snapshot reference
- Cites the applicable compliance deadline (April 2026 for 50k+ entities, April 2027 for smaller)
- Notes the DOJ complaint pathway at civilrights.justice.gov/report/
- Same "not legal advice" + versioned-dataset chain-of-custody footer as physical-infrastructure letters

### 4. Right-sized reporter guidance in the UI

The app should surface WCAG success-criterion identification hints when a user describes a failure. Not a full WCAG audit tool — a small helper: "Sounds like this might be a missing alt-text issue (WCAG 1.1.1) or a keyboard-trap issue (WCAG 2.1.2). Want to include this in your report?" Reduces the burden on residents who don't know WCAG jargon while producing structured data that strengthens the resulting demand letter.

### Effort

Rough estimate: ~1 week for #1 (UI branch on the reporting form), ~4-5 days for #2 (Playwright worker + bucket + retrieval flow), ~2 days for #3 (letter template), ~3 days for #4 (WCAG helper). Total: ~2.5 weeks.

### Why deferred

The category page is out. The 2024 DOJ rule stakes are documented publicly. Cities that read the deep-dive can already act (audit their sites, engage their ADA coordinator). The engineering plumbing to accept reports at scale can wait until (a) a pilot city commits, or (b) a specific resident advocacy group requests the workflow — either would prioritize which subset of the 12 categories to ship first.

### Grant relevance

Digital public infrastructure is the strongest single-category grant hook Fault Line has. Ford Public Interest Technology, Mozilla Foundation open-web accessibility tracks, and Ash Center Government Innovators Network all have live portfolios that fit. When the URL-first flow ships, the grant application writes itself: "We built the first consumer path from resident-affected digital-accessibility failure to statutory demand letter." See `GRANTS.md §4 Tier A`.

---

## 27. Briefing Packets — Generator, Distribution, and Right-of-Reply Infrastructure

**Status:** Public design page shipped at `briefing-packets.html` (2026-08-30). Two output types specified: monthly council-member district briefings and event-driven press-ready cluster summaries. **The generator, distribution pipeline, and right-of-reply infrastructure do not exist in the current app.**

**What's needed:** Five engineering deliverables.

### 1. Council-district boundary ingestion (per pilot city)

Fault Line has census-tract boundaries via TIGER; council districts are city-specific. Some cities publish district shapefiles openly; some publish PDF maps only; some don't publish at all. Ingestion is manual per city during pilot:
- Table: `districts (jurisdiction, district_id, boundary_geojson, elected_official_current, contact_email)`
- Boundary import: shapefile → PostGIS geometry column
- Point-in-polygon lookup: `find_district_by_point(lat, lng, jurisdiction)` — extends the pattern already established for `find_authority_by_point`.

Pilot cities that don't publish district boundaries can provide them during onboarding as a term of the pilot agreement.

### 2. Verified official-address list

Every city publishes elected-official contact addresses somewhere. Ingestion is manual per city during pilot:
- `elected_officials (jurisdiction, district_id, name, role, email, verified_at, verification_source_url)`
- Email verification: each address gets a soft-delivery test on ingestion; bounced addresses flag the row for re-verification.

### 3. Packet generator service

New backend service (Supabase Edge Function `generate-briefing-packet`) that takes `(jurisdiction, district_id, date_range)` and produces:
- PDF (via Puppeteer or a lightweight template renderer)
- JSON companion (same content, machine-readable)
- Static HTML at `fault-line.dev/briefings/<jurisdiction>/<district>/<date>.html`

Content pulls from existing tables: `reports`, `clusters`, `escalation_log`, `resolutions` (from DEFERRED #24), `districts` (from #1 above). Every packet includes a methodology-link footer with dataset versions.

Trigger: cron on the first of each month for council briefings; event-driven on threshold-crossing detection for press summaries.

### 4. Right-of-reply infrastructure

Before a press-ready summary distributes to journalists, the responsible authority contact of record receives a 24-hour pre-notification with the summary content and an append-response endpoint. Authority responses are appended to the packet before distribution.

Implementation: new `packet_pre_notifications` table with `sent_at`, `response_deadline_at`, `response_received_at`, `response_content`. Distribution cron blocks on `response_deadline_at` before sending.

### 5. Journalist verification workflow

Reporters subscribe with a byline URL. Verification is manual during pilot:
- `journalist_subscriptions (email, byline_url, jurisdictions, threshold_triggers, delivery_format, verified_at, verification_method)`
- Manual review by the maintainer during pilot
- Automatable later (byline verification services, official newsroom domain lookups)

### Effort

Rough estimate: ~1 week for #1 + #2 combined (mostly per-pilot-city data entry, some geometry work), ~2 weeks for #3 (generator + templates), ~3 days for #4 (right-of-reply flow), ~2 days for #5 (subscription form + manual verification workflow). Total: ~4 weeks.

### Why deferred

The design is out. Council members and reporters can review the format before Fault Line invests engineering time in a generator they don't want. Council briefings are the natural first ship (simpler distribution — every elected official gets one regardless of subscription); press summaries follow once a pilot city has data volume worth summarizing.

### Grant relevance

The council-briefing use case is a direct fit for Knight Foundation Journalism / Local News, MacArthur Journalism & Media, and Ford Civic Engagement programs. "Structured constituent-services data delivered to elected officials without editorial intermediation" is unusually clean grant framing. See `GRANTS.md §4 Tier A`.

---

## 28. Corridor & Area Reports — Geometry, Aggregation, and Segment-Scale Escalation

**⚡ SHIPPED (partial, 2026-08-30):** `ReportGeometryType` + `CorridorGeometry` + `AreaGeometry` types on `Report`, auto-suggestion algorithms (`src/services/corridorAggregation.ts` — `suggestCorridors()`, `suggestAreas()`, `haversineMeters()`, `pointInPolygon()`), Shame Index weight helper (`shameIndexWeight()` returns 3× for corridors, 3.5× for areas), corridor/area section rendered into letter body. Remaining: Supabase migration for PostGIS linestring/polygon columns on `reports` (BUILDABLE-TODAY); nightly cron to run `suggestCorridors()` in production (BUILDABLE-TODAY); map-drawing UI in web + native reporting screens (BUILDABLE-TODAY).


**Status:** Public design page shipped at `corridor-reports.html` (2026-08-30). Three report types specified (point / corridor / area), two creation paths documented (auto-suggestion + resident-initiated), community-verification thresholds calibrated, integration with Shame Index / Rapid Response Roll / A&E Group G / briefings all specified. **The report schema, geometry columns, and reporting UI do not yet support corridors or areas.**

**What's needed:** Five engineering deliverables.

### 1. Report schema extension

Add to `reports` table:
- `report_type` enum: `point` | `corridor` | `area` (default `point` for backwards compatibility)
- `corridor_geometry` PostGIS `LINESTRING` (nullable — only for corridor reports)
- `area_geometry` PostGIS `POLYGON` (nullable — only for area reports)
- `parent_cluster_id` (nullable — for corridors/areas that aggregated from point reports)

Migration sketch: `supabase/migration_019_corridor_area_reports.sql`. Adds columns, indexes on geometry columns, preserves existing point-report behavior unchanged.

### 2. Auto-suggestion algorithm

Nightly cron job (`supabase/functions/suggest-corridor-aggregations`) that:
- Scans point-report clusters within active jurisdictions
- Detects linear concentrations (5+ reports within 500 ft corridor over 60 days) → suggests corridor aggregation
- Detects polygonal concentrations (8+ reports within a defined neighborhood boundary over 60 days) → suggests area aggregation
- Writes suggestions to a new `corridor_suggestions` table
- Surfaces suggestions in the app UI ("These 7 reports look like they're part of the same problem. Convert into a corridor report?")

Community members (any nearby resident) can accept the suggestion. Algorithm does not auto-promote — human acceptance required.

### 3. Reporting UI

Longer-form flow for resident-initiated corridor/area reports:
- Web app: extend the existing Leaflet map with corridor-drawing (2-point linestring) and polygon-drawing tools
- Mobile app: same, using `react-native-maps` polyline / polygon rendering
- Both platforms: primary + secondary hazard type selection, multi-point photo upload along the corridor

### 4. Demand-letter template extensions

Corridor-scale letter templates that cite:
- Segment identifier (street name, from-to intersections)
- Pattern of failures (categories, count, distribution)
- Applicable statute at corridor scale (still M.G.L. c. 84 § 15 or equivalents, framed around the segment)
- Suggested municipal work-order response scope

Templates gain the same `pending-review` chain of custody as the current physical-infrastructure templates.

### 5. Shame Index weight adjustment

Corridor reports weighted at ~3x point reports (empirically calibrated once the first pilot city has enough data to fit). Prevents the accountability-arbitrage failure where a department "closes" ten point reports at 100% closure rate while the corridor continues to fail.

### Effort

Rough estimate: ~1 week for #1 (schema + migration), ~1 week for #2 (auto-suggestion algorithm + UI surfacing), ~2 weeks for #3 (UI on both platforms), ~3 days for #4 (letter template), ~2 days for #5 (Shame Index calibration + weight parameter). Total: ~4.5 weeks.

### Why deferred

The design is out. Pilot cities and mapping-savvy residents can review the shape before Fault Line invests engineering time. Point reports remain the workhorse; corridor/area are the next layer up. The engineering ships when a pilot city says "yes, we would treat corridor reports as more actionable than point clusters."

### Grant relevance

Corridor/area reports directly enable federal infrastructure grant applications. USDOT SS4A, FEMA BRIC, USDOT Reconnecting Communities — all award to segments and networks, not points. Cities using Fault Line corridor data in applications have quantified need analyses most other applicants can't produce. See `GRANTS.md §4 Tier C`.

---

## 29. Public-Employee Reporting — Insider Fields, Tor Verification, EXIF Stripping, Legal Review

**⚡ SHIPPED (partial, 2026-08-30):** `InsiderReportContext` + `InsiderCategory` types on `Report`, `insiderVerificationDeadline()` (180-day window), `shouldStripMetadata()` + `requestMetadataStrip()` helpers coordinating with the media pipeline, full referral table for 6 out-of-scope categories in `src/services/insiderReports.ts` (personnel grievance / criminal / classified / retaliation / policy dispute / confidential materials). Remaining: attorney review of MA/RI/NH whistleblower-protection landscape (BLOCKED-EXTERNAL). Tor-compatibility formal verification stays deferred per user instruction — the web app is already largely Tor-usable but formal validation is separate work.


**Status:** Public design page shipped at `whistleblower.html` (2026-08-30). Scope explicitly bounded (physical / digital / access / environmental infrastructure only, not personnel / criminal / classified / retaliation). Legal-protection landscape summarized with primary-source links. Honest technical claims about what Fault Line can and cannot deliver. **The insider-report submission flow does not exist in the current app.**

**What's needed:** Six engineering + review deliverables.

### 1. Legal review of the whistleblower-protection landscape

Same qualified-reviewer standard as the statute dataset (`src/services/statutes/README.md`): attorney admitted in the state, or a credentialed legal researcher with whistleblower-protection specialization. Software engineer is not qualified. Claude Code is not qualified.

Priority states (matching the statute-dataset priority):
1. **MA** — c. 149 § 185 audit points: what constitutes "violation of law, rule, or regulation," how *Garcetti v. Ceballos* interacts with state protection, retaliation-claim procedural requirements.
2. **RI** — Whistleblowers' Protection Act audit points: notice requirements, protected-activity scope.
3. **NH** — RSA 275-E audit points: coverage of municipal employees, damages framework.

Output: `src/services/whistleblower-protections/dataset.ts` mirroring the pattern of the statute dataset — versioned, chain-of-custody, per-state, `pending-review` until qualified reviewer signs off.

### 2. Insider-context fields in report schema

Add to `reports` table:
- `insider_context` JSONB nullable — with optional fields: `insider_category` (public works / IT / facilities / public housing / transit / etc.), `observed_duration_days`, `prior_internal_report_ref` (free text), `documentary_ref` (free text)
- Fields collected but not displayed publicly. Used to enrich demand letters and internal cluster analysis.

### 3. Longer verification window for insider-only observations

Insider reports without any resident confirmation get a 180-day verification window (vs. current shorter default). Sit in the map with a visible "pending community confirmation" state. If a resident independently observes and files, the reports link and escalation proceeds. If not, the report expires without escalation.

Schema: add `verification_deadline_at` to `reports` table.

### 4. EXIF-stripping option in photo upload

When an insider-report flag is set, the upload pipeline strips EXIF metadata (GPS coordinates, device model, timestamps) before storing the photo. Existing Modal image-processing worker can be extended for this.

Optional for all reports, mandatory for insider reports.

### 5. Tor-compatibility formal verification

The web app is already largely Tor-compatible. Formal verification: test the full submission flow via Tor Browser end-to-end, document any friction points (CAPTCHAs, image uploads, geolocation prompts), remediate. Publish results in the `whistleblower.html` page footnotes.

Also add: HTTP header hygiene to reduce fingerprinting surface (minimal server headers, no third-party embeds on the submission page).

### 6. Referral copy for out-of-scope categories

When a user selects an out-of-scope report category during submission (personnel grievance, criminal misconduct, retaliation claim, classified info, policy dispute), the reporting UI surfaces a referral panel:
- State EEOC / civil rights office contact
- State Inspector General / Attorney General contact
- Whistleblower attorney referral networks (National Whistleblower Center, Government Accountability Project)
- Explanation of why Fault Line is not the right channel and why routing to the right one matters

Jurisdiction-specific referrals mean this table extends per state, keyed to the same jurisdiction identifier used by the statute dataset.

### Effort

Rough estimate: legal review (external, gated on hiring a qualified reviewer — ~$1,000–$2,000 per state); ~3 days for #2 (schema + insider-context fields); ~2 days for #3 (verification-window changes); ~2 days for #4 (EXIF stripping in Modal worker); ~1 week for #5 (Tor verification + fingerprinting hygiene, most of which is validation not new code); ~1 week for #6 (referral panel + per-jurisdiction referral database). Engineering total: ~2.5 weeks.

### Why deferred

The design is out. What Fault Line can and cannot deliver is documented honestly. Public employees reading the page can decide whether Fault Line is appropriate for their situation *right now* — and if the answer is "not without additional legal counsel," that's the correct answer. Engineering ships when we have (a) a qualified legal reviewer, and (b) at least one pilot request from a public-employee advocacy group or union to validate the design.

### Grant relevance

Insider infrastructure reporting is a genuine gap. Government transparency funders (Sunlight Foundation successors, OpenGov Foundation, Knight democracy programs) have historically funded whistleblower-adjacent infrastructure. Fault Line's carefully-scoped approach — infrastructure only, honest technical claims, referral to real whistleblower counsel for anything larger — is a more grant-worthy posture than tools that overclaim protection. See `GRANTS.md §4 Tier A/B`.

### What NOT to do

- **Do not position Fault Line as a substitute for SecureDrop or GlobaLeaks.** Those tools exist for a reason. Their threat model is different. Attempting to compete on absolute-anonymity grounds will produce a worse tool than either alternative and will encourage people to trust Fault Line for something it can't deliver.
- **Do not accept classified information under any circumstances.** Not a policy discussion — accepting classified information could create serious legal liability for Fault Line, for reporters, and potentially for anyone in a chain of custody. The submission flow must reject anything the reporter marks as classified.
- **Do not make retaliation claims or handle them.** Refer to whistleblower attorneys. Fault Line documents infrastructure conditions; retaliation is an employment-law matter.

---

## 31. Commercial Property Reporting — Report Subtype, Aggregation, Right-of-Reply, ADA Title III Dataset

**⚡ SHIPPED (partial, 2026-08-30):** `ReportSubject` + `CommercialPropertyContext` types on `Report`, aggregation pipeline (`src/services/commercial/aggregation.ts` — `aggregateByProperty()`, `aggregateByChain()` with published thresholds), chain-brand registry (`src/services/commercial/chains.ts` — 40 US chains seeded, all `pending-review`, including MA/RI/NH-relevant Market Basket / Stop & Shop / Shaw's), 2010 ADA Standards for Accessible Design dataset (`src/services/commercial/ada-title-iii.ts` — 5 standards seeded, all `pending-review`). Remaining: right-of-reply pipeline shared with #27 (BUILDABLE-TODAY); reporter-reputation tracking (BUILDABLE-TODAY); competitive-reporter enhanced-review flag (BUILDABLE-TODAY); attorney review of reporter-attestation + anti-SLAPP language (BLOCKED-EXTERNAL).


**Status:** Public design + methodology page shipped at `business-property.html` (2026-08-30). Scope narrowly bounded (physical / infrastructural / ADA Title III conditions only, never subjective), evidence requirements strict (photo required, public-view attestation, reporter attestation with liability language), publication model aggregate-only (5+ reports from 3+ reporters over 90 days for property attribution; 15+ reports across 5+ locations over 180 days for chain attribution), right-of-reply preserved. **None of the underlying plumbing exists in the current app.**

**What's needed:** Seven engineering + review deliverables.

### 1. Report subtype in schema

Add to `reports` table:
- `report_subject` enum: `public_infrastructure` (default) | `commercial_property`
- When `commercial_property`: additional required fields — `business_name`, `business_address_full`, `chain_identifier` (nullable, for chain brand identifier), `public_view_confirmed` (boolean), `reporter_attestation` (boolean).

Migration sketch: `supabase/migration_020_commercial_property_reports.sql`. Additive; backwards-compatible with existing point-report flow.

### 2. Property-ownership lookup service

For a given GPS + property, resolve the responsible owner. Data sources:
- Municipal assessor / property tax databases (per-jurisdiction, manually ingested during pilot; some cities publish this as open data)
- State registry of deeds (for verification of current owner when the assessor is stale)
- Franchisor compliance contact database (for chain brands — seeded with the top ~200 US commercial chains + manually expanded as pilot cities engage)

New table: `commercial_properties (jurisdiction, address, owner_of_record, franchisor_brand, franchisor_compliance_contact, verified_at, verification_source)`.

### 3. Aggregation + right-of-reply pipeline

Extension of the right-of-reply infrastructure already scoped in `DEFERRED.md #27` (briefing packets). Adds:
- `property_aggregations` table tracking (property_id, report_ids[], aggregation_status, threshold_status, pre_notification_sent_at, response_deadline_at, response_content)
- Cron that checks aggregation thresholds nightly and fires the 14-day pre-notification to owner-of-record when a threshold is crossed
- Append-response endpoint identical to press-summary right-of-reply

### 4. Chain-identifier database

`commercial_chains (chain_id, brand_name, brand_aliases[], compliance_email, compliance_url, notes)`. Seeded with top ~200 US commercial chains (national retail, restaurants, banks, hotels, gyms, pharmacies). Manually expanded per pilot city / per reporter-submitted correction.

### 5. Reporter-reputation tracking (internal only, never public)

Extension of the user profile schema:
- `commercial_reports_submitted`
- `commercial_reports_dismissed_or_owner_corrected`
- Aggregation-weight modifier applied to commercial reports based on the ratio above. Low-quality reporters have their submissions weighted lower and eventually gated. Not visible to residents; not a public trust score; a spam-reduction tool.

### 6. Competitive-reporter enhanced-review flag

Nightly job that flags commercial reports where the reporter's most recent GPS locations are near a competing business (same category within 500 ft radius). Flagged reports get enhanced review before contributing to aggregation. Not a rejection; an elevated evidentiary standard.

### 7. ADA Title III standards dataset + attestation legal review

New versioned module: `src/services/ada-title-iii/`. Same pattern as the statute + routing datasets:
- Records per (accessibility category, standard citation, notice pathway)
- Chain of custody: `pending-review` until qualified reviewer flips to `verified`
- README + CHANGELOG
- Feeds the commercial-property letter templates with 2010 ADA Standards for Accessible Design citations

Additionally: attorney review of the reporter-attestation language and the anti-SLAPP-adjacent posture. False-report submitter liability language needs legal-counsel review before it ships live.

### Effort

Rough estimate: ~1 week for #1 (schema + migration), ~2 weeks for #2 (per-pilot-city assessor data ingestion + lookup service), ~1 week for #3 (aggregation + right-of-reply, mostly reusing #27 infra), ~1 week for #4 (chain database seed), ~3 days for #5 (reputation tracking), ~4 days for #6 (competitive-reporter flag), ~2 weeks for #7 (Title III dataset + attorney review). Total: ~7 weeks engineering + external legal review.

### Why deferred

This is the most sensitive expansion in the roadmap. Every guardrail on the page must be enforced in code before it ships — a poorly-implemented commercial-reporting feature is worse than none because it damages the platform's evidence discipline on the municipal side. The engineering effort is not the blocker; the correctness bar is. Ship this only when at least (a) a disability-rights advocacy group has reviewed the design, (b) an attorney has reviewed the reporter-attestation language, and (c) one pilot city has confirmed local code enforcement will accept escalations from the pipeline.

### Grant relevance

Directly fundable by disability-rights and civic-tech funders: Ford Foundation Disability Rights portfolio, Disability Rights Fund, Christopher & Dana Reeve Foundation, state Assistive Technology programs. The strict guardrail architecture is grant-worthy on its own — it directly responds to the well-documented failure modes of prior consumer-review approaches. See `GRANTS.md §4 Tier A/B`.

### What NOT to do

- **Do not launch without every guardrail enforced in code.** Any guardrail that "will be added later" corrupts the promise from day one.
- **Do not offer a small-business exemption.** A protected class of businesses that can't be reported is a corruption vector. The aggregation threshold protects all businesses equally from single bad-faith reports.
- **Do not accept individual reports as evidence for public attribution.** Only aggregations publish. Single reports flow into the routing pipeline privately.
- **Do not build a public API for commercial-report data before the aggregation model is battle-tested.** Public API for aggregated data is a v2 concern.







