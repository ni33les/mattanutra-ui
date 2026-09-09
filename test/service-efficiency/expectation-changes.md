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
