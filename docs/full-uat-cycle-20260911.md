# Full DEV/UAT test cycle — 11 September 2026

Release base: `3dffe3a88480c535b287d1d89e67b7f123dd625b`.

All discovered application, PostgreSQL, browser and MCP/matcher cases are in scope. Mutation and concurrency fixtures remain isolated; public documented journeys exercise UAT and the eventual DEV deployment. Historical evidence and fixture prices are preserved. No live catalogue changes are part of this work.

Evidence root: `/root/.codex/deploy/full-uat-cycle-20260911` (outside the checkout). The original checkout remains unchanged during the baseline; fixes are prepared in a separate worktree for merge into `dev`.

## Intentional expectation changes

| Cases | Failure / replacement |
|---|---|
| `DEV-CONTRACT-01`, `R2-CONTRACT-01`, `ANNA-AX-01/08/09`, `AXR-SPEC-02` | Five plan request branches still included removed confirmation/selection. Require the four current flat request shapes and absence of operation/option identifiers. Six tools, financial, dose and advice assertions are retained. |
| Full validation proof | Contract 7.0.0 was still accepted and emitted. Bind readiness and proof to current generated publication identity; reject retired versions and wrong schema checksums. |
| `FULL-CYCLE-03` | Public documented client rejected UAT. Permit exact DEV/UAT HTTPS endpoints; preserve isolated-only fixture/database runners and reject PRD, credential-bearing URLs and private QA routes. |
| `FULL-CYCLE-04–05` | Current client no longer emitted the receipt/semantic files or resumed paid orders required by full validation. Record returned checkout identity and resume with the public order tool; never repeat a charge or matcher operation during recovery. |
| Library visual-body fixture check | Missing extracted input could silently return. Missing verified source assets now fail explicitly; the existing asset preparation step supplies them. |
| Questionnaire v14 cases | Remove redundant early returns following assertions. Assert successful transitions directly before accessing their state. |
| Browser acceptance | Disable automatic retries in the default Playwright configuration as well as the acceptance command. |

New runner regressions were committed in `91448934`; eight failures are recorded in `red-gate/tests.log` before implementation. The first baseline adapter startup also rejected an unrelated, older local build artifact. That artifact was preserved outside the checkout; deployed DEV/UAT artifacts were untouched.

Final execution counts and deployment identities will be recorded after the complete unchanged-source run. An incomplete or failing baseline is not acceptance evidence.

`EFF-WAKE-07–08` failed before the worker fix (commit `13b85848`). Wake routing now excludes retired builds and another replica’s loopback address, and makes bounded fallback attempts after a refused nudge. The 19 affected wake/consistency cases pass without adding locks.

`AXR-REG-01/02` preserved journeys still requested the removed `confirm-recommendation` template. Their stale-revision check now uses the published unchanged-refinement template; current successful recovery preserves revision and remains directly checkout-ready. The historical Thai RED journeys are retained in the baseline log.

`FULL-CYCLE-06` ensures the full runner shares the existing worker-isolation utility; HTTP work has an executor and PostgreSQL ownership fixtures run after it stops. `FULL-CYCLE-07` separates polling frequency and transport measurements from business equality while retaining raw transcripts, per-response payload limits, mutations, revisions, attempts, prices and every changed state. Both have committed RED evidence and focused GREEN results.

The isolated baseline omitted payment locale constraints and current catalogue/dependency guards. `FULL-CYCLE-08–09` now require the existing reviewed payment, projection and lock-boundary migrations in dependency order before acceptance. The transport governance scan now checks production callers; transport unit tests still invoke the raw client only under mocked fetch and the offline network guard.

`MCP-LIMIT-02` also retained the removed confirmation action. The replacement requires direct `execute` readiness while preserving exact limit amounts, concise three-language copy and nonblocking advice. It failed in the frozen baseline. The first candidate build passed, but its acceptance was stopped immediately after this late baseline failure was found, before a broad duplicate run; it is explicitly incomplete and not release proof.

The generated route types caused the runner’s special 1,500 MB TypeScript limit to abort (`acceptance-2/typecheck.log`). Typecheck now shares the already bounded 2,300 MB validation budget. The application heap, pools, CPU slots and request deadlines are unchanged. Interrupted/failed attempts remain failed evidence.
