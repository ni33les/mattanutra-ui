# Durable admission expectations

The existing DET and R25 harnesses imported the removed `PLAN_MATCH_RETURN_BUDGET_MS` constant and treated a synthetic three-second return budget as the current request lifecycle. The maintained CI reference test reproduced the import failure in `test-speed/ci-guards-current-contract.log` under the external quality-programme evidence directory.

`efficiency.structural` retains its case ID and ten-point scale. Its first six points now require measured durable admission and same-key recovery: a committed queued operation, an unclaimed lease, an unchanged receipt and operation identity, and zero request-side matcher executions or worker dispatches. Both actual acknowledgement durations must satisfy the existing service-efficiency admission bound of less than 1,000 ms. The captured matching, safety, product, price, pinning and catalogue assertions remain intact.

The live DET report replaces `agenticUsesWeb400`, `budgetMs`, `packTimeToReady400` and the old configured poll interval with the measured `acknowledgement` record, including the returned poll interval. Raw reports retain both measured `ackMs` values. Canonical equality excludes those declared latency fields and still compares admission state, worker counts and every business value.

The R25 case retains the historical 506 ms / 400 ms / three-second polling calculation and its 2,500 ms failure threshold as historical evidence. Its current-path assertions measure real admission and same-key recovery instead of predicting request duration from a retired budget. No removed production constant or request-side matcher executor is restored.

The older synthetic report in `MCP-TRANSCRIPT-10` remains as a compatibility fixture. Its dose, price and advice drift assertions are unchanged; additional assertions verify that measured acknowledgement timing may vary while request-side matcher execution cannot be normalized away.

The three remaining consumers (`agentic-phase6-retention`, `agentic-cv-speed-pack`, `consistency-r2-guards`) also replace only retired budget/race expectations with this measured admission probe. Their intact-file RED is `test-speed/remaining-admission-red.log`. B12/K2 retention, telemetry fixture values 180/420/2,500, public telemetry exclusion, catalogue/transaction boundaries, completed-plan recovery, exact coverage/basket comparisons and the existing 1,500 ms / 300 ms observational CV budgets remain. Admission's strict 1,000 ms fixture deadline is separate from those completed-plan observations.

The explicit manual `run-det-pack-twice` entry point now uses `canonicalDetReport` for both complete reports, retaining its equality assertion while excluding only declared acknowledgement latency and generated transcript identities. The automatic final gate does not invoke this extra full replay.
