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
