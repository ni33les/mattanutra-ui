# Code-quality programme — 26 September 2026

This programme changes code and test infrastructure on `dev`. Deployment is DEV
only. UAT and PRD applications, configuration and data remain unchanged. No new
database backup, schema migration, catalogue correction or financial update is
authorized by this programme. Existing recovery backups remain indefinitely
retained; they precede the latest Delight commercial completion and are not a
snapshot of current business data.

## Recovery checkpoint

Two annotated tags distinguish the development tooling from the deployed app:

- `checkpoint/2026-09-26-quality-workspace`: `d1a78fb7185a1074148c6c13d294ee994a8b2fc7`.
- `checkpoint/2026-09-26-quality-deployed`: `162d4171f43c891a4b2a17d1f486251e584fa7e5`.

The external bundle and restored bare repository are under
`/root/.codex/deploy/code-quality-20260926/`. `code-recovery-verified.json` binds
the bundle checksum, restored commits and successful full Git integrity check.
Tags were pushed without pushing the development branch or deploying code.

Code rollback never implies database restoration. A later PRD promotion needs
separate authorization and the then-required fresh recovery backup.

## Requirements and evidence

| Requirement | Authoritative evidence required for completion |
| --- | --- |
| Preserve recovery points | Remote tags, restorable Git bundle, existing backup retention unchanged |
| Complete test discovery | Node/browser inventory, all supported test extensions, zero unclassified consumers, selected/executed reconciliation |
| Faster trustworthy testing | Same maintained assertions, one canonical execution plus declared replay fixtures, baseline/candidate timing and resource measurements |
| Fewer application lines | Baseline/candidate tracked source census, reachability proof, explicit retired-case ledger, active consumer checks |
| Lifecycle reliability | RED and GREEN worker-observer, SSE cancellation, cache failure/reset regressions |
| Less runtime work | Identical catalogue/response identities, bounded pin/hash measurements, transaction/cache isolation and failure recovery |
| Shared implementations | Preserved fact-write transactions, authorization, hash values and communication copy through affected-consumer tests |
| Historical artifact handling | Active-input inventory; checksummed archive and retrieval proof for any removed artifact; no Git history rewrite |
| Final acceptance | Complete maintained inventory once on unchanged source, bounded semantic replays, typecheck, release-diff lint and one production build |
| DEV release | Attested source/build, application and worker identity, bounded web/pharmacy/MCP/recovery smokes |
| Future promotion preparation | Undeployed release manifest, compatibility/rollback notes, measured outcomes and unresolved findings |

Evidence lives outside the checkout under the programme directory. RED failures,
setup failures and historical evidence are retained separately from acceptance.
An individual focused pass does not establish final acceptance.

## Behaviour boundaries

Keep matching scoring, traversal, physical quantities, advisory preferences,
eligibility, public MCP contract, six tools, pricing, financial invariants and
frozen checkout contents unchanged. Keep ordinary web and pharmacy designs.
No new application locks or scheduling queues are introduced. Existing short
atomic transitions and managed-pool timeout/cancellation protections remain.

Use isolated PostgreSQL, controlled fixtures, mock payments and an email sink.
Missing prerequisites, skipped/focused/todo/cancelled/retried or empty cases fail
acceptance. Retiring unreachable implementation is distinct from removing a
failing assertion; case dispositions identify the difference.

## Baseline interpretation

The starting tree contains 2,438 tracked files and about 251 MB. Application
TypeScript/JavaScript contains 272,096 physical lines, plus 15,646 CSS lines.
The roughly 1.01 million total text lines also include tests, SQL and data.
Report application complexity and artifact bytes separately; splitting files,
minifying code or removing evidence does not count as an application improvement.

Test discovery originally missed two JavaScript test suites and left five current
matcher consumers unclassified. Existing full-suite orchestration also repeats
whole packs that already contain their own paired scenarios. Historical runtime
figures are not a current baseline; measured setup/execution comparisons must
use the same inputs and machine. Fresh work and cache hits remain distinct.

## Completion discipline

Commit RED before implementation and keep each independently reviewable slice
separate. Run affected cases during development, then the complete reviewed
inventory once on final source. Repeat only invalidated checks after a relevant
change or failure. Keep unhelpful optimizations out of the candidate and record
their evidence rather than inventing a speedup.

The programme ends with verified DEV deployment and an undeployed promotion
package. Additional opportunities become a follow-up backlog, not an implicit
UAT or PRD rollout.

## Reviewed slices and test impact

| Slice | Maintained checks and evidence |
| --- | --- |
| Worker notification and SSE lifecycle | `test/service-efficiency/wakeup.test.ts`, admin SSE lifecycle and task-worker boundary checks; `runtime-lifecycle/` |
| Catalogue refresh ownership | `test/service-efficiency/catalogue-refresh.test.ts`, live-catalogue guards; `catalogue-refresh/` |
| Immutable snapshots and persistence | `test/service-efficiency/catalogue-pin.test.ts`, its PostgreSQL integration file, DB transaction/snapshot-store consumers and cancellation/cache checks; `catalogue-pin/` |
| Unreachable admin implementations | `test/code-quality/dead-code-expectation-changes.md`, retained statistics/localization/CRUD consumers; `dead-code/` |
| Shared fact writes, hashes, session controls and message copy | `test/code-quality-deduplication.test.ts`, `test/code-quality/deduplication-expectation-changes.md`, product import/edit and communications consumers; `deduplication/` |
| Discovery, startup and canonical execution | Discovery, execution-proof, loader/timing, orchestration, validation-proof, CI and documented-client checks; `test-discovery/`, `test-speed/` |
| Historical SQL and unreachable widgets | `test/historical-rollout-archive.test.ts`, `test/orphan-components-retirement.test.ts`, `test/code-quality/archive-orphan-expectation-changes.md`, live localization/CRUD/image and SQL lock-register checks; `archive-orphans/` |
| Existing pharmacy image expectations | Exact approved landing tag and QR render-prop parity, including invalid-tag mutations; `test/code-quality/pharmacy-image-expectation-changes.md`, `pharmacy-image-guards/` |

The final runner discovers all maintained Node and browser suites. Its reviewed
independent-file allowlist contains only pure tests; HTTP-dependent and
PostgreSQL cases retain serial ownership. Canonical execution runs every case
once. Only the declared frozen business journeys receive a second semantic
execution, with independent stores and no database credentials. Their exact
business values are compared separately from diagnostic timings. The full
validation gate also retains its documented public-client language/payment
checks. This replaces redundant outer pack execution, not individual assertions.

The catalogue persistence slice received additional cancellation RED evidence
after review exposed first-subscriber ownership leaking into shared persistence.
Subscribers now cancel independently, shared work uses the existing database
deadline policy, and uncommitted transactional writes never satisfy another
owner. Ten isolated PostgreSQL checks passed for commit visibility, rollback,
transaction timeout and snapshot-store consumers; final acceptance is separate.

The historical lock register had two pre-existing stale source keys after
assessment-column and checkout-helper changes. Metadata was corrected against
the existing SQL statements and invariants. This did not add application locks
or weaken lock-site discovery.

## Measurements and deliberately retained work

Controlled fresh-process plain-TypeScript startup fell from about 440 ms to
180 ms after deferring the TSX compiler import. TSX startup remained about
437 ms: its required compiler work was deferred rather than removed. These are
small fixture measurements on this host, not a promise for every suite.

For eight concurrent pins of the same 128-product immutable fixture, complete
hashes fell from nine to one and insert preparations from eight to one. All five
baseline/candidate samples retained the same snapshot identity. The local
median was about 38 ms before and 8 ms after; SQL/network and customer matching
latency are not represented by this in-memory measurement.

The existing retail-adapter preparation of a frozen 154-listing, 869-fact
catalogue took about 19–34 ms locally and retained identical output hashes.
No further adapter rewrite is included: the measured work does not justify
extra alias/fact-resolution risk. Database transaction setup continues to
enforce existing managed-pool cancellation and timeout semantics.

Keep application lines, test/tooling lines, and archived artifact bytes as
separate figures. Offline SQL restoration preserves every original byte and
does not execute a migration. Runtime content, library handoffs and all existing
recovery backups remain available.

The SQL archive removes 117,830,364 active artifact bytes while retaining exact
offline restoration of all eleven originals. The two dead-component slices and
shared-implementation extraction remove 6,374 application lines before counting
the small runtime fixes added elsewhere. Final totals must use the complete
release census rather than this gross-removal figure.

Two pre-existing image-policy failures were resolved without changing the
approved landing markup or its appearance. Its exact Nong image is now a narrow
element-level exception with negative mutation checks. The pharmacy LINE QR
lost a redundant Next Image property; installed-framework output is identical
in English, Thai and Chinese. Existing browser geometry checks remain required.
