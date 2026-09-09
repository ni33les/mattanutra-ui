# Matching lock removal: DEV and UAT

The numbered register is `test/service-efficiency/lock-register.json`. It covers the 39 audited mechanisms, current SQL sites, retained invariants, acquisition/release boundaries and named executable cases. Historical callers remain separately identified. The scoped gate reconciles every named case against the execution reporter; an unrelated passing file cannot satisfy a mechanism.

Ordinary reads use MVCC without application row/advisory locks or maintenance writes. Matching owns immutable catalogue/reference inputs and performs no database access during calculation. Publication may retain an old catalogue result; unexecuted stale results require refresh before selection or a new checkout. Existing checkouts retain their frozen contents.

Durable admission and task creation commit together. HTTP never owns matching, including the PostgreSQL duplicate-idempotency race. Only the durable executor owns the operation lease. Predispatch cancellation compensates known unstarted reservations; dispatched work remains conservatively charged. The operation lease is 60 seconds, the effective task lease is 180 seconds and the overall operation deadline is 175 seconds. These are ownership/recovery durations, not row-lock hold times.

Plan publication renders, hashes and encodes immutable results before its fence. Revision/lease validation reads small headers. Payment-state updates do not rewrite frozen baskets. Task result preparation, catalogue maintenance preparation and external effects remain outside their mutation fences. Short conditional writes retain revision, payment, idempotency and dependency correctness.

CPU admission remains two productive slots per process. HTTP requests, database reads and pool waiting have no synthetic scheduling permits. Acknowledged idle worker sessions may release affinity; an unacknowledged cursor cannot be discarded. Capacity remains held through actual thread termination on cancellation. Checkpoints retain the 4,000-attempt boundary and legacy recovery readers.

## Evidence and intentional test changes

- Preserve the original UAT failures and the failed immediate-startup evidence. The same-source UAT configuration repair was independently executed by a real external worker before these code changes. Final source deployment requires new execution proof in each environment.
- `LOCK-ATOMIC-01` reproduced a PostgreSQL uniqueness race that entered legacy HTTP matching. The replacement returns the winning durable operation. A memory-store concurrency pass was insufficient to discover this path.
- `LOCK-STORAGE-01/02` reject result reserialization and frozen-order rewrites under mutation fences. Reference/market/catalogue coalescing is exercised separately from completed-match caching.
- `AXR-REL-03` exposed a durable-reference regression in the first integrated gate: JSONB reordered reference fields, changing the legacy checkpoint hash. Reference snapshots now retain their exact serialized representation, with the object reader preserved for compatibility. The unchanged PostgreSQL test proves recovery from 24,000 acknowledged plus 4,000 interrupted attempts to the 64,000 total budget.
- Worker boundary assertions follow the extracted concurrency helper while preserving the per-profile override and independent-agent requirements. Its behavioral capacity tests remain in the scoped inventory.
- The historical speed assertion “warm plan create reaches ready without processing polls” becomes “warm durable plan execution reaches ready without a polling delay.” The explicit executor completes admitted work. Comparisons now require actual target coverage and an evaluated basket; comparing two missing fields is not evidence. Fixture prices and nutrient arithmetic are unchanged.
- Earlier tests requiring catalogue publication failure and expiry writes on GET are superseded by immutable stale results and read-only expired presentation. Historical outputs remain in the external evidence directory; no previous failed/incomplete run is relabelled green.
- Failed database prerequisites, interrupted test processes and malformed fixtures are recorded as such, not presented as product RED cases. No full-application or full-MCP coverage is claimed.

## Scoped release

Use `npm run validate:dev:service-efficiency -- --output /absolute/evidence/path` on clean `dev` source. The gate uses isolated PostgreSQL, controlled matching fixtures, affected browser journeys, typecheck, release-diff lint and a production build. Repeated worker comparisons use enforced one-CPU/1-GiB scopes with swap disabled; OOM and functional-deadline failures invalidate evidence. The comparison scope includes worker threads and the harness, not the separate platform HTTP process, which requires deployed concurrent execution proof.

The ordinary deployment paths retain their existing verification. This package's scoped attestation additionally binds both deployment bases, source, schema, contract 7.2.4, fixtures, the register, execution, build and repeated semantic evidence. DEV and UAT accept only their reviewed base or an idempotent redeployment of the validated source. UAT's scoped path applies only the additive efficiency migration/backfill and binds all worker version settings to the validated source before starting the new deployment. It does not run unrelated seed/correction workflows.

An ACTIVE deployment, healthy endpoint or advertised worker version is not execution proof. Each environment still requires capability registration and a new controlled task reservation, execution, terminal receipt and follow-up. PRD is outside this package. Missing correspondence to the original 11-run report must remain explicitly unresolved.
