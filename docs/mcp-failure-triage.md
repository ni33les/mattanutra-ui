# DEV MCP failure triage — 2026-09-06

## Implemented fixes and current validation

The two valid application defects are fixed on local `dev` in separate commits:

- `e01c7aec`: HealthScore delivery and web payment fulfillment work items now use the existing handler registry. Their payload and retry semantics are preserved; behavioral tests cover valid, malformed and missing payloads.
- `ede3698b`: processing revisions retain their original request input, answers and safety acknowledgement. Interrupted requests resume without confusing supplement names with explicit IDs. Legacy drafts with ambiguous name/ID fields recover only from a verified original request; invalid IDs still fail. Completion through a handle poll preserves the original idempotency receipt hash. Cancellation releases only its own full-key entries, so a conflicting follower or late cancelled attempt cannot evict a newer request.
- `dc231478`: removes the obsolete guard requiring the `overwriteIdempotency` helper name. All transaction, catalogue and matcher restrictions remain. A behavioral test checks the original receipt hash and successful create replay after handle polling.

The original `L2-PLAN-RED-08` and registry guard pass unchanged. Eight new recovery tests cover names, explicit IDs, handle polling, legacy drafts, pending edits, invalid IDs, conflicting followers and late completion. Two PostgreSQL tests kill a real process before matching or during terminal persistence, then race two fresh processes against the stored draft. Both retries return the same ready result, with one revision and no order creation.

Optional processing input is stored in existing JSON; no schema migration is needed. It is absent from completed results and public responses. Matching and catalogue requests remain outside database transactions.

Validation of candidate `dc23147841fa681eb39696bcf340297f04bec75a`:

- **Complete maintained MCP suite: 1,094/1,094 passed**, zero failed, skipped, cancelled or todo, in 735 seconds. All 169 source files ran: 165 catalogue/memory/HTTP files (1,076 tests), followed by four isolated PostgreSQL files (18 tests). Test-source hashes and DEV build pins were unchanged throughout.
- **Standalone matcher A/B pack: PASS**, identical canonical runs, all category gates passed, including commercial **50/50**. It imported this local candidate, used read-only DEV catalogue access and mock providers, and neither wrote a baseline nor automatically retried. Denied optional telemetry writes are retained in its log; no DEV database writes were permitted.
- **First combined candidate run: 1,093/1,094 passed**, with only the obsolete helper-name guard failing. Its transaction restrictions and all 18 PostgreSQL tests passed. After the test-only guard correction, the entire pack above was rerun; the first failed run was preserved.

Raw logs, source inventories/hashes, both full-run summaries, standalone results and deployment pins are retained in the task's `mcp-code-fixes` evidence bundle. The final successful full-run results are in `run-2/results.json`.

Typecheck and changed-file lint pass (zero errors; three existing unused-variable warnings). The ordinary production build compiled successfully, then its TypeScript worker was killed with `SIGKILL`. The build passed with the repository's supported split-check approach: a successful separate `npm run typecheck`, followed by `NEXT_BUILD_SKIP_TYPECHECK=1 NEXT_TELEMETRY_DISABLED=1 npm run build`. The failed build log is retained.

No deployment or worker restart was performed. DEV remains `cae12770`; UAT remains `c4a48054`. Local candidate tests include live DEV endpoint checks and read-only catalogue access; write/concurrency tests use isolated PostgreSQL and mock providers. The separately frozen observation/event acceptance pack remains blocked by its missing assets, as documented [here](mcp-observation-event-consistency.md).

## Historical triage

The corrected baseline ran 165 repository test files: **1,068 tests, 1,053 passed, 15 failed, no declared skips**. These 15 failures reproduced on the unchanged application build. Two earlier setup failures (an injected build ID and a missing table in the isolated test database) were resolved before that baseline.

Review against the current contract, source history and focused behavioral checks classifies **13 of the 15 as stale tests or fixtures**. Their assertions have been adapted, with the original safety, determinism and recovery requirements retained. **Two failures were valid**: interrupted plan recovery and task dispatch bypassing the registry. Both are now fixed as described above; their required behavior was not weakened.

Application baseline: `cae1277057aa228588ff2be2684eac7c24fdd79d`, deployed on DEV. Source review began at `d7c9dc4be8924d684066692019feec5c09d3b00e`; its two later commits contain QA preparation only. The initial triage modified tests, the repository QA entry point and documentation. The subsequent application fixes are documented above. Neither stage deployed to DEV/UAT.

## Every original failure

| # | Failure | Verdict and action |
|---|---|---|
| 1 | Slice 0: `does not invent pack servings from a product title` | **Stale.** Explicit quantity notation such as `90'S` is supported by newer pack parsing. Accept 90 for the single-capsule fixture; continue rejecting strength-only, duration-only and unspecified quantities. |
| 2 | `VAL-01/VAL-03` mixed core/conditional target readiness | **Stale.** An unsatisfied conditional target is excluded while core purchases can proceed. Assert that mixed requests are ready, conditional-only requests are `no_purchase`, and target intent/exclusions survive. Use an explicit retail-shaped fixture instead of a live-data early return. |
| 3 | `AGENT-01` requires `option.coverage` | **Stale response shape.** Check compact option summaries and selected-plan basket/coverage/explanation. |
| 4 | `SAFE-01.A` requires assessed codes inside every public option | **Stale response shape.** Assert safety assessment on every internal option and on each selected public plan. |
| 5 | `SAFE-01.B` finds no public option covering omega-3 | **Stale response shape.** Assert coverage and frozen acknowledgement on internal options and their selected public projections. Preserve the prohibition on changing acknowledgement into a cheaper hard block. |
| 6 | `SAFE-01.D` reads missing `option.productIds` | **Stale response shape.** Check actual baskets and exposure: deferred/omitted targets add no proposed purchase or exposure. |
| 7 | `DET-01.A` requires `option.productIds` | **Stale response shape.** Canonical comparison now covers actual published basket products, quantities and prices, compact option economics/roles, coverage and safety. Mutation probes change the source response, not just the oracle projection. |
| 8 | R4 `DUR-01 through REG-06 pass twice on one freeze` | **Stale fixture identity.** Raw A/B responses differed at 35 paths: 20 plan handles and 15 evidence handles. No product, price, safety or economics field differed. Seed the existing test ID provider independently for each fixture run. Keep the comparison strict; do not add hash exclusions. |
| 9 | `UAT-EXEC-RED-02` expects zero permits immediately after releasing a held dependency | **Stale scheduling assumption.** Capacity remains held while uncancellable work is running. Assert occupancy during the stall, independent deadline responses, bounded cleanup after the dependency settles, and no late order creation. The 60-second service and 90-second client clocks are unchanged. |
| 10 | `L2-PLAN-RED-08 cancellation and clean replay` | **Valid defect; fixed in `ede3698b`.** A name-only request resumed with a name in `supplementId`, returning `legacy_id`. Recovery now retains the original name/ID distinction. |
| 11 | First-create source guard requires `hasFullRequest(...) || !planHandle` | **Stale implementation expression.** Assert the current first-create catalogue load and restoration of the previous frozen pin. |
| 12 | `keeps task work-item and result dispatch on handler registries` | **Valid architecture violation; fixed in `e01c7aec`.** `send_healthscore_email` and `fulfill_web_payment` used early branches outside the work-item registry. Both now use registered builders with equivalent payload semantics. |
| 13 | Row-lock allowlist rejects new funnel claim paths | **Stale allowlist.** Enumerate the reviewed atomic payment, capture, delivery and revision-fencing functions with exact call-site counts. Expand detection to include `FOR NO KEY UPDATE`; do not permit arbitrary locks throughout those files. |
| 14 | Worker guard requires a dedicated `activeTaskRows` HealthScore query | **Stale deduplication implementation.** Assert current revision/locale/generator identity and the shared atomic task creator. A real PostgreSQL regression confirms six simultaneous submissions return one task ID and create one row. |
| 15 | Worker guard requires `refreshPaidNutritionReadinessAfterCommit` | **Stale readiness repair.** Completion now locks the assessment and uses the caller's transaction through AsyncLocalStorage. Guard that fence and durable projection event. PostgreSQL overlapping English/Thai completion tests verify blocking, isolation and preservation of both results; existing revision/locale readiness tests also pass. |

The compact option contract was deliberately introduced in `b16d54cb`; the newer `AX2-08` test forbids detailed baskets, coverage and safety guidance on unselected public options. Restoring the old fields to satisfy Slice 5 would contradict that contract. The revised tests continue checking every internal option's safety and each selected public projection.

## Additional runner defects and misleading passes

| Finding | Resolution |
|---|---|
| Standalone commercial `COM-20`: paid but unfinished fulfilment expected `nextAction=none` | Adapt to the current `poll` action, a positive interval and `terminal=false`. Continue requiring paid status and no payment retry. The paid/poll distinction was introduced in `2671ac7c`. |
| Node commercial wrapper reported success despite COM-20 failing | It previously asserted only COM-47–50. It now asserts all 50 case verdicts. |
| Legacy `scripts/agentic-qa-pack.mjs` crashed parsing SSE as JSON | Retire the obsolete standalone assertions. After a temporary parser probe, they also proved dependent on removed telemetry, an old checkout URL and changing catalogue contents; they could print PASS on unavailable data. Replace the executable with the maintained repository suite entry point. |
| Responsibility, evidence and journey tests could return before exercising their named behavior | Replace five early-return paths in the two DET v3 test files with required fixture preconditions. Missing handles or a non-executable fixture now fail rather than silently omit assertions. |
| Slice 5 safety/equivalent-unit checks compared absent `productIds` fields | Compare real option baskets and exposure. These cases no longer pass by comparing `undefined` values. |
| Full rerun: `SUPPORT-RED-06` and concurrent distinct support replies failed with PostgreSQL `53300` | **Environment capacity, not an assertion failure.** Six-connection settings intended for the isolated database also applied to shared DEV reads. The runner now gives remote catalogue reads one connection and runs integration files separately with six local connections. Both support tests pass unchanged with the corrected setting. |

The triage version of the replacement entry point included all **165** previously executed source files plus **assessment revision** and **funnel readiness** PostgreSQL suites: **167 files**. It ran 164 catalogue/memory/HTTP files with a one-connection remote pool, followed by three integration files with six local connections. The two recovery suites added with the application fixes bring the current count to **169**. Failure in the first batch does not skip the second or become a successful overall result. The runner supports `--list` and rejects missing database configuration, non-DEV targets and an unsafe integration database target. Maintained HTTP tests already handle JSON and SSE responses.

Relevant coverage retained from the retired script:

| Legacy concern | Maintained coverage |
|---|---|
| Public tools, questionnaire answers, sticky selections, discovery | `agentic-qa-pack`, DET v3 and AE/C2 suites |
| Dietary rules, safety, coverage and deterministic matching | Nested `agentic/value` and `matcher` suites, R4 pack |
| Request deadlines and latency | `agentic-dev-preheader-lat`, v13/v14/v16 timing suites |
| Execute, paid access, order lifecycle and replay | Full COM-01–50 pack, execute suites, live commerce and PostgreSQL commerce tests |
| DEV endpoint behavior and catalogue | Live R4, live commerce, live retail and DEV pre-header suites |

These are repository regression tests. They are **not** the missing frozen official QA v3 acceptance assets. No protected manifest, frozen hash, release exception or official acceptance expectation was changed. The missing official assets remain a separate acceptance blocker; see [observation/event consistency status](mcp-observation-event-consistency.md).

## Accepted fix plan (implemented)

### 1. Restore interrupted plan recovery — high priority

Keep `L2-PLAN-RED-08` as the regression. Its diagnostic now records the returned error without changing the required successful replay.

The failing path is in `lib/agentic/plan/service.ts`:

1. `draftStateFromPayload` substitutes `item.name` when `supplementId` is absent.
2. The processing revision is persisted before matching/normalization completes.
3. Cancellation leaves that recoverable revision and idempotency receipt in place.
4. Replay resumes it through `requestFromState`, which sends the placeholder as an explicit ID.
5. `normalizePlanRequest` rejects it with `legacy_id` even though the caller supplied a valid name.

Implement a durable distinction between original, unnormalized request input and normalized canonical state. Persist the original name/ID distinction with the processing revision; resume from it using the correct catalogue identity. Handle legacy processing revisions explicitly, without broadly accepting invalid IDs or stripping legitimate IDs from completed plans. Avoid adding network work to the preparation transaction.

Review cancellation ownership in the same slice: matching entries use `planId:revision:requestHash`, while two cleanup paths delete only `planId:revision`. Use the full key and attempt identity consistently, so cancelled work cannot be joined and a late callback cannot remove a newer attempt. This key mismatch is a related source finding; it is not the observed `legacy_id` error's cause.

Validation must cover name-only and ID-based targets/current supplements; cancellation before and after normalization; immediate same-key retry; a different payload conflicting on the same key; old work settling after a new attempt; and process restart with the persisted processing receipt. Run the existing deadline/burst/replay suites and add a PostgreSQL test across two processes to prove one revision/result and no lost newer attempt. Keep current service/client deadlines and safety validation unchanged.

Acceptance: the original name-only request recovers to one ready plan, replay is stable, and invalid IDs still fail correctly.

### 2. Restore work-item registry dispatch — normal priority

Keep the failing guard in `test/system-agents.test.ts`. Move the two email/payment work-item builders into `taskWorkItemHandlers` and route them through the existing dispatch path. Preserve their payload fields, validation, unknown-task fallback and generation revision checks. Do not alter fulfilment or email retry semantics as part of this small refactor.

Add focused behavior checks for both registered builders and malformed/missing payloads, then run system-agent, worker-boundary, delivery, fulfilment and assessment-revision tests.

Acceptance: both task types resolve through the registry with equivalent work items, and the existing dispatch guard passes.

### 3. Validate the combined candidate

Commit those two application fixes separately on `dev`. Run the complete maintained MCP suite with an isolated PostgreSQL database and mocked payment providers, plus typecheck and changed-file lint. The production build has now been validated as described above. A later application rollout still needs deployed commit verification and DEV worker/application smoke checks. No deployment is included in these fixes.

Official observation/event consistency acceptance remains separate and must use the verified frozen assets when available; a green internal suite cannot substitute for it.

## Reproduction and evidence

List exactly what the repository entry point will run:

```bash
npm run agentic:qa:pack -- --list
```

For execution, supply `MATTANUTRA_ENV=dev`, `MCP_URL=https://dev.mattanutra.com/api/mcp`, a read-only DEV catalogue `DB_URL`, and `TEST_DB_URL` pointing to a prepared local database named `mattanutra_lock_review...`. Apply the base, agentic commerce, retail checkout and web funnel schemas **only to that isolated test database**. Set `NODE_ENV=test` and `STRIPE_PAYMENT_MODE=mock`. The runner selects one remote connection and six local connections for both SQL pools; do not increase shared DEV connection usage to exercise local concurrency. Do not globally inject the deployed build ID into unit fixtures; standalone tools that import local application code must use the tested candidate SHA, with the deployed DEV SHA recorded separately. A live-only runner must use the deployed SHA.

```bash
npm run agentic:qa:pack
```

Evidence is retained under `mcp-failure-triage` alongside the original `mcp-full-suite-dev` bundle for this task. The original failure list, raw pre-seeding R4 responses, exact response diffs, legacy-runner probe, PostgreSQL setup correction and subsequent focused reruns are retained. No failed attempt was overwritten to present a clean run.

Historical triage validation:

- **Full 167-file run:** 1,082 tests, **1,078 passed, four failed, zero skipped/cancelled**, in 663 seconds. Test-source hashes were unchanged during execution; DEV build pins matched at start and finish. The four failures were the two valid code issues above and the two support tests stopped by `53300`.
- **After separating pool settings:** support and runner checks passed **29/29**, including both unchanged support concurrency tests. The final isolated PostgreSQL batch passed **16/16**. These are focused follow-ups, not a rewritten claim that the preceding full run passed.
- **Static validation:** typecheck passed. Changed-file lint reported zero errors and five pre-existing unused-variable warnings. The final runner/pool-test edits passed lint with no warnings. TypeScript's existing configuration excludes `test`; the changed TypeScript tests were executed by Node.
- **Application state:** DEV remained `cae12770`; UAT remained `c4a48054`, both responding HTTP 200. No application/worker deployment or production build was performed for these QA-only changes.

At the end of the initial triage, **`L2-PLAN-RED-08` and the work-item registry guard** were the two unresolved failures from the original 15. Both are now fixed. Neither test was marked skipped, removed or changed to accept the defect.
