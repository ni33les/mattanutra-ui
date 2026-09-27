# Scoped expectation and instrumentation changes

Historical evidence and prices are unchanged.

- `AXR-REL-03` recovery: inject the lost checkpoint at `patchClaimedOperation`, the new atomic database boundary. Preserve the 24,000 acknowledged + 4,000 reserved assertions, revision fencing, 64,000-attempt terminal result and exact idempotency replay.
- That case predates conversation-by-default. Its replay comparison now explicitly requests `responseView: full`, matching the internal executor result it has always compared. The first candidate run demonstrated the stale full-versus-conversation assertion; no product result assertions were removed.
- HTTP admission now leaves execution to durable task workers. Consumer harnesses must explicitly dispatch admitted tasks rather than rely on an HTTP-owned executor.

- Worker completion telemetry distinguishes a deferred reservation from completed work. The boundary guard now requires the conditional `task_completed`/`task_deferred` event mapping; its original case ID and all other worker-boundary assertions remain.

- Efficiency status reads intentionally stop admitting missing generation tasks. The existing explicit refresh/retry operation owns that recovery; a read of missing work reports pending without asserting that a task was scheduled. The read benchmark seeds identical admitted work before comparing the two implementations. `EFF-FUNNEL-PG-01` proves a bare missing-work read is nonmutating under contention.
- The browser recovery interceptor follows the unified `journey?locale=` transport. Its capture counts, advice gate, email persistence failures and retry assertions are unchanged. The three numeric-preference browser scenarios remain maintained but are excluded from this infrastructure/polling package; their code is unchanged.
- `EFF-CACHE-06` uses an actually unavailable empty reference set. Merely setting the unavailable flag while verified cached references remain present does not make those references unavailable; the first test setup was invalid and is not claimed as reproduction evidence. The corrected RED is `cache-availability-red-corrected`.
- `01-production-green` was superseded when a new test was added during execution; its inventory mismatch is recorded as a failed attempt, never as a passing attestation. The stable replacement evidence is `refinements-measurements-red` and `refinements-measurements-green`.

- EFF-TXN-PG-02 now compares exact checkpoint bytes independently of base64 transport. BYTEA reads remain binary; historical JSON/base64 readers stay supported.
- EFF-CACHE-07 initial attempts used an invalid short idempotency key and were prerequisite failures, not product RED evidence. The corrected real-worker test proves two owners coalesce and a third reuses completed matching facts without sharing capability access.

- Final inventory includes the existing completed no-purchase reveal browser regression (ten affected browser cases in total). `acceptance-1` was deliberately interrupted to correct its omission before deployment; its partial execution is not an attestation.
- `acceptance-2` passed 150 affected cases, paired semantic benchmarks and typecheck, then failed the release lint rule forbidding a local variable named `module`. The binding was renamed without changing assertions. Queue/execution diagnostics were added to the benchmark before the final retry; missing or incomplete dispatch probes now fail the comparison proof (EFF-PACK-05).

- `acceptance-3` passed all 151 affected tests, both benchmark runs, typecheck and release lint. The 6 GiB webpack heap exceeded the resized 8 GiB host's available memory and was killed by the OS. Efficiency builds now use a 4 GiB heap and one build CPU; runtime matching CPU/search budgets and database pools are unchanged. The failed build is retained as environment/resource evidence.

- `acceptance-4` passed 151 cases but exposed asynchronous setup queries contaminating the funnel benchmark's global SQL counter (22 counted SELECTs for 20 one-query polls). EFF-PACK-06 reproduces cross-scope attribution (2 versus 1). The benchmark now measures consumed queries in the polling request's own async scope, including transaction boundaries; setup work is excluded on both control and candidate. Structural limits are unchanged. The gate completes compilation and browser checks before running the paired benchmark matrix.

- `acceptance-5` passed 152 cases, typecheck and release lint, then the kernel again killed the compiler at approximately 6.4 GiB RSS despite the smaller V8 heap. A temporary 4 GiB build swapfile addresses native/compiler memory on the resized host; no runtime limits changed. `acceptance-6` was stopped before compilation after final review found worker aggregates were collected but not published. EFF-MET-05 locks application and external-worker startup wiring to the already behaviourally tested bounded reporter; its RED evidence is `worker-report-wiring-red`.

## Matcher hot path — 11 September 2026

EFF-HOT-01–09 add structural efficiency and compatibility assertions without
changing historical matching outputs or prices. The final productive chunk now
sets `done=true` immediately instead of requiring a zero-attempt continuation;
old checkpoints remain readable, and all attempt budgets and recovery semantics
are retained. Stable top-K selection must return the same ordered prefix as the
previous complete sort. Full result equality is independently recorded against
the frozen D3 control. The scoped consumer inventory is
`matcher-hot-path-impact.json`; this is not full-application acceptance.

- REF-CPU-03 experiment (2026-09-12): retain the independent arithmetic-reuse assertion; withdraw the added whole-score object-identity assertion. Its bounded value-key memo increased the uncached Daniel diagnostic from 3404ms to 3660ms, with unchanged result identity. The experiment and RED evidence remain in git and the external refinement-speed evidence; this cache is not retained.

- REF-CPU-01/02/11 now exercise explicit numerical entry points, followed by explicit retained-result materialization. The lazy-DTO prototype is replaced with plain numeric records; exact arithmetic, display assertions and checkpoint DTO compatibility remain unchanged. REF-CPU-12 records its failed plain-record assertion in numeric-records-red.log. Daniel's full uncached result hash remains `19da5fc035e6d875de91ea2e0f440246f5692d155acd971ac48d12edec1731cc`.
- REF-CPU-17/18 experimental allocation contracts (2026-09-12) were withdrawn with their unshipped implementations: skipping proved-zero incidental terms and compiling endpoint combinations showed no improvement in bounded warmed Daniel timings. Their RED/GREEN logs, candidate patch, exact-result hashes and discard receipt remain outside the checkout in `mcp-refinement-speed-20260912/unretained-zero-endpoint-experiment.json`. The endpoint test's omitted `total_daily` prerequisite was corrected and rerun on both sources before evaluation. Existing maintained intake, reference, scoring and uncertainty assertions are unchanged; no passing release is claimed for these experiments.
- REF-CPU-21 name-normalization memoization was also withdrawn before release: structural RED/GREEN passed, but warm compilation and complete calculations did not improve consistently. The candidate patch, timings and discard receipt are preserved in `unretained-name-normalization.json`. The existing directional-form eligibility assertions in `test/nutrient-identity.test.ts` are unchanged; no new name cache is retained.
- REF-CPU-19/20 resident archive representation was withdrawn before release. Some warm trials improved, but terminal compressed checkpoints increased from 782,215 to 956,129 bytes and cold calculation remained 2.38 seconds. That trade-off does not demonstrate the required native publication improvement. Keep the original packed checkpoint format/readers and all original recovery assertions. RED/GREEN, the candidate patch and the discard decision remain in `unretained-resident-archive.json`; the two tests added exclusively for the unshipped representation are withdrawn with it.

- Performance programme, 2026-09-26: withdrawing optional unreduced `multiply` components and their four representation assertions from REF-CPU-04. All original neutral-operation and exact arithmetic assertions remain. The UAT-resource-bounded diagnostic did not improve (last two trials 2,413/2,399 ms versus 2,247/2,254 ms before). RED/GREEN evidence, complete unchanged result hashes and the patch remain in `/root/.codex/deploy/performance-20260926/weighted-sum-*` and `unretained-weighted-components.patch`. These timings are kernel diagnostics, not native release acceptance.

### 2026-09-26 — prepared web/pharmacy checkout fence

`PRACTICAL-CHECKOUT-03` now asserts that product rows and recommendation/advice
JSON are prepared before the existing catalogue fence. The RED execution made
three publication SELECTs; the candidate makes two narrow SELECTs. All prior
catalogue, revision, ownership, replay and eight-line financial assertions remain.
`V5-CHECKOUT-PG-01` also checks assessment, exclusion and latest-run drift after
preparation. The internal prepared proof is not a public response field.

The isolated pharmacy consumer checks exposed missing fixture ownership context
and a contention test attempting two sessions through a one-connection pool.
They now create their own second pharmacy and use an independent writer session.
Neither prerequisite is skipped; the timeout and complete row-equality assertions
remain. Original failed executions are retained outside the checkout.

### 2026-09-26 — cursor identity and exact reduction experiments

`REF-CPU-14` now rejects redundant serialization of compiled seller quantities.
The complete parent catalogue/request/configuration identity scopes each seller;
standalone cursor identities and all previous checkpoint readers remain intact.

`PERF-CPU-07` preserves wide-integer arithmetic and rejects temporary iterable
pairs in Euclidean reduction. Two safe-integer-remainder experiments had exact
matching outputs but did not improve the constrained-worker measurements. Their
patch/timings remain in evidence; the Number fast paths were withdrawn. The
shared implementation retains BigInt arithmetic and a scalar remainder loop.

- PERF-CPU-08 incremental parent-score prototype withdrawn before release: all 69 affected assertions passed and Daniel retained its exact result identity, but constrained warm trials (2615/2269/2513 ms) did not improve over the retained implementation (2338/2083/2405 ms). The additional WeakMap and delta bookkeeping are removed. RED/GREEN and the patch remain in performance-20260926 evidence; existing scoring and recovery contracts remain unchanged.


### 2026-09-26 — bounded numerical and checkpoint overhead

- `PERF-CPU-09` indexes append-only physical quantities without changing their order. Dynamic quantities remain visible, and replaced immutable arrays retain separate identities. Original prices and supported quantities are unchanged.
- `PERF-CPU-10` materializes each raw-dose leader's comparison facts once and selects the same stable completion prefix. The independent former algorithm remains in the regression case; no ranking expectation was weakened.
- `PERF-CPU-11` shares equal contribution/exposure maps and removes a temporary merged map. Incidental exposure remains separate from requested contribution; parent states stay immutable.
- `PERF-CKPT-01/02` omit obsolete frontiers from completed/advanced phases only. Archive, active jobs, old checkpoint reading, expansion order and attempt accounting remain covered.
- `PERF-CPU-12` moves completeness/preference presentation metadata out of numerical evaluation. Exact penalty components and unknown actual/lower-bound reporting remain unchanged.
- `PERF-PACK-01` replaces retired operation/responseView benchmark inputs with the current handle-only public request. Internal lightweight projection measurements are explicitly separate from full public decision retrieval.

RED/GREEN logs and source-bound frozen comparisons are retained under
`/root/.codex/deploy/performance-20260926/`. The first phase-frontier selection
named two nonexistent files; its zero-exit result is rejected by execution
reconciliation in `phase-frontiers-incomplete-selection.json`. The corrected
five-file selection executes 29 cases with no skips or retries. Benchmark reader
execution currently requires a matching compiled application identity; its
failed startup is preserved and is not read-performance evidence.

### Catalogue dry-run writer-guard removal (PERF-LOCK-09–10)

- A catalogue dry-run must not acquire the writer advisory guard. The maintained
  PostgreSQL RED run fails on the former unconditional guard while a controlled
  writer holds it. GREEN uses a database-enforced read-only connection with a
  nonempty existing product; apply still fails fast under the same guard.
- The register now distinguishes this maintenance guard from the independent
  per-nutrient reference guards. No data or live catalogue synchronization ran.
- Evidence: `catalogue-dry-run-maintained-red.tap` and
  `catalogue-dry-run-green.{tap,events.jsonl}` in the performance evidence root.

### Benchmark baseline identity (PERF-PACK-02)

The benchmark caller must supply a clean control worktree and exact source SHA.
The report uses that identity and the verified 2-GiB runtime, not the retired
7.2.4/a28f3b27/1-GiB labels. Previously achieved structural reductions remain
hard no-regression checks against a newer control; the independent native
sub-second release gate is unchanged. RED/GREEN evidence is in
`benchmark-control-{red,green}.tap` with GREEN execution events alongside it.

### Retired permit counters and real lifecycle checks (PERF-LIFETIME-01)

The unused synthetic permit scheduler is deleted. Production requests had no
remaining acquisition calls, so its zero counters could not prove cleanup.
Affected cases retain their IDs and now inspect actual observed-request
ownership, including cancellation before dependency cleanup finishes. Held
requests prove independent admission beyond the retired 32-permit ceiling.
This is request-lifetime evidence, not a replacement for PostgreSQL, thread
capacity or durable ownership tests in the lock register.

The first consumer run omitted the isolated catalogue environment; its 13
UAT-NL prerequisite failures remain recorded. With the required environment,
all 15 cases in that file pass. No empty fixture or automatic retry was allowed.
RED and both consumer executions remain in `retired-permit-*` evidence.

### Completed-cursor test observation (V5-SEARCH-06)

Complete application acceptance exposed an assertion inspecting a frontier
after intentional terminal cleanup. The test now records the practical
incumbent when that phase begins, preserving the original priority assertion.
Exact residual quantity, physical increments, one-attempt accounting, archive
score and checkpoint equivalence assertions remain unchanged. The original
failure and five-case GREEN run are preserved in `acceptance-1` and
`residual-cleanup-green.*` respectively.

### Complete acceptance database prerequisite (PERF-PACK-03)

The full runner now rejects a database name outside the stricter PostgreSQL
inventory prefix before execution. The original run's 28 failures were database
prerequisite rejections; a fresh isolated clone created by the maintained helper
executes all 71 cases in those 20 files successfully. Original failure evidence,
clone identity and execution reconciliation remain in `postgres-correction`.

### Endpoint allocation and immutable compilation (PERF-CPU-13–14)

The endpoint evaluator preserves full weighted losses and stable endpoint ties
without temporary sets or Cartesian arrays. Shared immutable compilation uses
the existing eight-MiB fact cache, with complete request/catalogue/reference,
environment and effort identities. New calls still own separate cursors and
execute their search attempts; this does not constitute completed-match reuse.
Changed inputs and reset invalidate the compiled entry. Dynamic quantities
cannot alter another search's compiled inputs. Frozen result/timing comparisons
remain a separate release requirement.

### Final preparation, 26 September 2026

- PERF-CPU-14 shares compiled product groups only. Each execution retains its own
  canonical request and numerical cache lifetime; recovery still uses the
  acknowledged checkpoint. `compiled-groups-consumers` records 48 passing cases.
- PERF-PACK-04 caught a fixture-owned cross-store pharmacy persisting after the
  integration file. Teardown now deletes only that owned ID and compares every
  original organisation row exactly. The original full-run catalogue fingerprint
  failure remains preserved; the verifier was not weakened.
- Two further unshipped allocation experiments (routine-value memoization and
  request-owned strong numerical maps) retained exact results but lacked a
  consistent latency improvement. Their changes and exclusive allocation cases
  were reverted; RED/GREEN logs, patches and rejection receipts are retained in
  the external evidence directory. Existing arithmetic cases are unchanged.
- The completed full run is recorded as failed. Subsequent execution evidence
  replaces affected whole files, never individual failed cases. Database-prefix
  corrections, active-frontier observation and fixture cleanup are explicit
  corrections, not automatic retries. An evidence reconciliation does not turn
  the original run into an unchanged-source green attestation.
- Fresh standard calculations remain above the 1,000 ms native terminal gate.
  Kernel timings cannot satisfy that gate. No release-ready or deployment claim
  is permitted while it remains unmet.

### Compilation-cache withdrawal

PERF-CPU-14 and its unshipped implementation are withdrawn together. The
structural cases passed, but frozen comparisons showed no consistent overall
latency improvement, and successful identical requests already reuse completed
work. The original fact cache and request-owned resident compilation remain.
No scoring, input-isolation, checkpoint or historical arithmetic assertion is
removed. RED/GREEN logs, the candidate patch and its rejection receipt remain
outside the checkout. The earlier compilation entries above record the
experiment's history rather than a retained release feature.

### Exact score ownership (PERF-CPU-15)

One score now holds its exact total, component terms and target deviations in
one weakly owned record. The RED case observed three registrations for the same
score; GREEN requires one and preserves public score fields and exact safety
arithmetic. The first paired frozen comparison preserves all result hashes and
8,000 attempts. Daniel improves in each warmed comparison; D3 is mixed, so this
is not claimed as a universal latency improvement or the sub-second gate.

### Numerical work retained after source a8f721d9

PERF-CPU-16 and 18–24 preserve exact basket results while removing repeated
quantity scans, per-endpoint deviation construction, concern-map reconstruction,
fixed quantity-basis reconstruction, endpoint sets and variant-fact sorting.
The serving lower-bound comparator skips full arithmetic only when an exact,
validated nonnegative component already proves that a candidate loses.

Internal numerical records now contain exact facts only. Rounded display totals
and serialized fractions are produced for retained public results. PERF-CPU-15
therefore expects zero auxiliary weak records instead of one; PERF-CPU-18
expects zero warm display conversions instead of five. Independent public
arithmetic, uncertainty, safety and serialization assertions remain intact.

The uncalled requestWithoutOptionalPurchases identity shim and orphan
salvagePartialBasket search are removed after repository-wide caller review.
The existing bounded search, repair, quantity and oracle consumers remain.

The profile-ownership, symbol-backed facts and larger endpoint-window experiments
were withdrawn after frozen comparisons failed to show useful improvements.
Their patches and RED/GREEN/benchmark receipts remain outside the checkout;
exclusive structural assertions were withdrawn with those implementations.
The endpoint bound stays at 256. No arithmetic or behavioural case was removed.

The reviewed hot-path inventory now includes all 38 numerical cases and directly
affected dose, quantity, reference, recovery and MCP weight consumers. The main
inventory's checkpoint count is corrected from four to five to include the
already-maintained PERF-CKPT-02; no case is skipped. Frozen whole-result hashes,
attempt counts and native terminal timings remain separate release conditions.

### Repeated numerical work and unused helpers

PERF-CPU-26–28 and 30 cover one quantity-group lookup per candidate, reuse of
normalized endpoint components, exact identity/common-denominator comparison,
and canonical units bypassing the alias parser. Complete display values,
wide-integer ordering, uncertain endpoints and independently weighted safety
penalties retain their existing assertions. PERF-CPU-29's additional aggregate
record sharing was withdrawn because all D3 trials became slower; its test,
implementation, RED/GREEN evidence and withdrawal receipt remain in history.

Repository-wide caller review found no consumers of remainingRequestedUnits,
compareScaled, unitsOrZero, paretoPrune, groupProduct, selectedProducts or the
old exposureExceedsCeiling/stackUnitsViolateCeiling/variantDedicatedOvershoot
veto chain. Remove these orphan implementations, not the active factual safety
evaluator. No historical case or active safety assertion is removed. Direct
advisory, life-stage, rational and MCP consumers join the reviewed inventory.

One canonical-unit benchmark overlapped a source census. Its semantic hashes
remain useful, but its timing is explicitly excluded; the bounded final-source
measurement replaces timing only. This is not a discarded functional failure.

The 80000ff1 consumer run found one wiring assertion that still required
tryAddVariant in the selector's removed, uncalled greedy fallback. The same
case now requires shared revalidation/dose scoring and forbids that duplicate
addition path. All three behavioural life-stage/stack cases, including exact
50 mg zinc against a 40 mg reference, remain unchanged. Preserve the original
216-case failed run and replace only this affected whole file's execution.

### Final allocation and worker refinements

- PERF-CPU-31 retains the same stable minimum for each remaining-gap pattern;
  only those representatives are sorted. PERF-CPU-33 compiles preference scales
  once per immutable request. Exact frozen results and attempt counts agree.
- PERF-CPU-35 resolves requested contributions once when counting incidental
  labels. PERF-CPU-37/38 use native server SHA-256 and preserve the tested browser
  fallback, original UTF-8 vectors and complete hash identities.
- PERF-NATIVE-01/02 correct the isolated external executor: prepare real matching
  threads before readiness, and use production wake notifications while idle.
  The old 100 ms claim loop introduced artificial database contention. Production
  queue capacity, leases, periodic recovery and deadlines are unchanged.
- PERF-LOCK-41/42 remove speculative worker expiry writes. Only a known overdue
  operation attempts retirement; atomic claim still checks its deadline. The
  PostgreSQL cases prove healthy claim, completed replay and overdue cleanup.
- Exclusive experiments PERF-CPU-32, 34, 36, 39, 40 and 43 are withdrawn with their
  unshipped implementations. Basket/state identity caching, raw-dose partial
  retention, early practical bounds, tiny-key sorting and eager product-label
  classification did not demonstrate sufficient benefit. Original arithmetic,
  priority, catalogue, quantity and recovery assertions remain. External patches,
  RED/GREEN evidence, timings and withdrawal receipts preserve the investigation.
- An initial classification fixture used inconsistent manually edited quantities;
  its corrected RED uses real one-/two-serving variants before implementation.
  Two manually invoked test commands named nonexistent companion files. Their
  incomplete execution was recorded and corrected by running the actual maintained
  whole files. Reviewed final execution rejects missing files and case mismatches.
- The native publication probe now timestamps the existing measurement after
  the publication transaction resolves, then verifies a ready native read. Task
  bookkeeping is measured separately. Three D3 diagnostic trials remain above
  one second (1.71–1.97 s); neither later bookkeeping nor polling intervals are
  used to hide the failed gate. No deployment is authorized by this evidence.

The a386a737 focused run passed all 253 executed cases but failed reconciliation:
refinement-consistency had five additional nested validation cases missing from
its reviewed count (16, not 11). The inventory now includes them; preserve that
failed proof and replace the whole file's execution. PERF-LOCK-41 is strengthened
to use an already-expired completed receipt, exposing a second redundant cleanup
write. Terminal status is now returned before considering expiry; active overdue
work still takes the tested conditional retirement path.

- PERF-CPU-44 cursor-owned archive-map experiment withdrawn: exact frozen results and 45 cases passed, but repeated adjacent-control timings did not demonstrate consistent improvement. Preserve the patch, meaningful RED/GREEN, timing results and withdrawal receipt outside the checkout; remove only the experiment-exclusive allocation assertion. Its first unavailable-loader invocation is retained as invalid harness evidence.

- PERF-CPU-45 shared-denominator micro-optimization withdrawn with its exclusive structural assertion: exact arithmetic and frozen outputs passed, but its timing benefit was not demonstrated. RED/GREEN, patch and timing evidence remain outside the checkout.

- PERF-MEM-01 live frontier cache eviction withdrawn: it reduced retained memory and preserved all candidate values but reconstruction slowed seven of eight frozen trials. Preserve the experiment and RED/GREEN externally; retain the current cache lifetime for latency.

- PERF-CPU-46: repeated material-difference checks must reuse immutable basket identity while keeping seller-only differences equivalent and physically different quantities distinct. RED performs 400 sorts for three baskets; the expected work is three. No choice eligibility, order or scoring change is intended.

- PERF-CPU-47 dedicated-product memoization withdrawn after exact result parity but increased total CPU and five slower frozen trials. The narrower cache did not justify another retained ownership structure. Patch and RED/GREEN evidence are preserved externally.

- PERF-CPU-48 nutrient lower-bound experiment withdrawn: independent proof, invalid-input handling and exact frozen outputs passed, but total CPU remained unchanged. Avoid retaining extra comparison branches without a timing benefit. Evidence remains external.

- PERF-MEM-02 completed-cache eviction withdrawn: it reduced heap but slowed seven of eight trials. The initial candidate test overclaimed empty-seed identity (seeds were never interned); its corrected nonempty identity prerequisite and full recovery assertions passed. Preserve original failed execution, corrected GREEN, patch and timings externally; no cache lifetime policy changes remain.

- PERF-CPU-49 integer-value interning withdrawn: exact immutable reuse passed but did not improve frozen calculation latency. Retain the smaller existing conversion path and preserve the allocation experiment externally.

- PERF-CPU-50 coefficient-normalization experiment withdrawn: hand-calculated exact component values and full hashes passed, but total timing/CPU improvement was not demonstrated. No normalization policy change remains.

- PERF-CPU-52 getter-based presentation deferral withdrawn after exact parity but higher total CPU. Keep plain basket records; no lazy getters remain. Patch and RED/GREEN remain external.

- PERF-CPU-53 removes three private ScoredBasket counters with no production readers: dedicatedPartialCount, titleExactCount and oversupplyScore. Active doseFit, coverage, advice, priorities and customer projections remain unchanged. Historical phase-2 and phase-3 tests still inject obsolete metadata to prove it cannot override active ranking; only their fixture type carries those optional historical fields. The phase-6 fixture drops unused counters without changing its coverage assertions. RED: unused-ranking-counters-red.tap.

- PERF-CPU-54/55/56 (row ordering, request-cache lookup hoisting and stable basket signature caching) were withdrawn after exact parity and passing structural cases but higher combined CPU and slower D3 trials. Their exclusive cases, patches and RED/GREEN evidence are retained outside the checkout; active original semantic tests remain unchanged.

- PERF-CPU-57/58 (validated measurement reuse and zero incidental-loss shortcuts) were withdrawn: structural assertions and exact frozen outputs passed, but neither reduced measured CPU consistently. Preserve exclusive cases, patches and RED/GREEN evidence externally. No incidental ingredient, reference or uncertainty facts are omitted.
- PERF-CPU-59 uses an already calculated complete score as a strict lower bound only when every effective coefficient is unchanged or greater. Reduced nutrient weights still take the full endpoint calculation. The new fixture initially used an ineligible zero-priced listing; the failed run is preserved and the corrected fixture independently asserts both eligible candidates before testing the bound. No historical fixture price changed.
- The 192-MB young-generation diagnostic was not retained. An initial probe correctly rejected mismatched compiled/source identities; a separate clean source-only checkout then ran three fresh D3 trials, all above the native one-second gate. This was a diagnostic, not release acceptance, and worker capacity/configuration remain unchanged.

- PERF-CPU-60/61/62 (compiled aggregation, cursor ordinal keys and compiled zero-loss thresholds) were withdrawn together after exact results and GREEN structural checks but no combined latency benefit. Exclusive assertions and implementations are preserved in the external patch with original failed/incomplete command evidence. Existing arithmetic and cursor regressions remain.
- PERF-CPU-63 applies the existing contribution/retention eligibility decision before generating quantities for unrelated listings. Explicit product/quantity/subject requests and declared unquantified contributions remain eligible. No scoring, candidate traversal or attempt budget changes.
- PERF-CPU-64 removes a duplicate label-exposure calculation for the same already compiled minimum physical quantity; independent target/reference breakpoints and the fallback for an uncompiled quantity remain unchanged.

- PERF-CPU-65 constant-integer reuse was withdrawn: exact immutable arithmetic and frozen outputs passed, but CPU did not improve. Keep the original rational implementation.
- PERF-CPU-66 incremental aggregation was withdrawn after meaningful corrected RED, 141 GREEN checks (including uncertain intake, zero weights and both reference scopes), and exact frozen parity but no net CPU benefit. The first synthetic fixture accidentally matched multiple similarly named ingredients; preserve those failed runs, the explicit one-ingredient prerequisite correction and the withdrawn patch externally. No incremental state/provenance cache remains.
- PERF-MEM-03 request-owned bounded cache experiment was withdrawn after GREEN ownership/eviction assertions and exact parity but slower measured calculation. The previous cache lifetime remains. Removed cases are exclusive assertions for unshipped optimisations; original arithmetic, recovery and consumer checks remain.

### 2026-09-27 — benchmark runtime identity

- `PERF-PACK-03` preserves the failed concurrent launch: the old runner inherited a previous test build identity after a current production build, so the existing runtime guard rejected it before calculation. Each child now receives the SHA of its own control/candidate checkout. No runtime guard is bypassed, and fixture/database settings stay isolated. The original failed launch and meaningful RED assertion remain in the external evidence pack; only affected tooling checks and interrupted concurrency comparisons are rerun.

### 2026-09-27 — redundant locking reads

- `LOCK-REDUNDANT-01–07` replace redundant reads with immutable receipt reads, existing owned payment rows, guarded worker activity and short optimistic recovery publication. Payment/revision/idempotency protection remains required. RED evidence includes real held-writer failures, duplicate acquisitions and an independently held catalogue writer.
- New checkout validates the latest committed catalogue snapshot without `FOR SHARE`; a later catalogue commit does not rewrite the accepted quote. `V5-CHECKOUT-PG-01` and `PRACTICAL-CHECKOUT-03` now assert nonblocking snapshot validation while retaining stale-at-admission rejection and frozen recovery. The removed order-reuse locking getter has no mutation callers; `getOrderForUpdate` remains tested.
- `LOCK-REDUNDANT-05B–E` fence recovery against changed revision, selection and row version, preserve audit before-images, and reject stale generation admission rather than creating an unversioned task. `LOCK-REDUNDANT-06B–C` cover same-agent reclamation and a heartbeat started before a concurrent update commits. A raced heartbeat may reuse the existing task fence; the normal path takes one statement.
- Reviewed inventory: `redundant-locking-impact.json`. Required PostgreSQL prerequisites fail explicitly rather than skipping. Existing case counts are updated everywhere those maintained files are inventoried. Historical prices, RED results, fixture inputs, arithmetic and checkpoint settings remain unchanged.
- Audit suggestion for a web frozen-payment fast path was already implemented by `findReusableWebCheckoutPayment`; no second fast path or duplicate query was added.
- Final execution discovered nine maintained web-advisory cases, rather than the older inventory's eight; all nine executed and passed. The first affected run's only failing check was the changed receipt SQL fingerprint in the lock register. Preserve that failure, the corrected register review and replacement execution; no test assertion was relaxed.
- Recovery races use the existing `assessment_changed` / HTTP 409 response. `LOCK-REDUNDANT-05D–E` first failed against generic internal errors, then passed with the shared `FunnelError`; no new response field or error vocabulary was introduced.
