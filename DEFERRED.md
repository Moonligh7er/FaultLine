# DEFERRED — Items Requiring External Action or Credentials

These items cannot be completed without external accounts, credentials, or assets.
Each item includes what's needed and what has already been prepared.

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

**Status:** All canonical URLs point to `moonligh7er.github.io/FaultLine/`. Contact emails use `faultline.app` domain.
**What's needed:** A purchased domain
**Steps:**
1. Buy domain (faultline.app, .io, .dev, or .org)
2. Point DNS to hosting (GitHub Pages, Vercel, or Netlify)
3. Find-and-replace `moonligh7er.github.io/FaultLine` with your domain across `website/`, `robots.txt`, `sitemap.xml`
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

## 9b. Buy a Domain and Verify in Resend (upgrade escalation email credibility)

**Status:** Not done. Escalation emails currently send from `onboarding@resend.dev` which looks amateur to city officials. Fix: own a real domain and verify it in Resend.

**Why it matters:** The `escalate-clusters` function emails city officials with legal demand language. The sender address directly affects credibility — an `@resend.dev` sender gets flagged or ignored; a `reports@faultline.app` sender gets read.

**Cost:** ~$12-15/year for the domain. Resend verification is free.

**Steps:**
1. Buy `faultline.app` (or `.org`, `.dev`, `.io`) at Namecheap, Porkbun, or Cloudflare Registrar
2. Log in to Resend → Domains → Add Domain → enter your domain
3. Resend gives you 3 DNS records (SPF TXT, DKIM TXT, return-path CNAME) — add them to your DNS provider
4. Wait 5-15 min → click "Verify" in Resend → green checkmark
5. Update Supabase secrets: `npx supabase secrets set FROM_EMAIL=reports@faultline.app --project-ref dzewklljiksyivsfpunt`
6. (No redeploy needed — functions pick up new secret on next invocation)
7. Update canonical URLs across website pages (find-and-replace `moonligh7er.github.io/FaultLine` → your new domain)

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
