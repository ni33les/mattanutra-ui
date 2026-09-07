# Flexible catalogue matching: v5 release ledger

This release implements the approved limited-catalogue plan on `dev`. DEV deployment requires the complete unchanged-source acceptance attestation. UAT is excluded from this rollout. Focused test results below are development evidence, not release acceptance.

## Baseline and immutable evidence

- Release base: `c64cfcd743904c6bd8a50611dae5b75b92cce5e9`.
- The previous interrupted v4 acceptance remains incomplete. Its historical results are preserved.
- Development evidence is outside the checkout at `/tmp/mattanutra-flexible-v5-evidence`.
- The fresh expanded inventory revealed that HTTP consumers need an isolated local server as well as an isolated database. Offline guards rejected attempts to reach public DEV. That failed baseline is preserved, and the runner must provide the missing local transport prerequisite.
- An initial root typecheck with a 1400 MB heap exhausted its heap and is not a pass. A subsequent 3072 MB run reported three integration errors; the three integration errors were corrected. A fresh full 3072 MB typecheck subsequently passed; final unchanged-source validation remains required.

## Intentional expectation changes

Historical case IDs and fixture prices remain intact. A changed behaviour must retain or replace its functional assertion; changes in generated identities alone do not justify weaker dose, financial or coverage checks.

| Existing expectation | v5 behaviour | Maintained regression evidence |
| --- | --- | --- |
| Default MCP basket count six; compact three; web balanced six | Omission or null is unrestricted. Explicit zero and customer ceilings remain binding. | `matcher/flexible-v5-counts`, `agentic-flexible-v5-contract`, `matcher-v5-web` |
| Only one to three daily servings; serving fractions rounded upward in projection | Evaluate supported physical increments and preserve the exact evaluated quantity through MCP and web projections. | `matcher/flexible-v5-doses`, `matcher/flexible-v5-residual`, `agentic-flexible-v5-bridge` |
| MCP aggregate counted only fully met rows while web counted any positive row as covered | Share proportional dose coverage across MCP and web; separately count fully met targets. Target 200/current 100/new 50 reports 75% and gap 50; 99.9% remains partial. | `agentic-flexible-v5-coverage`, maintained product metrics and reveal helper assertions |
| 90% counted as fully covered | Full coverage requires the requested amount. Range membership is separate; partial targets remain in the denominator. | Existing `agentic-matching-bridge-v4` case plus `matcher/flexible-v5-priority` |
| A gap or plant-based algae choice creates a required answer | Gaps and implied sources are advisory. Explicit conditional customer choices still produce questions. | `agentic-flexible-v5-conversation`, existing `agentic-contract-v4` answer cases |
| Empty closest basket hides all purchasable choices | Return eligible alternatives and `review_options`; selection makes a nonempty choice ready. | `matcher/flexible-v5-options`, `agentic-flexible-v5-conversation`, `agentic-flexible-v5-bridge` |
| Two current connector resources replace earlier resources | Publish v5 while retaining the exact two v4 resources. Current resources are listed first. | Existing `agentic-contract-v4` resource case plus `agentic-flexible-v5-contract` |
| Identical requests repeat the same bounded search | Identical inputs reuse work; explicit expanded effort increases the deterministic budget and retains the incumbent. | `matcher/flexible-v5-search`; published client expanded-search journey |
| Missing physical or pack metadata can imply capsule/pill counts or supply | Preserve unknowns and original confidence; expose evidence. Unknown counts cannot support a fewer-pills claim or certify an explicit pill ceiling. | `matcher-v5-catalogue`, `agentic-flexible-v5-bridge`, proposal and public comparison regressions |
| A full valid 30-target request with no products is described as too broad | Keep every target in coverage and return a no-purchase result with advice. The documented request-size validation remains. | `agentic-flexible-v5-journey` empty-catalogue case |
| Old catalogue results can be selected or reused for a fresh checkout | Fence current evaluation by catalogue identity/revision. Existing frozen payments and orders remain resumable. | `agentic-flexible-v5-journey`, `retail-checkout-catalogue-v5` Node and PostgreSQL cases |
| PostgreSQL/browser fixtures omit current catalogue identity | Seed explicit current revisions after all catalogue changes. Production stale-result checks remain enforced. | `funnel-readiness.integration`, browser fixture seed and runtime epoch tests |

## Reviewable implementation slices

The commit history separates inventory/oracle infrastructure, catalogue corrections, count ceilings, physical quantities, scoring/coverage, trade-offs, expanded search, web integration, checkout recovery, and MCP conversation/contract integration. Each has focused RED/GREEN evidence. Independent slices were developed in parallel; the complete inventory is being run on the integrated source rather than attested independently after each intermediate commit. This is a sequencing deviation from the plan, and focused runs are not claimed as the complete green gate. Complete inventory and integrated acceptance remain mandatory before rollout.

Source-backed catalogue corrections are additive, audited and fingerprint guarded. Unexpected prior data aborts the correction transaction. Missing or contradictory data is not silently upgraded. Existing orders retain frozen products, quantities, prices and payment identities. No additional charge is used for recovery.

## Release gate and rollout record

Run `npm run validate:dev:advisory` against isolated PostgreSQL, controlled catalogue fixtures, mock/test payments and an email sink. The release diff starts at the base above. Both complete matcher/MCP acceptance runs and both published-documentation journeys must have identical non-latency results. Actual timeouts, missing cases, skipped cases and incomplete operations are failures.

Store the complete source, schema, catalogue and inventory fingerprints with immutable results outside the checkout. Final attestation and DEV deployment records will live with the immutable external evidence, so recording deployment does not change the source that was validated. Apply additive schemas and reviewed corrections, deploy the exact validated commit, restart the application and workers, and smoke-test the required scenarios. UAT remains unchanged.
