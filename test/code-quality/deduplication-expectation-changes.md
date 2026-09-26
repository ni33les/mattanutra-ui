# Shared implementation extraction

Evidence: `/root/.codex/deploy/code-quality-20260926/deduplication/`.

Four pairs currently contain identical function bodies. Consolidation keeps one implementation for each domain; current public export names, caller-owned SQL handles, mutation/audit/version ordering, authorization, hashes and message text remain unchanged. No catalogue, payment, matching, schema or production state changes are included.

`code-quality-deduplication.test.ts` compiles the actual private source declarations to exercise both old copies before extraction and the single owner afterward, without adding test-only production exports. Existing domain normalization is real; SQL I/O, fetch/location and React state are controlled. Tests pin exact hash bytes and safety text, cover explicit and stale supplement IDs plus deletion scope, and verify EN/TH/zh-CN session roles and impersonation controls. Safety follow-up prose is currently English; multilingual item names remain unmodified, and this slice does not introduce translations.

`red.tap`: four intended single-owner failures and four passing behavior cases, zero skips/cancellations. `probe.tap` is retained fixture-capture/harness-development evidence, not the RED gate. The nonempty hash fixture is frozen from the unchanged original implementation. `baseline.tap`: 88/89 existing affected tests pass; the existing row-lock inventory fails for `lib/assessment-capture.ts:captureAssessment` and `lib/retail-product-checkout.ts:lockWebCheckoutAssessment`. The product-fact transaction/atomicity case passes. That unrelated failure remains visible and is not waived or repaired by this extraction.

| Implementation | Shared owner | Compatibility and exact assertion migration |
| --- | --- | --- |
| `replaceProductFacts` in admin-products and admin-product-writes | Existing `lib/admin-product-facts.ts` | Preserve the admin-products public re-export and the existing caller SQL object. `admin-product-facts.test.ts` inspects the shared owner once with every original fact-name/canonical-ID assertion retained; `transaction-boundary.test.ts` reads the new owner with every original transaction-free/statement-atomic assertion retained. Mutation/version/audit callers are unchanged. |
| `AdminSessionBar` and `sessionRoleLabels` in both admin shells | `components/admin/session-bar.tsx` | Both shells render the same shared component with unchanged props and their existing allowed-view filters. In `admin-localization-static.test.ts`, the four checks for the component declaration, effective organization name/currency and stop endpoint inspect the shared owner; other dashboard assertions remain unchanged. |
| API `potentialCandidateHash` and job `adminCataloguePotentialCandidateHash` | `lib/admin-catalogue-candidate-hash.ts` | Preserve both export names by re-export; hash body, JSON field order, fact sorting and raw catalogue status remain unchanged. New frozen-hash and mutation cases protect persistent identity. |
| `safetyFollowupMessage` in communications dispatch and task-work-items | `lib/safety-followup-message.ts` | Both callers import the same formatter. Payload normalization, safety-review IDs, subject, dispatch ownership and delivery/audit writes remain in their existing callers. New single/grouped text cases preserve all formatter branches. |

No test cases, business assertions, historical fixtures or evidence are retired in this slice. The only existing-test edits change the file inspected for the moved implementation. `implementation-bodies.json` records original source-body hashes to verify the extracted functions and all unaffected callers remain byte-identical.

## Implemented verification

RED was committed as `3861715e` before source changes. The four implementations now have one owner apiece, with public re-exports preserved. `body-parity.json` compares all 155 recorded function bodies, including both original copies of each extracted function and every unaffected caller, with zero mismatches. `size.json` measures a net reduction of **306 application lines**; this excludes tests and documentation.

The candidate run in `green.tap` records 96/97 passes, zero skips/cancellations. All eight new tests pass; its sole failure is the same unrelated lock-registry failure recorded before extraction. This file's name is not a claim of complete green acceptance. `lint-final.log` has zero errors and the same seven communication-module warnings demonstrated by `lint-baseline-communications.log`; no new warnings remain. `git diff --check` passes. Broader type/build gates and correction of the independently owned registry failure remain programme-level checks.
