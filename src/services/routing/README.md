# Routing Dataset — Review Protocol

This directory holds the routing claims Fault Line makes on behalf of users: for a given `(categoryKey, jurisdictionScope)` pair, which government office is responsible, which escalation path applies, and which federal agency accepts a fallback complaint. A wrong routing target means a resident's report reaches the wrong desk and the statutory clock does not start. Treat every edit accordingly.

## Files

| File | Purpose |
|---|---|
| `types.ts` | Record schema. `CategoryRouting` — one per `(category, jurisdiction)` pair. |
| `dataset.ts` | Per-category, per-jurisdiction records + accessors. Only place with routing content. |
| `index.ts` | Barrel re-export. Consumers import from `./routing`. |
| `CHANGELOG.md` | Per-record version history. Every edit gets an entry. |
| `README.md` | This file. |

## Relationship to the statute dataset

The statute dataset (`src/services/statutes/`) answers *what law applies* and *what the notice window is*. This routing dataset answers *which office receives the notice*. Both are consulted by the letter generator: the statute dataset picks the citation and deadline; the routing dataset picks the addressee.

They share the same verification chain of custody pattern deliberately. A record is only production-safe when `verificationStatus === 'verified'`; any other status forces the letter generator to prepend a stronger disclaimer.

## Verification states

Same as the statute dataset:

| Status | Meaning | Letter behavior |
|---|---|---|
| `verified` | Reviewed against primary sources by a qualified reviewer within the 12-month window. | Standard "not legal advice" footer. |
| `pending-review` | Record exists but not qualified-reviewer-verified. | Prepends unreviewed-content banner. Users can still use, but they know they should verify. |
| `stale` | Was `verified` but `nextReviewAt` passed. | Treated as `pending-review` at runtime. |
| `draft` | Not shipped. | Invisible to `getRouting()` and `getRoutingsByJurisdiction()`. |

At time of writing, **all shipping records are `pending-review`** — the routing targets are our best current reading of publicly available authority information, but they have not been individually attorney-reviewed. Each generated letter that consumes a routing record surfaces the review status.

## Coverage seeded

- **Federal fallbacks (4 records):** ADA Title II, Fair Housing, Title VI language access, FTA transit ADA. These apply when jurisdiction-specific routing isn't available.
- **Massachusetts (5 records):** pothole, sidewalk, streetlight, missing curb cut, broken elevator in public housing, broken city website form.
- **Rhode Island (4 records):** pothole, sidewalk, missing curb cut, broken elevator in public housing.
- **New Hampshire (4 records):** pothole, sidewalk, missing curb cut, broken elevator in public housing.

Expansion beyond these 17 records happens as (a) pilot cities provide their specific municipal ADA-coordinator contact information, (b) new states are added to the coverage roadmap (ME/VT/CT next per DEFERRED #22 priority order), and (c) new categories from the Access & Equity taxonomy ship in the app.

## Promoting a record to `verified`

Same standard as the statute dataset:

1. **Reviewer is qualified.** Attorney admitted in the state, or a credentialed legal researcher with municipal-liability / ADA / civil-rights specialization. Software engineer is not qualified. Claude Code is not qualified.
2. **Reviewer is named.** `verifiedBy` gets a human name and role.
3. **Sources are primary.** At least one entry in `sources` must be a `.gov` / official-agency domain link.
4. **Contact information is current.** Every `AuthorityContact` field that names an office must be verified to still exist at that identifier. Cities reorganize; departments merge; email addresses go dead. Verification is not just "does this rule apply" but "does this address still receive mail."
5. **`nextReviewAt` is set.** Default: `verifiedAt` + 12 months. Municipal contact information changes faster than statute text; consider 6-month cycles for entries with volatile addresses.
6. **`version` is bumped** and an entry is added to `CHANGELOG.md`.

## Adding a jurisdiction / category

1. Copy an existing record in `dataset.ts` for the closest analog category or jurisdiction.
2. Start with `verificationStatus: 'draft'` so it never reaches users while you're drafting.
3. Fill every field. Placeholders are not acceptable in shipped fields.
4. When drafting is complete, flip to `pending-review`. The record becomes usable but the letter carries the unreviewed banner.
5. When a qualified reviewer completes the review, flip to `verified`.

## What downstream code must not do

- **Do not hardcode authority contacts elsewhere.** Every letter, escalation, and demand should ultimately read from `getRouting(categoryKey, jurisdictionScope)`. If a contact is hardcoded in `legalGenerator.ts` or in a marketing page, replace it with a read.
- **Do not treat `pending-review` as equivalent to `verified` for user-facing marketing claims.** Copy like "routed to the correct authority in your state, verified by counsel" is only true once `getRoutingsByJurisdiction()` returns records that have `verificationStatus === 'verified'`. Until then: "routed to our best current reading of the responsible authority."
- **Do not skip the routing disclaimer footer** on generated letters. `routingDisclaimer(record)` should appear alongside `statuteDisclaimer(statuteRecord)` in every letter footer.
- **Do not attempt to auto-verify records via web scraping.** Automated verification of authority contact information at scale is a wide net that produces false confidence. Verification is a human review step by design.

## Priority queue for next legal / research review

Ordering after MA/RI/NH statute-dataset priority (DEFERRED #22):

1. **MA missing_curb_cut** — highest-volume ADA category in the pilot region. Once MA's Municipal ADA Coordinator lookup is validated per-city during pilot onboarding, this is the first record to promote.
2. **MA broken_elevator_public_housing** — highest-stakes public housing category. HUD contact is stable; PHA identification per building is the review work.
3. **Federal-fallback records** — these are stable in a way jurisdiction-specific records are not (DOJ CRD, HUD FHEO, DOJ Title VI, FTA CR don't move). Should be the easiest to promote to `verified` first.
4. **RI + NH parallel promotion** — once MA is verified, the same review process applies to RI and NH.
