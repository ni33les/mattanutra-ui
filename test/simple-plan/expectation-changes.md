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

## Live DEV qualification correction — SPLAN-ADV-04

The first v9 DEV D3 smoke (source `53d66a24`) returned 25,546 structured bytes because the same unverified-product finding was copied onto each of 19 incidental label ingredients. That live result remains failed evidence. The regression first failed with 20 copies instead of one; every original ingredient and unknown amount is still required. The corrected decision attaches each fact/scope once per choice and links all affected ingredient IDs through the existing `relatedIngredientIds` field. Separate sources, interactions and measured reference scopes remain separate. No schema, scoring, prices, worker policy or search budget changes. Requalification uses the now-active DEV source as the deployment base, while retaining the original package release base.

## Live fact identity correction — SPLAN-DTO-02

The final real D3 inspection exposed the same supplement represented as a raw catalogue UUID in labelled facts and its public `sup_` identity in contributions. Source `b286807a` therefore duplicated one known D3 row as an unknown incidental row and could fail to associate conflicting labels with the contribution. The new RED case reports two rows instead of one. Presentation now applies the existing UUID-to-public-ID mapping before joining facts; no name-based merging or confidence upgrade occurs. Verified and conflicting variants are asserted independently. Product offers, quantities, source facts and matcher scoring remain unchanged. The additional qualification is required by this relevant correction; earlier evidence remains preserved.

## Remaining test-entry-point audit

The full source audit found additional older public clients still constructing retired operation/view payloads outside the initial scoped inventory. They are being adapted or retired explicitly, not silently counted as passing. `baseline-all-tests-before-clean-break.tar.gz` preserves every baseline test and fixture before this migration. Current helpers send flat requests without runtime input/output translation; direct domain tests retain their separate internal entry point.

The five execute-reuse assertions remain maintained against flat requests and explicit returned-option selection. Retired plan handles now return standard not-found; unpaid order recovery uses its independent order handle. Original execute receipts remain stable and current payment state is read independently from the order. The eight internal QA access/evidence tests retain their original domain and payment assertions.

`SPLAN-STATE-04` and the retained checkout tests exposed a genuine selection bug: a selected nonempty purchase fallback was still labelled `needs_input` because the empty recommendation controlled the status. The selected basket now controls operational readiness; this changes no scoring, choices, prices or advice.


## Final retained-consumer migration

- All public test clients send v9 directly. The removed full-response injector cannot translate old requests or restore old payloads. Private domain helpers are labelled explicitly; their rich accounting and matcher observations are not public MCP fields.
- `AE-01–19`, `AX2–AX8` protocol/projector suites and their duplicate two-run launchers are retired with their wrappers, response modes, legacy claims and evidence handles. Every case is listed in the retirement ledger with current replacement tests. The manual combined report reuses the existing published-documentation client and retains its independent matcher, commerce and value packs. Historical report files and the prior baseline are unchanged; a future v9 baseline has a separate filename.
- AX5/AX6 prices remain **467300, 292100 and 333000 minor units**; pill totals remain **10, 7 and 8**. Current independent presentation cases also require **98%, 90%, 90%** coverage from explicit 490/450/450 contributions against 500, and the original 175200 price / 3-pill / 8-point difference. AX8's **18900-minor** focus fixture retains its verified B1/B6 and unverified B12 facts.
- `FIX-01` evaluates sparse catalogue gaps explicitly rather than claiming absent Creatine is covered. Optional percentages are independently checked at the existing two-decimal published precision, with exact gaps and excesses still required. `FIX-08` treats an absent reference as unknown instead of requiring a fabricated reference. Known-reference arithmetic remains covered separately.
- The private lifecycle harnesses retain their explicit request clock/cancellation context and use private nonlocking order observations for event timestamps and accounting. Their old v1.x names are historical case identities, not published contract versions. The 350-mg Magnesium fixture is explicitly installed with a matching immutable catalogue/reference identity and restored after each case; no database reference or product facts are changed.
- `P1` preserves all 34 cases, original prices and payment outcomes. A returned choice is explicitly selected before checkout; refinements invalidate selection; a fresh same-input refinement is a no-op. Superseded acknowledgement fields are neither sent nor restored to the public response. Unsupported field/country errors remain precise and side-effect free.
- `SPLAN-STATE-05/06` retains empty target facts and review-options recovery, including all 30 unresolved targets. Empty choices remain nonpurchasable; useful purchase alternatives retain their returned IDs.

The current acceptance inventory distinguishes PostgreSQL prerequisites and reconciles every executed file/case. Development diagnostics containing failures or interrupted processes are retained as such, never included in a green attestation. Actual installed connector alignment remains a separate owner-refresh/fresh-session requirement.
