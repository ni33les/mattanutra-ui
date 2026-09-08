# Reliable refinement work package

Source baseline: `6baeab0e`; deployed control: `22bce180`. DEV only; UAT unchanged.

## Decisions

Linear closest-dose arithmetic and 2× safety excess stay unchanged. Numerical preferences remain advisory. Search improvements use 8,000/64,000 attempts. Experimental scoring stays offline.

Only the reviewed work-package inventory and affected regressions run. This user-authorized scope replaces AXR-REG-03 and the full-suite portions of AXR-HYG-01/02; no full-suite green claim.

## Evidence

Immutable execution evidence: `/root/.codex/visualizations/2026/09/08/ax-refinement-v7`.
The original six-profile response report/content-hashed catalogue is unavailable locally. Requests are preserved verbatim from the supplied brief; existing corrected DEV/UAT reconstructions retain separate identities. Historical reliability remains NOT_REPRODUCED until a meaningful pre-fix execution reproduces its boundary.

## Slice ledger

1. Baseline and scoped runner: implemented; three focused harness cases passed (01-harness-green-2).
2. Durable operation admission and three-second handoff implemented. Seven unit/real-worker/PostgreSQL cases pass. Cursor recovery and broader revision race/cache cases remain pending in the next slice.
3. Resumable search and candidate recovery: pending.
4. Useful alternatives and no-purchase: pending.
5. Source-backed catalogue audit: pending.
6. Advice, alias and contract 7: pending.
7. Scoped paired acceptance and DEV rollout: pending.

## Expectation changes

Record each intentional old/new expectation with its AXR ID before updating existing assertions. Historical v4–v6 schemas, catalogue prices and evidence remain unchanged.

### Reliability evidence

`02-handoff-red-2.log` exposes missing handoff against pre-fix business code using real reconstructed data and a controlled barrier. `02-worker-sequence.log` completes A2 revisions 1–4 through actual matcher workers. `02-operations-green.log` and `02-postgres-operations-2.log` cover duplicate ownership, cancellation fencing and atomic queue admission. The first PostgreSQL attempt passed assertions but hung during cleanup; it remains incomplete, and cleanup was corrected before rerunning. Original UAT request IDs were not found in the local journal.
