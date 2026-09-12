# Consistent refinement and standard matching speed

Control: 26e90472b0d23c9904eb1cf625ce70197384ac4e. Contract 11.0.0 and public fields remain unchanged.

- REF-REV-01–04 (five cases): accepted work reports its attempted revision, including failure and recovery. The committed basket stays at the previous revision until publication. Before implementation all five fail because reads/conflicts report revision 1 after revision 2 was accepted.
- RED evidence: `/root/.codex/deploy/mcp-refinement-speed-20260912/revision-red.log`.
- Original Daniel/Maya inputs, frozen catalogue/references and prices remain outside the checkout under the same evidence root. Historical results are not rewritten.
- Scope is affected simple-plan/efficiency tests only. Fresh standard matching must be under 1,000 ms; a cached result or faster acknowledgement cannot satisfy the release gate.
- REF-SUM-01–05 (seven cases): replace generic ready copy with known request fit and first-order budget deviation; preserve a concise revision comparison. All seven fail before implementation (`summary-red-2.log`), including a real adapter journey with original THB 2,594 / 2,126 prices. The first RED invocation exposed an internal-target field in the harness; that prerequisite was corrected before recording behavioural RED.
- REF-CPU-01–02: both cases fail before optimisation because numeric ranking eagerly performs display conversions. The uncached Daniel control consumes exactly 8,000 attempts in 4,603.6 ms; kernel result SHA-256 `19da5fc035e6d875de91ea2e0f440246f5692d155acd971ac48d12edec1731cc`. This kernel measurement is not the native request-to-publication release gate.

- NOID-06: preserve the exact unconfirmed/checkout-ready introduction, revision 1 and direct-execute action in all three locales; extend the expected text with the new known-contribution clause. The original exact-whole-summary assertion failed in affected-1, while all other 193 pure checks passed. No prices, dose assertions or confirmation invariants were weakened.
