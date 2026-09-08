# Offline matcher scoring experiments

This harness compares preference curves and nutrient curves separately and together on frozen inputs. It produces reviewable evidence without changing the deployed matcher policy, catalogue data, reference versions or historical orders. A lower score under one formula is not a percentage improvement over another formula, a clinical quality claim or authorization to deploy that formula.

## Inputs and provenance

The corpus contains four Anna catalogue anchors and twelve explicit synthetic cases:

- `anna-dev-create` and `anna-dev-revise` use reconstructed corrected DEV inputs.
- `anna-uat-create` and `anna-uat-revise` use reconstructed corrected UAT inputs.
- `SYN-01` through `SYN-12` cover curve symmetry and concentration, numeric preferences, unknown facts, continued/dietary intake, scope-aware limits, core/optional targets, exclusions, empty recommendations and physical dose grids. Full IDs and purposes are defined in `lib/matcher/experiments/synthetic-corpus.ts`.

Each Anna environment retains all 154 seller listings and 79 products from the preserved baseline. Reconstruction overlays the reviewed 57 administration changes, three fact corrections and six nutrient reference corrections. It verifies exact before records, correction receipts, all 18 original reference heads, all 31 appended changes and the complete 79-product review. Fact corrections are tied to raw fact IDs and an exact original matching fact. Seller identities, quoted prices and stock observations remain frozen.

Reference selection uses the latest version per nutrient, life stage and source scope, including null. A null head retires that scope; an older positive version never reappears. Total and supplemental references remain distinct. Source URLs, confidence and rationale remain available, including the different retained internal advisory thresholds in DEV and UAT. Corrected epoch 99 identifies the reconstruction's reference state; it does not make the original price/stock observation fresh.

`test/fixtures/matcher-experiments/manifest.json` pins the input file bytes. Each file also records original source hashes and correction fingerprints. The original archive is `implementation-evidence-2026-09-07T13-07-25Z.tar.gz`, SHA-256 `212e478dda464a112776aed80189ee0095a91abb626422dc4a73a58feb5e8107`. The corrected source identity is `22bce180e79c01147c95ace332af2211ada90038`. These inputs are explicitly **reconstructed corrected baselines**, not newly captured post-deployment catalogues.

The Anna revision changes only the objective from `lowest_cost` to `best_coverage`. Four target amounts, two-product/two-pill preferences, health context, explicit empty current supplements and unknown dietary intake are preserved. `test/fixtures/anna-v6/dev-baseline.json` remains the historical pre-correction fixture and must not be overwritten with corrected data or new expected winners.

The committed experiment inputs use explicit field allowlists. They contain no customer/contact records, order/payment identifiers, capability handles or broad MCP transcripts. The deidentified health context remains sensitive; use opaque case IDs when sharing results. Rebuild instructions are in `test/fixtures/matcher-experiments/README.md`; rebuilding reads preserved local files, never a live database.

The production request normalizer runs in a child process with an allowlisted environment, no inherited database credentials, and disabled network transports. It uses the existing Thailand fallback market. The parent attaches request-scoped reference ceilings without modifying global reference caches. No connector, payment adapter or live market call is part of the comparison.

## Commands and output

Run commands from the repository root. No database credentials are required. Output must be a new absolute directory outside the checkout; existing evidence is never overwritten.

```sh
# Inspect the nine built-in profiles without running comparisons.
npm run matcher:compare -- --list-profiles

# Compare all nine profiles on the four Anna anchors and twelve synthetic cases.
npm run matcher:compare -- --profiles all --corpus anna-and-synthetic --effort standard --output /tmp/matcher-comparison-standard-a

# Separate expanded search for the four catalogue anchors.
npm run matcher:compare -- --profiles all --corpus anna --effort expanded --output /tmp/matcher-comparison-expanded-a

# Restrict an investigation to the finite synthetic cases and selected arms.
npm run matcher:compare -- --profiles baseline,nutrient-quadratic__preferences-off,nutrient-linear__preferences-quadratic,nutrient-quadratic__preferences-quadratic --corpus synthetic --effort standard --output /tmp/matcher-comparison-selected-a

# Use the descriptor-only JSON example below as a custom profile file.
npm run matcher:compare -- --profile-file /tmp/review-profile.json --corpus anna-and-synthetic --effort standard --output /tmp/matcher-comparison-custom-a
```

`--profiles` accepts `all` or comma-separated built-in IDs. Without either profile option it defaults to all nine. `--profile-file` accepts one validated definition or an array; by itself it selects those definitions. Combining it with `--profiles` appends the custom definitions and rejects duplicate IDs. The default corpus is `anna-and-synthetic` and the default effort is `standard`. Unknown/repeated flags and invalid values fail before comparisons. Expanded effort is for catalogue anchors: it automatically computes standard seeds first, and rejects `--corpus synthetic`.

The standard run has 16 cases × nine profiles when all profiles are selected. The separate expanded run has four catalogue cases × nine profiles. Both retain all observed candidate evidence. If a paired comparison is required, run the same command into a second new directory while source and parameters remain fixed, then compare the preserved canonical results and fingerprints. There is no automatic retry that can replace failed evidence.

Top-level artifacts are:

- `source-before.json` and `manifest.json`: source fingerprints, completeness of the requested corpus, profile/case counts, corpus/result identities and final unchanged-source status. A successful comparison receipt is not product-wide validation.
- `profiles.json`: the exact selected definitions plus generated version/hash metadata. Strip that runtime metadata before using entries as `--profile-file` definitions.
- `report.json`, `report.html` and `report.csv`: the complete structured comparison and standalone presentations.
- `summary.json`: neutral classifications and factual changes, with no universal quality percentage.
- `latency.json`: descriptive wall-clock observations, kept apart from canonical matching evidence.
- `failure.json`, when an attempt fails: failure status and completed case IDs; completed evidence is retained.

Each `cases/CASE_ID/` directory contains `input.json`, `baseline-result.json`, `pool.jsonl` and `comparison.json`. Synthetic cases additionally contain `oracle.json`. Each profile has a `PROFILE_ID-cross-scores.jsonl` file; active preference curves also have cross-score files for sensitivity weights `0.10` and `0.50`. Only `latency.json` is excluded from direct paired artifact equality; the manifest itself must match exactly. Dose, price, reference, uncertainty and candidate identity evidence remain meaningful.

## Verify a preserved pair

After two identical-parameter runs have completed, verify their preserved evidence directly:

```sh
node scripts/verify-matcher-comparison-pair.mjs /tmp/matcher-comparison-standard-a /tmp/matcher-comparison-standard-b --output /tmp/matcher-comparison-standard-pair.json
```

The verifier does not run tests, searches, comparisons or live calls. It requires two distinct completed run directories and a new absolute receipt filename outside the checkout and both input directories. It checks passed manifests, unchanged source and commit identities, complete fixed case/profile inventories, corpus/report fingerprints, per-case input/baseline/pool identities and a cross-score row for every candidate under every profile and sensitivity weight. It verifies declared artifact hashes when present, and independently requires the complete expected artifact inventory.

Every artifact is hashed and compared byte for byte, including unselected candidate doses, all cross-scores, reports and `manifest.json`. **Only `latency.json` is excluded from byte equality**; it must still be valid descriptive evidence for the complete case inventory. There is no exemption for different manifest metadata, product/reference values or newly added files. Missing/extra artifacts, `failure.json`, changed source, incomplete run counts and evidence modified during verification fail the check.

Bounded-search `complete: false`, explicit unknown-score cohorts and finite-grid-only oracle scope remain valid recorded outcomes; they are not incomplete run inventories. The pair receipt records source, corpus/result fingerprints and the matching file hashes. Its pass means complete preserved offline evidence was identical, not that a scoring policy is clinically superior or approved for deployment.

## Scoring profiles

The built-in matrix has nine profiles: nutrient curves `linear`, `mixed` and `quadratic`, crossed with preference curves `off`, `linear` and `quadratic`. IDs have the form `nutrient-mixed__preferences-quadratic`. `baseline` resolves to `nutrient-linear__preferences-off`.

For a nonnegative proportional nutrient deviation `d`, the curve is:

```text
f(d) = (1 - alpha) * d + alpha * d²
linear: alpha = 0
mixed: alpha = 0.5
quadratic: alpha = 1
```

The transformation is applied to each nutrient's under-target and over-target deviation separately, before summing. It is not applied to the sum of deviations. Under-target and over-target deviations of equal magnitude remain symmetric. Continued-dose increments use their declared continued-dose basis. The stronger reference-limit component remains twice the proportional limit excess and retains its source scope.

The total has separately published components:

```text
nutrient total = target under penalties
              + target over penalties
              + continued-dose penalties
              + source-scoped reference-limit penalties

complete total = nutrient total + weighted preference penalties
```

Known diet participates in `total_daily` targets and total-intake references; it does not become supplemental exposure. Unknown intake remains annotated and is not a known zero. Estimated intake uses the worst score over the declared interval endpoints; the admitted nonnegative convex curve family supports that endpoint calculation. A different future nonconvex family would need a different interval proof or search.

Preference penalties use product count, daily pills and first-order goods price in minor currency units. They apply only above a requested preference. For positive preferences, the proportional overrun is `(actual - preferred) / preferred`, bounded below by zero. For an explicit zero preference, the denominator is the profile's positive declared zero-preference scale. Omitted preferences are inactive; explicit zero is not omission.

Preference curves apply either `d` or `d²`, multiplied by the corresponding metric weight. The built-in weights are `0.25` each. The default zero-preference scales are one product, one pill/day and 10,000 THB minor units. These are visible experiment parameters, not inferred clinical thresholds. A zero-price preference requires a scale in the actual request currency. Price remains the quoted purchased-pack goods price; increasing daily servings does not invent an additional pack charge.

`profileDefinition(profile)` returns the accepted, JSON-safe parameter shape. A custom definition is:

```json
{
  "id": "review-mixed-quadratic",
  "nutrientAlpha": "0.5",
  "preferenceCurve": "quadratic",
  "preferenceWeights": {
    "productCount": "0.25",
    "dailyPills": "0.25",
    "priceMinor": "0.25"
  },
  "zeroPreferenceScales": {
    "productCount": "1",
    "dailyPills": "1",
    "priceMinor": "10000",
    "currency": "THB"
  }
}
```

Do not put runtime `hash`, `version`, `nutrientCurve` or BigInt objects in a profile definition. The validator rejects missing/unknown keys, invalid IDs, nonfinite/negative weights, alpha outside `[0, 1]`, nonpositive zero scales and a noninteger/unsafe price scale. Decimal strings preserve the intended coefficients. A profile hash includes its scoring version and complete validated definition; an ID alone is not an evidence identity.

## Comparing search with scoring

The baseline arm observes the existing production matcher and preserves its selected basket. Experimental arms reuse physical dose compilation and eligibility checks, but score search states under the declared experimental profile. Numeric preferences remain advisory; country, source, explicit exclusions and physical dose validity remain eligibility constraints.

The report separates two evaluations:

1. **Full search:** each profile's bounded exploration and selected result, with expansion attempts, budget, quantity probes, effort and completeness. It can reveal changes caused by scoring, ordering, pruning and newly explored quantities.
2. **Common-pool rescoring:** every profile scores the same declared candidate pool. The pool's size and identity are recorded. This isolates rankings within that pool; it cannot establish an optimum outside the pool.

Preference-weight sensitivity is labelled `rescoring_only`. The CLI rescales all three metric weights to `0.10` and then `0.50` for profiles with active preference curves. It changes weights on the frozen pool and does not claim that each weight received a fresh search. Candidate identities include seller and dose variants. Materializing report metrics is limited to winners, purchase fallbacks and bounded examples of incomplete candidates rather than every search state.

Common-pool rescoring owns a private snapshot of one request and candidate pool. It computes the complete uncertainty-endpoint nutrient objective once per exact curve parameter and candidate, then reuses that scalar for preference modes and sensitivity weights. Cross-scores stream to evidence files; losing candidates do not retain full ledgers. Required/core frontier ranking still uses the existing evaluated priority rules. This cache changes neither candidate exploration nor scoring arithmetic.

Score comparisons and ordering use exact rational arithmetic. Report score components use integer or `numerator/denominator` strings, including values too large for exact JavaScript Number representation. Amount components identify their canonical scaled dimension; normalized deviations and penalties are dimensionless. Factual coverage tables use each nutrient's displayed unit. Round display values only; do not round ranks or equivalence checks.

A candidate can have a calculable nutrient score while an active preference component is missing, such as unknown daily pills. Its complete total is null and it remains in the separate incomplete-score cohort. Unknown is neither zero burden nor an eligibility rejection. Reports preserve cohort counts and bounded examples. An empty selected basket also retains a distinct purchase fallback when a complete, eligible nonempty candidate exists.

## Reading the report

The HTML is standalone and includes case/profile filters, factual coverage, doses, preferences, references, uncertainty, exact decompositions, source identities and search evidence. It has no React/browser-service dependency or remote assets. CSV quotes cells and neutralizes spreadsheet formula prefixes; HTML escapes data before rendering.

`baselineDoseLoss` evaluates every displayed basket under the original quantified dose-loss formula. `maxProportionalDeviation` is the largest per-target under/over deviation in that quantified ledger. These descriptive fields retain the case's uncertainty and are not claims that total biological exposure is known.

Neutral comparison uses separate factual axes: product count, pills, goods price, each target's under/over deviation, continued-dose excess and each source-scoped reference excess. Lower is better on each axis. It reports `improved`, `unchanged`, `worsened`, `tradeoff` or `incomparable`; it does not compare sums from different formulas. A missing/unknown axis or a different axis set is incomparable. Consequently, an Anna case with unknown total intake can remain incomparable even when its observed product count or price changes.

Factual before/after values remain visible independently: pills, products, goods price, known coverage, gap, excess and quantified dose-loss summaries. These can support a descriptive shortlist without inventing certainty. A shortlist is a proposal for review, never an automatic production default. Safety references remain advice, and unknown total intake is not certified below a reference.

## Completeness and oracle limits

The independent oracle enumerates only its explicit finite product/dose grid. It does not import production scoring, search, candidate generation or eligibility logic. Units, quantities, intake certainty and eligibility are supplied by the fixture. It rejects oversized enumerations instead of returning a partial oracle disguised as exhaustive.

`exhaustive: true` and `gridOnly: true` establish completeness over that declared finite grid. They do not prove completeness over every physically possible dose or the full retail catalogue. A production search can find an admissible quantity absent from the oracle grid; that difference must be reported with its grid scope, not silently treated as an oracle failure or a global optimum.

Bounded search completeness is separate from score completeness, nutrient-evidence completeness and finite-grid oracle completeness. Preserve all four distinctions. A budget or frontier limit does not become complete because the selected result looks plausible. Expanded effort preserves an incumbent from the same input/profile identity; it is not an automatic test retry.

## Focused verification

`npm run test:matcher:experiments -- --list` lists the reviewed selection without running it. `npm run test:matcher:experiments -- --output /absolute/new/evidence-directory` runs the focused offline acceptance set and writes evidence outside the checkout.

The selection is maintained in `test/matcher/experiment-impact.json`: eight experiment suites (scoring, search, oracle, corpus, report, runner, comparison and pairing) plus five directly affected matcher suites, for 13 files in total (advisory dose fit, flexible doses, priority, options and search). Every affected suite records its connection to the bounded production hooks. The runner rejects unregistered experiment suites, skips, retries and unchecked assertion-bypassing preconditions, and reconciles actual executed cases with the declared inventory.

The runner removes inherited credentials, disables network access, runs one test process at a time, records before/after source fingerprints and requires unchanged source. This command is a focused experiment acceptance run. It does not invoke the full application, PostgreSQL, browser, MCP, connector, deployment or live checkout gates. Its result must not be relabelled as complete product or rollout validation.
