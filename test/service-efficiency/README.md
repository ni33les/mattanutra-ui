# Core service efficiency pack

Control: a28f3b27d6bde5a21803fa5e33622e89ce2a708d, MCP 7.2.4.
Release target: DEV only. Evidence is stored outside the checkout. The independent
control checkout remains unchanged. Clinical references, catalogue facts, prices,
matching traversal/scoring, payment semantics and the public contract are frozen.

The impact manifest is the executable inventory; each new case has an EFF ID.
Existing consumer IDs and historical results are retained. RED records are not
acceptance proofs. Final acceptance covers this package, never the whole app.

## Request/process inventory

| Path | Current waste | Required invariant |
| --- | --- | --- |
| MCP discovery and tools | Repeated projection/serialization | Seven tools, 7.2.4 schemas and conversation defaults |
| Plan admission/refinement | HTTP/task ownership and duplicate reads | Durable admission, same-key replay, old revision retained |
| Plan status/conversation/details | Locking reads, full JSON/hash for status | Capability checks, current state, exact details |
| Catalogue/reference loading | Recompiled/rehash inputs | Complete immutable content identity |
| CPU matching and repair | Cursor cloning and per-chunk reconstruction | Identical traversal, scores, advice and attempt budgets |
| Task dispatch and leases | Missed/broadcast wakeups, observer slots | One owner, recovery, independent heartbeat |
| Capture and HealthScore | Repeated state loading/task scheduling | Revision/locale readiness and complete advice |
| Checkout and fulfilment | Round trips and repeated verified reads | Atomic accounting, immutable orders, provider reconciliation |
| Email delivery | Shared transaction/wakeup overhead | Durable requests and ambiguous acceptance semantics |
| Progress and reveal | Repeated payload reads and poll subscriptions | One request, abort/visibility handling, pending recovery |

Normalizations for comparisons are explicitly allowlisted generated identifiers
and diagnostic timings; money, doses, advice, option order and work counts remain.

## Operational limits and rollout

Normal status/version reads do not take application row locks. Atomic admission,
revision publication, order/payment transitions and catalogue publication fences
retain their existing locks. Task creation joins the caller's transaction; wake
notifications run after commit and periodic discovery remains the recovery path.
The operation path takes the plan before its operation; checkout takes the plan
before orders. Provider, matcher and email work execute outside those transactions.

Production emits one bounded numeric measurement aggregate per minute. Worker
checkpoint metrics are relayed to the owning request; input byte sizes are sampled
once per 64 dispatches and include their measurement cost. SQL timing includes
server execution and waiting; acquisition plus BEGIN is one combined metric because
the managed transaction-pool driver does not expose independent acquisition time.
These metrics do not claim a separately measured PostgreSQL lock-wait duration.

Projection backfill is additive and resumable. Legacy rows use ordinary compatible
reads until backfilled. Opaque result-version tokens can change once during rollout;
a changed token requests a fresh payload, without changing basket or payment data.
The internal worker protocol is version 2; legacy persisted checkpoint readers stay
available. Restart the DEV application supervisor and its worker child together.
No catalogue corrections, clinical reference changes or pool resizing are included.
