# Matching lock boundaries — DEV

This package starts at `6fd7a63b` and changes orchestration, publication and database coordination. It preserves matcher arithmetic/traversal, public contract 11.0.0, payment/revision invariants, pools and execution deadlines. It is developed in an isolated checkout because the main checkout has concurrent matcher work. UAT and PRD are not deployment targets.

- Admission hashes, clones and encodes the operation command before acquiring its plan fence. Admission/task creation remain one atomic transaction.
- Explicit mutation admission retires expired queued/running/retryable operations before admitting the next revision. GET remains read-only. Active ownership still excludes competing refinements; stale completion remains fenced.
- A physical worker is assigned before durable attempt preparation. CPU capacity is acquired after preparation commits; cancellation while waiting returns known unstarted attempts. Actual computation/termination retains the two-slot budget.
- Product run and line insertion use one dependent SQL statement. Decision-table discovery is prepared before publication. Necessary result, task and scheduling writes remain atomic; they are not described as a universal one-statement transaction.
- Catalogue changes stage one transaction-local commit marker. A deferred constraint trigger increments the epoch at commit and removes that marker. There is no growing queue or asynchronous catalogue-identity window. Rollback changes neither the public identity nor catalogue data. A transaction advances identity once, rather than once per catalogue statement; tokens remain opaque.
- Reviewed catalogue maintenance prepares its manifest before mutation. Its final epoch fence follows prepared product/audit writes. Product locks still preserve the atomic reviewed change.
- Dependency-cycle protection locks only connected task graphs, not one global advisory key. Contention fails the transaction before a bounded replay (at most three retries within its original deadline); failed attempts emit no after-commit effects. Cycle detection remains mandatory.

The audit's suspected repeated task-lock acquisition was already prevented by `ownedTaskLocks`. `LOCK-BOUNDARY-TASK-01` records the existing one-acquisition behaviour; it is regression evidence, not a claimed RED-to-GREEN fix.

The focused manifest is `test/service-efficiency/lock-boundaries-impact.json`; it extends the existing runner and execution-proof utilities. RED outputs are preserved outside the checkout. The first catalogue-test invocation had a missing DB environment prerequisite; only the subsequent controlled assertion failure is product RED evidence. Historical tests and fixture prices remain intact. The static expectation of one **global** dependency advisory lock is intentionally replaced by one graph-scoped guard and PostgreSQL concurrent-cycle tests.

Commands:

```sh
npm run test:matching-lock-boundaries -- --list
npm run validate:dev:matching-lock-boundaries -- --output /absolute/evidence/path
npm run deploy:dev -- --matching-lock-boundaries-attestation /absolute/evidence/path/attestation.json
```

The deployment path accepts only DEV, the reviewed active deployment base (or the same validated commit), unchanged source, passing selected tests, typecheck, release-diff lint and the attested compiled build. It applies only `db-rollout/matching-lock-boundaries.sql`, verifies schema, then restarts application/workers. Existing general release gates remain available.

Rollback may retain the deferred catalogue identity trigger. To roll back graph-scoped locking, restore the previous dependency trigger before removing application retry handling. No customer, payment, catalogue or reference records are rewritten by this migration.

Deployment passes `--matching-lock-build /absolute/validated/.next` alongside the attestation. It stages and verifies those bytes while DEV remains available, then stops the platform and its child workers before replacing the dependency guard. This prevents mixed old/global and new/graph guard execution. The previous compiled build is retained beside the proof before restart.

`LOCK-RETAIN-21` now expects immediate dependency-conflict `40001` instead of waiting for `55P03`. Its foreign-key blocking and post-commit cycle rejection assertions remain unchanged. The shared transaction helper separately proves bounded rollback/replay and after-commit isolation.
