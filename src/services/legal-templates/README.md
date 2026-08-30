# Legal Templates Module

Per-framing letter templates for the Fault Line letter generator. Same versioning + chain-of-custody pattern as `src/services/statutes/` and `src/services/routing/`.

## Framings currently supported

| Framing | Applies to | Federal complaint pathway |
|---|---|---|
| `defective-highway` | Physical infrastructure (potholes, sidewalks, streetlights, etc.) | State-law only |
| `ada-title-ii` | Public-entity access barriers (Groups A, B, F from Access & Equity) | DOJ Civil Rights Division |
| `fair-housing-504` | Public housing habitability + accessibility (Group D) | HUD Fair Housing Enforcement Center |
| `title-vi-language` | Language access at federally-funded services | DOJ Federal Coordination and Compliance |
| `transit-ada` | Transit authority accessibility (Group E) | FTA Office of Civil Rights |

## How the letter generator uses this

`legalGenerator.ts` calls `getFraming(report.category)` on submission. If the returned framing is `defective-highway` (the default fallback), it uses the existing statute dataset + defective-highway template. If any other framing, it uses the corresponding template's headline, citation, notice period, and demand-language substitutions.

All templates start `pending-review` and produce letters with the unreviewed-content banner. Promoting to `verified` requires the same qualified-reviewer standard as the statute dataset.

## Adding or changing a framing

1. Add the framing to the `LegalFraming` union in `types.ts`.
2. Add a full `LegalTemplate` record to `TEMPLATES` in `templates.ts`.
3. Add the category-to-framing mappings in `CATEGORY_FRAMING`.
4. Bump the affected template's `version`.

## What NOT to do

- Do not generate letters citing statutes that don't exist for the reporter's jurisdiction. The dispatch in `getFraming()` is universal (federal frameworks apply nationwide) but state-specific defective-highway framing must resolve through the statute dataset per state.
- Do not lower the `noticePeriodDays` without attorney review. The window is a legal deadline; understating it can cost a user their claim.
- Do not mark a template `verified` without a named qualified reviewer.
