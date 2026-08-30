# Commercial Property Module

Implements the pipeline behind `/business-property`. Individual commercial-property reports never publish on their own — this module handles aggregation, chain-brand routing, and 2010 ADA Standards citation lookup.

## Files

| File | Purpose |
|---|---|
| `thresholds.ts` | Aggregation thresholds (5 reports / 3 reporters / 90 days for property; 15 reports / 5 locations / 10 reporters / 180 days for chain). Values match `/business-property` page verbatim — changing them requires an updated page + guardrail review. |
| `aggregation.ts` | Pure functions computing property-level and chain-level aggregations from a report set. Does NOT publish; publish is gated by the right-of-reply pipeline. |
| `chains.ts` | Corporate chain registry — brand → franchisor compliance contact mapping. ~40 US chains seeded, all `pending-review`. |
| `ada-title-iii.ts` | 2010 ADA Standards for Accessible Design (28 CFR Part 36) citations for the commercial-property letter templates. 5 standards seeded, all `pending-review`. |

## Guardrails enforced in code

- `aggregateByProperty` and `aggregateByChain` only return status flags — actual publication requires the right-of-reply pipeline (in DEFERRED #31) to complete its 14-day pre-notification window.
- `findChain` returns `null` for `draft` records — never surfaced to users.
- Every published citation (chain or Title III standard) carries a `pending-review` footer until a qualified reviewer promotes it.

## What NOT to do

- **Do not lower the thresholds without updating `/business-property.html` first.** The public commitment is the constraint; the code enforces the commitment.
- **Do not add a "small-business exemption" here.** The published guardrails explicitly say no exemption — a protected class of businesses that can't be reported is a corruption vector.
- **Do not publish aggregation results directly from this module.** Publication goes through the right-of-reply pipeline; this module computes readiness.
