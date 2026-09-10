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
