# Conversational plan 9.0.0

Release base: `2d4c259a6775b57f3182306955a57ccfa6796ca4`.

The v1.1 brief is normative except for the user's explicit clean break: remove old MCP contracts and old-handle support. Preserve order/payment recovery and current web behaviour. The approved recovery refinement `scoring:{}` is a no-op for a fresh successful result and can resume failed work or refresh stale facts.

Historical RED/control evidence lives outside the checkout. Removed protocol-specific tests must be listed here with their replacement requirement; domain, financial and concurrency assertions remain maintained. No fixture prices are changed.

| Previous behaviour | Replacement | Cases |
|---|---|---|
| Public operation/wrappers and response modes | Flat field dispatch and one response | SPLAN-REQ-01/02, SPLAN-DTO-01 |
| v4–v8 publication and plan-handle compatibility | v9 only; standard invalid/not-found | SPLAN-SPEC-03, SPLAN-COMPAT-01 (scope amended by user) |
| Importance multiplication and required/core priority on MCP | Effective bounded weights; soft ingredient priorities | SPLAN-WGT-07 |
| Unchanged refinements cannot explicitly retry | Same-input recovery only when failed/stale | SPLAN-STATE-03 |

The complete removal ledger is `retired-expectations.json`; archived sources and historical results are preserved in external baseline evidence. Current web/internal scoring and frozen commerce consumers remain in the scoped inventory. Public request wrappers and view-specific tests are replaced by flat requests and terminal/processing decisions, not by compatibility adapters.

`AXR-REL-03` retains the original A6→A2 inputs, catalogue prices, injected 28k checkpoint failure, last durable 24k state, reserved 4k work, 64k final budget and revision fencing. Its old 90-second timeout covered three executor invocations plus setup, and cancelled recovery before the existing operation deadline. The harness now allows 200 seconds for that combined sequence and explicitly asserts **175 seconds from expanded admission through recovery**. Application/worker deadlines and budgets are unchanged. Failed 90-second development executions remain recorded; they are not green evidence.

`M721-HOST-01–03`, `V5-CLIENT-01–12`, snapshot/read contention and payment assertions retain their IDs and business invariants with current payload fields. Hosted projection fixtures prove verifier behavior only, not actual installed-connector refresh.

The new scoring implementation caches immutable per-ingredient arithmetic and reuses exact unweighted components only when every subject has one exposure endpoint and a uniform fitting weight at least one. Estimated ranges still recalculate complete weighted endpoint losses (`SPLAN-WGT-11`). These caches add no admission or database locks and do not change candidate order or attempt accounting.

Current acceptance also retains unknown-intake, numerical-advice, transport cancellation and snapshot-fencing cases formerly grouped under v5/v6 suite titles. Their protocol expectations now use v9; numerical assertions, prices and consent/payment invariants are preserved. Progressive discovery retains its 4-KiB capability and 8-KiB instruction budgets, with flat create and poll templates.
