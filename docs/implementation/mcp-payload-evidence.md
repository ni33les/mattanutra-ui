# MCP payload work package

Implementation release base: `23b4e4cd7c2838af09a6aa8555d36f9402e08158` on `dev`. Contract 7.1.0 adds presentation views; omitted views retain the full response. No matching/scoring, catalogue, clinical-reference or payment rules change. DEV deployment only.

The immutable initial baseline contains 18 isolated create journeys. The separately captured whole-journey baseline runs the unchanged release-base checkout through the same documented client in English, Thai and Chinese. It includes discovery, optional resource retrieval, refinement, explicit label/source details, exclusion, clearing, stale selection, confirmation, mocked checkout, external-harness payment settlement and recovery. Its source and decoded content fingerprints are checked before use. Fixtures and historical prices have not been adjusted.

The initial comparison against today's already-smaller discovery gave A6 English a 58.2% whole-journey reduction. That exploratory comparison is preserved outside the checkout. The maintained release comparison uses the actual pre-change execution, including its original discovery. It does not estimate or inflate reference sizes. All requests and both MCP response representations count.

Intentional assertion changes:

- Inline-only schemas become equivalent document-local references. Required values, enums, boundaries and normalized validation errors remain checked with AJV. Current generated artifacts are compared with the shared registry; historical v7.0 artifacts remain frozen.
- Ordinary info changes from all examples to one create example. Each of the five templates remains accessible through operation-specific help, and the complete guide remains accessible to tools-only and resource-capable clients.
- The AX historical exact-input assertion remains attached to v7.0 versus v6. Current 7.1 validates legacy requests plus the new presentation envelopes. AX-SPEC case IDs are preserved.
- Conversation responses omit duplicate selected baskets, labels, arithmetic and schedules. Exact facts, every option, all advice and batched full details are independently checked against immutable responses. Empty/processing decisions retain plan-wide advice.
- The client trace compares serialized JSON; JavaScript properties with value `undefined` are not wire fields. Nulls, zeros, option order, doses, money and errors remain significant.

`test/mcp-payload/impact.json` is the scoped execution inventory. No full application, full MCP, unrelated browser or scoring-profile matrix is included. Memory tests receive no database credentials. PostgreSQL tests require an isolated localhost database on port 55439. Payment settlement is controlled by the isolated harness; clients have no database or fixture endpoint access. Live email credentials are not supplied.

Development RED logs and incomplete runner attempts are retained under `/root/.codex/visualizations/2026/09/08/mcp-payload-release/`. They are not acceptance proofs. The final `validate:dev:mcp-payload` command requires two complete executions, paired semantic equality, typecheck, release-diff lint and a production build against unchanged source. Its DEV-only deployment proof cannot substitute for another work package or environment.

The installed connector projection is separate from the application endpoint. A stale installed schema must be reported explicitly; a passing generated-artifact check or successful free-form parameter call does not prove that the installed schema was refreshed.
