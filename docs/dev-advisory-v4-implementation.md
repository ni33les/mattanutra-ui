> Historical implementation record. For the current six-tool, single-recommendation protocol, use the [generated MCP client guide](../contract/mcp/11.0.0/README.md). Retired tools, identifiers and response modes described below are not the current public API.

# DEV advisory guidance and MCP v4 implementation

Status: implementation in progress. No release or green-suite claim yet.

## Accepted behavior

- Both MCP and web use advisory clinical guidance; no mandatory safety acknowledgement. Keep explicit customer constraints, known demographic product-fit filters, validation, availability, access/revision checks and payment integrity.
- Keep HealthScore numerical defaults and existing process, including complete current AI advice. Derive clinical evidence from raw supplied answers, never scoring defaults.
- Minimize total normalized dose deviation first: `sum(abs(exposure-target)/target) + sum(newDose/knownContinuedDose for unrequested nutrients) + 2 * sum(max(0, applicableExposure-limit)/limit)` (ratios, where 1 means 100%). User explicitly allows cross-nutrient tradeoffs. Compare agreed daily targets including known continued supplements; penalties start at the target, with no 125% allowance. Extra safety weight is 2.
- MCP v4 daily targets default to explicit `total_daily` (diet + continued supplements + new products); callers may choose `supplemental`, and web food-gap targets use `supplemental`. Legacy internal targets retain their old supplemental basis until explicit refresh.
- Unrequested nutrients with an explicitly known continued dose incur normalized newly added dose above that observed reference; this is not a medical maximum. Estimates/unknowns do not create a reference denominator.
- Unknown intake is unquantified, not zero; estimates retain provenance/ranges. Quantified contribution scores are not medical risk scores. Use applicable nutrient form, unit, population and source scope.
- Then optimize the requested commercial objective. Include valid no-new-product outcomes and explain bounded searches honestly. Alternatives must be distinct, meet unchanged constraints, preserve every target's capped coverage, and improve a concern without worsening another or hiding uncertainty.
- One operational decision drives status, concise advice, recommendation and next action. Technical readiness is not medical approval.
- Contract 4.0.0: one typed registry for complete input/output schemas, runtime validation, examples/docs and checksums. Seven public tools retained; publish guide/schema MCP resources.
- `revise.request` replaces; mutually exclusive `revise.requestPatch` merges objects, replaces arrays, preserves omitted fields, clears exclusions with `[]`, rejects null. Empty patch explicitly supports version refresh. Add product exclusions distinct from nutrient exclusions. Persist original request/provenance at every revision.
- Preserve existing checkout/order identity and idempotency receipts, including unpaid existing checkouts. Legacy unexecuted plans refresh explicitly; no new charge or historical email request.
- Coverage includes all original requested targets (4/5=80%). Savings require equivalent coverage/time/currency/delivery and known baseline facts.

## Work ownership

- Matcher: `advisory_options` owns `lib/matcher` except web adapter and matcher tests.
- Contract/plan lifecycle: `contract_replan` owns agentic contracts, normalization/service/safety/public mapping, MCP resources, dependency additions and contract docs/tests.
- Web: `qa_coverage` owns web adapter, formulation/food guidance, web readiness/checkout/UI and web tests.
- Root: agentic matching bridge, economics, compact/explanation, full test orchestration, integration review and DEV rollout.

## Required completion evidence

Each accepted implementation slice runs focused behavior checks and the full maintained MCP pack. Final gate covers all recursively discovered Node tests (initial inventory 322 files, including 11 PostgreSQL suites), all Playwright specs (initial inventory six files), a second run of every MCP Node suite (including PostgreSQL cases) with identical non-latency outcomes, standalone matcher/contract acceptance twice, types, lint and production build. Fixtures must prevent silent missing-configuration skips. Acceptance retries are disabled; preserve failures, historical artifacts and raw transcripts. Latency is warning-only; functional deadlines/corruption and all non-latency drift fail.

Provision isolated databases/application, mock or test payment providers and an email sink. Preserve unrelated coverage; replace obsolete/vacuous guards with behavioral coverage and record removal mappings. Version intentional QA changes rather than rewriting historical evidence. Frozen historical acceptance with missing assets remains separately unverified.

Commit reviewable slices on dev. Deploy only the complete validated set to DEV, apply additive migrations, restart app/workers, verify exact commit and smoke both journeys in en/th/zh-CN. Leave UAT/production unchanged. Record final release evidence outside the checkout so the validated source identity remains stable.

## Retired duplicate harnesses

`phase1-qa-pack.mjs` and `web-formulation-qa-pack.mjs` now delegate to the maintained full-suite gate. Their old scorecards remain in git history. The former defaulted to UAT and expected medical blocking; the latter included unconditional payment PASS and vacuous empty-basket assertions. Neither scorecard qualifies as current acceptance.

| Previous check | Maintained replacement |
| --- | --- |
| T02 nutrient limits and W-SAFE | Matcher advisory/dose-policy behavior and web advisory tests; limit evidence remains required, clinical blocks do not. |
| T03 score pillars | HealthScore numerical suites and browser funnel recovery; existing numerical defaults stay unchanged. |
| T04 prices and W-PAY | Commerce, signed-webhook, payment/fulfillment PostgreSQL suites, execute replay and browser checkout. |
| T05 named reveal | Browser funnel recovery and reveal typography. |
| T06 public brand, T07 localized product names | Public visible-copy browser check, localization and product-title suites. |
| W-ONE and W-RET | Web adapter and matcher selection tests, including nonempty fixture preconditions and shared retailer constraints. |
| W-VEG, W-ALG and W-MALE | Matcher dietary/source/demographic eligibility regressions. |
| W-FIX | Fixture/catalogue provenance regression suites. |

The full gate runs every discovered suite and rejects missing browser/database fixtures, focused tests, unexpected skips/todos and flaky browser outcomes; retries are disabled.

## Contract implementation and diagnostic evidence

- TypeBox 0.34.41 and Ajv 8.17.1 are pinned. The shared registry publishes and validates complete input and success/error response schemas for all seven tools, with individual create/get/revise/answer/select schemas. Current v4 snapshots include the full input/output checksum; historical v3 artifacts remain unchanged.
- Original validated requests are retained on revisions. Product-exclusion patches preserve targets and disclosed medication context; nested objects merge, arrays replace, `[]` clears, and null is rejected. Legacy unexecuted plans expose explicit refresh while existing checkout/order recovery is preserved.
- Unknown or unoffered question choices are rejected before writing a revision. Only caller-explicit conditional prerequisites produce prerequisite questions. Health advice, including unknown context, is localized and requires no acknowledgement.
- Connector resources publish complete schemas and a short guide with executable request templates. `scripts/run-published-mcp-client.mjs` uses HTTP and published schemas/examples only, writes raw transcripts and declared semantic normalization, and supports external fixture payment followed by receipt-based order polling.
- Maintained live helpers support an explicit isolated candidate with `MCP_ISOLATED_CANDIDATE=1`, a numeric localhost HTTP port, and equal `DB_URL`/`TEST_DB_URL` for a localhost `mattanutra_lock_review*` database. Ordinary DEV public/origin/QA checks remain the default; UAT is rejected.
- Focused contract/operation/copy/isolation tests: 31 passed, 0 failed, 0 skipped in `/tmp/contract-v4-extra2.tap`. Changed contract code lint: 0 errors (pre-existing warnings remain). These focused runs do not replace complete candidate acceptance.

- Additional owned diagnostics: 70/70 contract/schema/transport/P1 cases in `/tmp/contract-v4-validated.tap`; 23/23 precision/provenance contract cases in `/tmp/contract-v4-frozen.tap`; gate preflight/proof checks 4/4 in `/tmp/contract-gate-preflight.tap`. All use isolated/local fixtures; these are diagnostic evidence, not the required full acceptance.
- `npm run validate:dev:advisory` prepares verified assets, checks types/lint, builds and runs the local candidate, all Node/PostgreSQL/browser suites, full matcher A/B and documented HTTP client A/B with external mock event settlement. Its immutable artifact manifest and source identity are required for reusing a passed gate. Candidate/test processes cannot contact external services; provider credentials are blank during the build.
- Final owned contract/gate diagnostic: 30 passed, 0 failed/skipped/todo in `/tmp/contract-v4-final-ready2.tap`, covering current snapshots, provenance/precision, patch compatibility, all tool responses, incomplete-inventory schedule suppression and strict isolated candidate/proof preflight. Require the complete candidate attestation before deployment.
- Final contract/bridge batch: 32 passed, 0 failed/skipped/todo in `/tmp/contract-basis-final.tap`. Covers per-target basis, continued-dose advice, localized uncertainty hash invariance with preserved missing-evidence distinctions, positive retained-stock validation, complete delivered-cost differences and contract snapshots. Scoped lint: 0 errors (9 existing warnings). Current v4 checksum `0540e9fd2bd0acc9b096ab25b536924f17992e836d0eb0040936d1f2e673722b`.

### Browser diagnostic repairs: library geometry and local image optimization

- The 35 current canonical hand-off articles retain the archived hero design. A later body stylesheet had applied plain-grid hero geometry to all staged articles, causing 97 desktop/mobile parity differences. Removed duplicate global hero/bubble geometry, kept slug-aware rules in `globals.css`, scoped the narrow mobile gutter to the eight plain-grid articles, and removed blanket specialty illustration limits. No parity tolerance or baseline changed.
- Next internal image requests omit the Host header. HTTPS policy now falls back to the constructed request URL host only when that header is absent; supplied public hosts retain precedence and public/unidentified HTTP still redirects. This fixes valid local WebP assets being redirected before image optimization.
- Validation: all 35 articles × 2 viewports passed the unchanged archive parity assertions using a diagnostic body-CSS response overlay (6.3 minutes); library structure 7/7 and HTTPS policy 11/11 passed; changed-file lint and CSS parse passed. Final production-build browser gate still required, with optimized-image naturalWidth assertions maintained by QA. Evidence: `dev-advisory-v4/library-parity-review` under this thread visualization directory. No owned browser/test processes remain.


### Final consistency and hygiene repairs

- Requested measured nutrient contributions remain in the coverage ledger even below 10% of a target; presentation list limits never truncate those quantities.
- Every objective explores the same bounded candidate frontier before applying its commercial tie-break. This restores the live dose-first quality gate without lowering its threshold.
- Consumption totals round once using exact decimal-input fractions; retained-stock refill quantities use exact dose ratios. Large rational dose scores serialize finite numeric values while ranking remains exact.
- Replanning carries the viewed locale and generation identity transactionally. Retail provider session creation freezes request parameters and uses payment-bound idempotency, with terminal-state protection and existing-order recovery.
- The full lint path remains enabled. Removed PostgreSQL store type suppression without changing emitted JavaScript, removed synchronous derived-state effects, and renamed non-React test-clock imports to avoid false hook classification. Existing related behavior tests passed 23/23; central typecheck passed after correcting fixture and intake union types.
- Final acceptance replays all discovered MCP Node suites (including PostgreSQL cases), compares every non-latency outcome, and separately compares rich matcher reports and full documented-client transcripts. Source identity includes all nonignored tracked/untracked files, including assets and handoffs. Final acceptance and deployment evidence is written outside this checkout.

### Final bounded form-alias review

- Reproduced supported aliases losing their explicit target form when the catalogue resolved a family concept: MK-7 selected cheaper MK-4, D2 selected D3, folic acid selected methylfolate, and magnesium glycinate selected oxide. The four pre-fix regressions captured actual wrong product IDs.
- Normalization now uses the existing shared form-identity groups to retain a canonical explicit target form when a family catalogue name would broaden it. General and localized aliases retain their catalogue names. Original requests remain intact through JSON storage and requestPatch; current matcher and coverage guards receive the explicit form. No schema/checksum change.
- Validation: form roundtrip, nutrient identity, bridge and existing v4 contract 29/29 passed. The initial normalize-import batch passed 37/38; its obsolete phase6 expectation of zero measured B12 was replaced with the actual 7.2 mcg / 3% contribution and remaining gap. The subsequent measured-coverage batch passed 20/20. Lint: 0 errors / 4 existing normalize warnings. Evidence: `dev-advisory-v4/form-alias-review` and `/tmp/advisory-measured-coverage-final.log`.

### First complete diagnostic and resulting corrections

- The first unique Node pass recorded 2,079 tests: 2,064 passed, 7 failed and 8 cancelled; all 65 PostgreSQL tests passed. The parallel 28-case browser run passed 27, with one obsolete tag-display assertion. No tests were skipped. Failed evidence remains under `dev-advisory-v4/acceptance-1` and `browser-parallel-diagnostic-2`; this deliberately interrupted diagnostic is not release acceptance.
- Replenishment fixtures now supply the product identity and pack size needed for exact pricing. Interruption fixtures use positive retained stock and fail explicitly if validation returns before the interruption point. The prerequisite fixture declares its intended eight-product allowance instead of assuming the default six-product limit covers eight targets.
- Build-identity tests control and restore injected metadata rather than assume it is absent. Provider isolation clears arbitrary API keys, while the existing production-provider guard remains enabled. Web adapter tests distinguish unknown-profile advice from applicable adult limits, and retain the stronger above-limit penalty and advisory access behavior.
- Compact advice removes only identical complete rows. Distinct exposure, reference, severity, contributors, uncertainty and evidence remain visible. HTTP discovery reads the same contract version as RPC and published resources.
- New quotes, budgets, loss certificates and frozen orders count purchased packs; increasing daily servings does not multiply the price of that same pack. Existing unpaid and paid orders retain their original frozen amounts and provider session. Public client checks reconcile each line, subtotal, delivery, tax and total.
- The documented client also demonstrates actual 80% per-target dose coverage, an explicit customer-choice revision and a returned answer. It checks preservation of target amount/unit/basis, medication context and the retained product. The complete two-run comparison normalizes declared generated event/order identities consistently, including prose and checkout URLs, while preserving quantities, advice, prices and identity relationships.
- The final authoritative result is the immutable complete acceptance attestation and deployment evidence outside this checkout. A diagnostic pass or repaired individual test is never substituted for that gate.

### Purchased-pack regression migration and promotion scope

- The second full diagnostic passed all 65 PostgreSQL and 28 browser cases, the rich matcher pack twice, and both complete documented-client journeys with identical non-latency results. Thirteen wider-suite expectations still encoded the old daily-serving price multiplier; the failed attestation remains preserved under `dev-advisory-v4/acceptance-2`.
- Historical fixture prices remain unchanged. At equal exact dose fit and four pills, the generic omega request now chooses the 610 THB combo/algae purchase over the 650 THB combo/fish purchase. Explicit exclusion of the algae product retains the fish option and remains tested. Balanced standalone D3 and lowest-cost vitamin C use two servings from one cheaper purchased pack. Assertions retain exact dose, coverage, product count and price requirements. Public shipping checks reconcile actual line totals even when a fixture aggregate is stale; frozen existing orders retain their original amounts.
- The latest explicit user instruction authorizes promotion to **DEV and UAT**, superseding the earlier DEV-only restriction in this worklog. Require the complete green gate first, then validate DEV before promoting the same final commit to UAT. Production remains unchanged. Final environment identities, migration outcomes and smoke evidence belong outside the validated checkout.

### Cold-worker regression hygiene

- The third diagnostic completed all 2,096 application tests (2,095 passed, one failed) and all 65 PostgreSQL tests (passed), with zero skips. It was deliberately stopped before replaying a known failed source; its failed attestation and stop reason remain under `dev-advisory-v4/acceptance-3`. All thirteen purchased-pack expectation corrections passed in this complete first pass.
- `CAP-RC-RED-03` had compared two unscoped `getCatalogueSnapshot()` calls after leaving the worker sessions. Those calls create empty fallback snapshots with wall-clock timestamps, so the assertion could fail on a millisecond boundary and did not verify cold-worker sharing.
- The maintained case now compares the actual frozen catalogue manifests returned to all three workers, rejects missing/loading catalogues, requires distinct run namespaces, and checks that exactly one initialization occurred even after the previously unready worker joins. Its existing test ID and all six capacity/cancellation cases are preserved. The corrected focused suite passed 6/6; release still requires a new complete unchanged-source acceptance run.
