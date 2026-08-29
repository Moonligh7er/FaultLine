# Statute Dataset — Review Protocol

This directory holds the legal claims that Fault Line's demand-letter generator makes on behalf of users. A wrong `noticePeriodDays` or a mis-cited section here can **cost a user their actual claim** against a municipality. Treat every edit accordingly.

## Files

| File | Purpose |
|---|---|
| `types.ts` | The record schema. Do not add fields without also updating `statuteDisclaimer()`. |
| `dataset.ts` | The actual per-state records + accessors. This is the only place with legal content. |
| `index.ts` | Barrel re-export. Consumers import from `./statutes`, not from `./statutes/dataset`. |
| `CHANGELOG.md` | Per-record version history. Every edit gets an entry. |
| `README.md` | This file. |

## Verification states

Each `StateStatuteRecord` carries a `verificationStatus`. The downstream generator (`legalGenerator.ts`) reads this and adjusts the letter it emits:

| Status | What it means | Letter behavior |
|---|---|---|
| `verified` | A licensed attorney or credentialed legal researcher reviewed against primary sources and the review is still within its 12-month window. | Standard "not legal advice" footer. |
| `pending-review` | Record exists but has never been reviewed by a qualified reviewer. | **Prepends a prominent unreviewed-content banner** to the letter. Users can still generate it — but they know they must verify. |
| `stale` | Was `verified` once, but `nextReviewAt` has passed. | Treated like `pending-review` at runtime. Also surfaces on an admin dashboard for scheduling re-review. |
| `draft` | Not shipped to users at all. | `getStatuteRecord()` returns `null` for draft states. Use during work-in-progress. |

At time of writing, **all three shipping states (MA, RI, NH) are `pending-review`**. This is intentional: the letter generator prepends the unreviewed banner so users see that the underlying legal claim hasn't cleared review, even though the app is otherwise functional.

## Promoting a record to `verified`

A record can be flipped from `pending-review` to `verified` only when **all** of these are true:

1. **Reviewer is qualified.** Either (a) an attorney admitted to practice in the state, or (b) a legal researcher with documented civic-tech / municipal-liability experience. A software engineer is not qualified. Claude Code is not qualified.
2. **Reviewer is named.** `verifiedBy` gets a human name and role. Never a project alias, never an org name alone.
3. **Sources are primary.** At least one entry in `sources` must be a `.gov` / `.state.[xx].us` / official-legislature domain link to the actual statute text. Secondary summaries (Nolo, Justia, law-firm blog posts) can supplement but do not satisfy this requirement.
4. **`knownAmbiguities` is honest.** If the reviewer knows of a live dispute, a recent appellate decision, or a jurisdiction-specific quirk, it goes into `knownAmbiguities`. The purpose is not to disclaim the record into uselessness — it is to give the downstream generator enough context to route around the ambiguity (e.g., "if this is a state-numbered route, use the MassDOT template instead").
5. **`nextReviewAt` is set.** Default: `verifiedAt` + 12 months. States with active legislative sessions on the topic (e.g., recent tort-cap changes) can be set shorter.
6. **`version` is bumped** and an entry is added to `CHANGELOG.md`.

## Adding a state

1. Copy an existing record in `dataset.ts` and insert alphabetically by `stateCode`.
2. Start with `verificationStatus: 'draft'` so it never reaches users while you're drafting.
3. Fill every field. Placeholders like "TODO" are not acceptable in shipped fields — either leave the whole record `draft` or drop the field into `knownAmbiguities` with an honest note.
4. When drafting is complete, flip to `pending-review`. The state becomes usable but the letter carries the unreviewed banner.
5. When a qualified reviewer completes the review per the checklist above, flip to `verified`.

## Removing a state

Do not silently delete records. Bump the state's `version`, set `verificationStatus: 'draft'`, and add a `CHANGELOG.md` entry explaining why (e.g., "coverage withdrawn 2027-03-01 pending re-review after RSA amendment"). Draft records are invisible to `getSupportedStates()`.

## What downstream code must not do

- **Do not hardcode statute citations elsewhere.** Every letter, disclaimer, banner, and marketing card that names a specific statute should ultimately trace back to `getStatuteRecord()`. If you find a hardcoded citation in `legalGenerator.ts`, `about.html`, or `features.html`, replace it with a read from this module.
- **Do not treat `pending-review` as equivalent to `verified` for user-facing marketing claims.** Copy like "cites your state's actual statute, verified by counsel" is only true once `verifiedStates()` returns something. Until then, the correct phrasing is "template citing your state's statute" — the templates exist, the counsel-verified claim does not (yet).
- **Do not skip the disclaimer footer.** `statuteDisclaimer(record)` should appear on every generated letter. It carries the version + review chain of custody, which is what makes the letter defensible if a recipient challenges it later.

## Priority queue for next legal review

Once a qualified reviewer is engaged, the ordering below is the recommended review sequence — MA first because it's the highest-volume state and has the shortest (30-day) notice window, making errors the most consequential.

1. **MA** — 30-day window; property-vs-personal-injury distinction is the main audit point.
2. **NH** — the $50,000 statutory cap needs current-year confirmation.
3. **RI** — clerk-of-record delivery is the main audit point.
