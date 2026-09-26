# Retired admin insights: expectation changes

Baseline: `d1a78fb7185a1074148c6c13d294ee994a8b2fc7`. Evidence is retained outside the checkout at `/root/.codex/deploy/code-quality-20260926/dead-code/`.

`reachability.json` records an AST audit of all 855 tracked application TS/JS modules, including static imports, exports, dynamic imports, and string registrations. Neither retired view has an importer. The only runtime service edge is between the two retired services. There are no nonliteral runtime imports in these modules. Three active catalogue modules use only `AdminProductDecisionStats` and `AdminSupplementSelectionStats`; their exact definitions and supporting `InsightBucketRow` will remain in a type-only module. Repository-wide search also found no tooling entrypoint for these implementations.

The current dashboard already rejects the retired view names. This change removes their implementation; it does not retire an available page, alter recommendation projections, drop schemas, change catalogue data, or change matching. The shared types and all active mapper signatures remain compatible. Archived documentation remains historical evidence.

## Before implementation

- `baseline.tap`: all 77 tests passed across `continuous-improvement-insights`, `coverage-improvement-insights`, `product-recommendation-insights`, `recommendation-selection-projections`, `admin-localization-static`, `product-coverage-workflow`, and `product-card-layout`.
- `retirement-red.tap`: `admin-insights-retirement.test.ts` reports two intended failures (four retired files still exist; active types still import the retired service), one passing authorization test, and zero skips/cancellations.
- RED tests were committed in `e47d6e8a` before the implementation. Failed evidence is retained; it is not acceptance evidence.

## Case disposition

`continuous-improvement-insights.test.ts` retains **replaces product insight pages with coverage and simulator pages** unchanged. `coverage-improvement-insights.test.ts` retains **retires the old coverage improvement dashboard view** unchanged. These preserve dashboard wiring, public view names, and permission expectations. The new retirement suite additionally executes platform/retailer authorization and guards against reintroducing the dead files/type dependencies.

The following tests exercise only unreachable implementations and are retired with them. They are not relabelled as failures or claimed to be equivalent to the current implementation. The last column identifies the maintained business surface and exact coverage retained where applicable.

| Old suite / exact case | Disposition and maintained coverage |
| --- | --- |
| continuous / keeps safe empty data for supplement improvement | Retire unreachable loader fixture; workflow / keeps empty data safe and clamps sample sizes covers the active coverage loader. |
| continuous / keeps safe empty data for product recommendation insights | Same active empty-data case; old product-insight response no longer has a route. |
| continuous / renders managed-list supplement sections without the outside-master-list empty section | Retire unreachable JSX text assertions; workflow / wires dashboard views, read models, and reset guardrails retains current dashboard wiring. |
| continuous / classifies master supplement availability across master and retailer lists | Retire unreachable classifier; workflow / classifies supplement coverage from eligible, pending, dirty and missing states retains the current classifier. |
| continuous / builds deterministic marketplace search phrases and gap checks | Retire unreachable marketplace suggestion helpers; workflow / creates source moves only for true catalogue gaps retains current advisory gap behavior. |
| continuous / keeps coverage helper exports without the retired page exports | Retire internal-export assertion; retirement suite requires removal and preserves current view authorization. |
| coverage / keeps optional recommendation and retail tables guarded | Retire unreachable SQL-reader text assertions; workflow / wires dashboard views, read models, and reset guardrails retains the active reader guards. |
| coverage / calculates average, median, distribution and default low coverage threshold | Retire old insight-only statistics and threshold; current simulator arithmetic remains unchanged and workflow / runs deterministic synthetic simulations without persistence dependencies is retained. |
| coverage / ranks least-matched supplements from demand and diagnostics | Retire unreachable read model; workflow / ranks next moves from simulation unmet demand retains the active model. |
| coverage / classifies master-list opportunities into operational blockers | Retire unreachable classifier; workflow / ranks blocked products by review opportunity without adding them to simulation retains the current advisory classifier. |
| coverage / keeps superficial candidate suggestions out of the overview cockpit | Retire unreachable service/JSX assertions; workflow / keeps optimizer actions advisory for review and source moves remains unchanged. |
| coverage / exposes CSV export fields for plans and least-matched supplements | Retire CSV assertions for unavailable screens; no replacement export feature is introduced or claimed. Retirement/view-registry cases guard their unavailability. |
| product recommendation / classifies outcomes with recommended, near-miss, rejected, not-evaluated precedence | Retire insight-display-only precedence; projections / projects chosen, near-miss, and actionable rejected products remains unchanged. |
| product recommendation / uses selected near-miss and rejected reasons as the row why | Retire unavailable display helper; the same active projection case retains stored reasons. |
| product recommendation / scores product usefulness from chosen rate, coverage, near misses, and rejections | Retire unavailable insight score; this is not matcher scoring and no current matcher assertion changes. |
| product recommendation / marks decisions stale only when product or validation changed after the latest decision | Retire unavailable display freshness helper; active `product-recommendation-freshness.ts` and its projection-suite wiring assertions remain unchanged. |
| product recommendation / builds the read model from all products and ranks near-miss/rejected reasons | Retire unavailable SQL-reader text assertions; active product-card detail/read-path assertions remain unchanged. |
| product recommendation / shows useful products as a descending product-level score graph | Retire unavailable graph/CSV text assertions; current dashboard-view and product-card assertions remain unchanged. |

Two mixed tests lose only dead-reader assertions: **recommendation selection projections / keeps schema and apply script for recommendation insights** removes its read of the retired service and its eleven assertions about that service; all schema, projection, sellability, task execution and freshness assertions remain. **admin DB object titles are rendered through localized translation helpers** removes its dead service read and six dead SQL-join assertions; all current product, supplement, food, review and dashboard localization assertions remain. The localization audit drops only the allowlist entry for the removed view.

The implementation does not delete the live recommendation-selection projection pipeline, its schema/apply script, current coverage/simulator/optimization code, or their behavioral tests. No fixtures, historical baseline files, evidence, database records, or public contracts are changed.

## Implemented verification

The four retired modules remove 5,382 application lines; `lib/admin-recommendation-stats.ts` preserves the three shared type definitions byte-for-byte in 28 lines, giving a net reduction of **5,354 application lines**. Only type-import paths change in the three live consumers.

`green.tap` records 62/62 passing tests, zero failures/skips/cancellations in the same focused baseline inventory after removing the six-case retired product-insight suite and adding the three-case retirement suite. `test-disposition.json` independently compares AST test bodies against the RED commit: 18 mapped retired cases, the two mixed tests changed exactly as described above, and every other retained case unchanged. `lint.log` records a clean scoped lint run. These are focused slice checks; the programme's broader final gates remain separate.
