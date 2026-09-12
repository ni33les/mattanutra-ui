# Consistent refinement and standard matching speed

Control: 26e90472b0d23c9904eb1cf625ce70197384ac4e. Contract 11.0.0 and public fields remain unchanged.

- REF-REV-01–04 (five cases): accepted work reports its attempted revision, including failure and recovery. The committed basket stays at the previous revision until publication. Before implementation all five fail because reads/conflicts report revision 1 after revision 2 was accepted.
- RED evidence: `/root/.codex/deploy/mcp-refinement-speed-20260912/revision-red.log`.
- Original Daniel/Maya inputs, frozen catalogue/references and prices remain outside the checkout under the same evidence root. Historical results are not rewritten.
- Scope is affected simple-plan/efficiency tests only. Fresh standard matching must be under 1,000 ms; a cached result or faster acknowledgement cannot satisfy the release gate.
