# Matcher CPU and checkpoint improvements

Implemented on `dev`, against control `6fd7a63b062975ba3937e08a79286a24fe4de095`.
This package changes computation and checkpoint overhead, not scoring policy,
search budgets, public contracts, eligibility or payment behavior.

## Changes

- Retain native exact fractions for comparisons, decoding restored score DTOs once.
- Compile profile coefficients once per immutable profile and share unweighted
  nutrient inputs across profile representatives. Weighted uncertainty endpoint
  selection remains independently evaluated.
- Use stable bounded top-K selection where frontier reduction previously sorted
  an entire collection just to keep its first few entries. Candidate membership,
  tie order and diversity rules remain unchanged.
- Complete the last productive chunk without another zero-attempt continuation.
  Historical checkpoints with the old terminal flag remain readable and expandable.
- Retain the original compiled groups through resident finalization. Recovery
  defers their reconstruction until needed, so older chunk callers do not recompile
  the catalogue on every continuation.

Full internal result information remains intact: decision and recovery consumers
still use those records. This package does not remove internal alternatives or
change customer responses. No new database access, locks, queues, deadlines or
configuration settings were added.

## Bounded measurements

The same frozen D3 2,000 IU / unknown-diet input was replayed without database or
network access. All comparisons used 8,000 expansions and preserved the complete
internal result, including quantities, scores, prices, advice and alternative order.

| Profiled run | Control elapsed | Candidate elapsed | Control process CPU | Candidate process CPU |
|---|---:|---:|---:|---:|
| Initial diagnostic | 8.62 s | 5.08 s | 10.77 s | 7.15 s |
| Repeated comparison | 10.52 s | 4.48 s | 10.23 s | 6.33 s |

Checkpoint writes fell from three to two, approximately 3.28 MB to 1.99 MB.
The final result SHA-256 was unchanged in all four runs:
`b89d7656d4dbb0f7a813958c236978dff43279bf57880ecc2ff008bca61068e8`.
The repeated control used the deployed checkout at `426ac2a7`; its matcher source
is identical to the control above. The final candidate code is `d3c2a714`.

These are two cold in-process profiles on the same shared host, including profiler
cost; elapsed time varies with host scheduling. They are not live funnel latency,
a throughput guarantee, or a workload-wide speedup claim. Resident memory was
similar and no general memory reduction is claimed.

## Test hygiene and scope

The reviewed impact inventory is `test/service-efficiency/matcher-hot-path-impact.json`:
106 cases in 14 affected files, using the existing batch runner, source hygiene
checks and executed-case reconciliation. New cases have IDs EFF-HOT-01 through 09
and join the maintained service-efficiency inventory. RED evidence precedes the
score/checkpoint and frontier implementations. No historical assertion or fixture
price was removed or weakened.

All 106 unique selected cases passed, including native-worker restart, lost-ack
handling, uncertain intake, exact arithmetic, independent finite oracles, required
priority, quantity refinement and browser bundling. Typecheck and changed-file lint
passed. No full application/MCP suite or unrelated browser journey was run.

The first integrated invocation supplied an abbreviated test build SHA; 11 cases
failed at configuration loading. After fixing the invocation, only the four affected
files were rerun, with all 24 cases passing. This was an explicit harness correction,
not an automatic test retry. Initial failures remain recorded. One mixed-loader
benchmark is explicitly marked invalid and excluded from the comparisons.

Evidence: `/root/.codex/visualizations/2026/09/11/matcher-performance-review/acceptance.json`.
Raw profiles, frozen semantic results, RED/green execution records and the bounded
invocation script remain alongside it, outside the checkout.

No deployment was performed as part of this optimization pass.
