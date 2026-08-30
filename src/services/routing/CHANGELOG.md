# Routing Dataset — Changelog

Format: one entry per record change, grouped by date. Bump the record's `version` in `dataset.ts` and add a line here in the same commit.

## 2026-08-30 — dataset 0.1.0

Initial seed. 17 records:

- **Federal fallbacks v0.1.0 (4):** `ada-title-ii-any`, `fair-housing-any`, `title-vi-language-access-any`, `fta-transit-ada-any`. All `pending-review`. DOJ / HUD / FTA contact portals verified as live at seed time.
- **MA v0.1.0 (5):** `pothole`, `sidewalk`, `streetlight`, `missing_curb_cut`, `broken_elevator_public_housing`, `broken_city_website_form`. All `pending-review`. Streetlight ownership flagged as city-vs-utility-varies for pilot-city confirmation.
- **RI v0.1.0 (4):** `pothole`, `sidewalk`, `missing_curb_cut`, `broken_elevator_public_housing`. All `pending-review`. Clerk-of-record delivery emphasized per RI case law.
- **NH v0.1.0 (4):** `pothole`, `sidewalk`, `missing_curb_cut`, `broken_elevator_public_housing`. All `pending-review`. $50k cap and weather exclusion noted per RSA 231:92 / 231:92-a.

## Template for future entries

```
## YYYY-MM-DD — dataset X.Y.Z (or "no dataset bump")

- **<category> / <jurisdiction> vA.B.C** — <what changed> — <status transition> — <reviewer name if flipping to verified>
```
