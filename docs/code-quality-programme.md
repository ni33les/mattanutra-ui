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
