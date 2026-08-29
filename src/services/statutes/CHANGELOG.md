# Statute Dataset — Changelog

Format: one entry per record change, grouped by date. Bump the record's `version` in `dataset.ts` and add a line here in the same commit.

## 2026-08-29 — dataset 0.1.0

- **MA v0.1.0** — Initial migration from inline `STATE_STATUTES` in `legalGenerator.ts`. Status: `pending-review`. Content preserved verbatim from prior implementation. Reviewer needed.
- **RI v0.1.0** — Initial migration from inline `STATE_STATUTES`. Status: `pending-review`. Content preserved verbatim.
- **NH v0.1.0** — Initial migration from inline `STATE_STATUTES`. Status: `pending-review`. Content preserved verbatim. `$50,000 cap` flagged in `knownAmbiguities` for review-year confirmation.

## Template for future entries

```
## YYYY-MM-DD — dataset X.Y.Z (or "no dataset bump")

- **XX vA.B.C** — <what changed> — <status transition, if any> — <reviewer name if flipping to verified>
```
