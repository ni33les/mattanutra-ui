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
