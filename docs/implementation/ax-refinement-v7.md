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

### Intentional expectation changes recorded during implementation

- `test/agentic-phase4-algae.test.ts` and the source-name assertions in `test/matcher/phase2.test.ts`: v7 preserves an explicit `fish_allowed` or omitted source preference instead of deriving `algae_only` from wording or storing it because the diet is vegan. The exact algae alias is resolved only with an explicit `algae_only`; otherwise the unresolved target has a nonblocking clarification. E-02 keeps its exact algae SKU assertion with an explicit algae source input. Prices and unrelated assertions are unchanged. Replacement cases: AXR-TERM-01–02.
- `AXR-ALT-01–03` add a pointer into the existing option set; the presentation tests compare the original supplied arrays after projection. No basket mutation is permitted in that slice.
- `AXR-NOP-01–02` distinguish confirmed continued-intake completion from an empty dose-fit recommendation with unresolved gaps. Historical future-schedule cases without such coverage evidence retain their prior expectations.
- `AXR-ADV-01–03` add rule classification and a confirmed pill lower bound without changing thresholds, evidence, exact unknown totals, selection eligibility or acknowledgement requirements.

Scoped evidence remains in `/root/.codex/visualizations/2026/09/08/ax-refinement-v7`. Intermediate timeouts, interrupted runs and RED outputs are retained. No whole-application or whole-MCP green claim has been made.

### Comparison harness correction

The first comparison attempts (linear-comparison-1/2) are invalid evidence: the canonical request captured an empty reference list before worker setup installed the frozen references. The worker cannot repair an explicit request-level list. The harness now asserts exact frozen reference content before either implementation runs. The preliminary price-regression assertion was replaced with the correctly referenced control (loss 0.25 + 0.5 + 0.5 + 2 × 4.3/350; first-order goods 53,700 minor THB). Fixture prices were not changed. Both invalid reports and RED attempts remain preserved; they are not acceptance evidence.
