# Direct MCP checkout

The conversational workflow is now **plan/refine → execute → pay/track**. Customer agreement happens in the conversation. `execute` accepts the current ready recommendation using its existing `planHandle`, `expectedRevision` and a fresh `idempotencyKey`. It saves the exact basket without scheduling matching, creating a confirmation task or incrementing the plan revision. Replays reuse the same order. Existing ownership, revision, catalogue, payment and frozen-order protections remain.

`plan` supports create, read/poll, refine and answer. A bare handle reads; handle/revision/key alone is invalid and directs the caller to `execute`. Ready decisions advertise `execute`; no-purchase, incomplete and stale decisions retain their recovery actions. An unchanged refinement compares the already-loaded catalogue identity before taking the no-op path, so an outdated basket can refresh after checkout rejects changed commercial facts.

The same contract definition generates validation, native tool cards, downloadable schemas, guides and connector projections. The six-tool contract remains 11.0.0; its schema checksum changes, and discovery identity advances to `discovery-11.0.0-direct-checkout-v2`. There are no added fields or tools. A deployment/connector refresh is still needed before an installed connector advertises this source.

After helping, agents should offer concise service feedback about usefulness, friction or failures. The existing feedback tool still requires customer consent, a current plan revision and idempotency. Agent observations must be distinguished from customer comments, with no invented rating or personal/health details. Feedback never gates checkout.

## Verification

The reviewed scope is `test/mcp-direct-checkout-impact.json`. The existing batch runner, source-hygiene detector and execution reporter are reused. Historical case IDs and fixture prices remain; obsolete confirmation fixtures now read the recommendation or execute checkout directly. The two concurrent PostgreSQL cases use a separately cloned local test database, never an environment database. Live commercial tests are adapted but are not executed against an undeployed endpoint.

Evidence is under `/root/.codex/visualizations/2026/09/11/direct-checkout-verified/`, with original RED and initial-run failures preserved alongside it. `run.mjs` repeats the affected inventory with source fingerprints and execution reconciliation. The complete maintained MCP/matcher inventory receives a static hygiene scan; this is not a claim that the full functional suite ran. No deployment or customer data change is part of this pass.

Final unchanged-source verification: **235 affected tests in 30 files passed** in 192 seconds, plus **2 isolated PostgreSQL concurrency tests** in 2.1 seconds. No skipped, cancelled or todo cases. Static hygiene passed across **408 maintained MCP/matcher files**. Typecheck and changed-file lint passed. Native/generated publication alignment and documented journeys in English, Thai and Chinese passed; installed-runtime verification requires deployment and refresh.
