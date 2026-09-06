# Observation and event consistency v1.1

Implementation baseline: `cae1277057aa228588ff2be2684eac7c24fdd79d` on `dev`.
The supplied source evidence concerns the earlier UAT build `c4a480545bb08ba7b9b10dcee09febb259a616b7`.

## Current status: preparation only; acceptance blocked

The required four frozen acceptance files and two historical evidence ZIPs are not available in the searched local locations. Their expected hashes are recorded in `test/agentic/consistency-v11/acceptance-assets.json`. The verifier checks actual bytes, including the inner `artifacts.json` for each evidence ZIP. Hash metadata alone is not verification.

Run the prerequisite check after locating those files:

```bash
python3 scripts/verify-mcp-acceptance-assets.py \
  --assets-dir "$MCP_ACCEPTANCE_ASSETS_DIR" \
  --evidence-dir "$MCP_ACCEPTANCE_EVIDENCE_DIR" \
  --output "$MCP_CYCLE_EVIDENCE_DIR/acceptance-assets.json"
```

Exit 0 means only that the acceptance asset bytes match the supplied hashes. Exit 2 blocks progress. The script does not import or replace the frozen runner, verify product correctness, or certify an A/B run. There is no automatic download, acceptance retry, or hash replacement.

## Preparatory changes

- `allTestFiles()` now discovers nested `.test.ts` files as well as root files. Existing assertions are unchanged. The original collector omitted 19 nested source files, including six agentic value suites.
- `PREP-COLLECT-01` reproduced that omission twice against the original collector and passed twice after the change.
- Seven `PREP-ASSET-*` tests cover matching/missing/modified bytes, invalid and ambiguous archives, inner-artifact hashing and a nonzero CLI result for missing official files. These use explicitly synthetic verifier fixtures; they do not stand in for HY-01–HY-05 or the historical evidence.
- The eight preparatory tests pass twice. Typecheck and changed-file lint pass. TypeScript's existing configuration excludes `test`; the new TypeScript tests are also executed by the Node test runner.

Preparation validation command:

```bash
node --test --experimental-strip-types \
  --import ./scripts/register-ts-path-loader.mjs \
  test/mcp-test-discovery.test.ts test/mcp-acceptance-assets.test.ts
```

The newly discovered six agentic value suites were also executed once against unchanged product code: 29 tests, 23 pass, six fail, zero skips. The failing assertions are:

- Slice 0: `does not invent pack servings from a product title`
- `AGENT-01 one plan response explains recommendation purchases omissions cash burden and next action`
- `SAFE-01.A atrial fibrillation and apixaban are assessed on every option`
- `SAFE-01.B apixaban plus omega-3 is a frozen acknowledgement on every option, never a cheaper hard block`
- `SAFE-01.D deferred and omitted targets add zero proposed exposure`
- `DET-01.A two canonical runs are byte-identical and keep prices products roles savings and safety`

These baseline failures remain attached to this preparation attempt. They have not been suppressed, reclassified or treated as product RED for OBS/EVT. No assertion or fixture was changed to make them pass.

## Remaining mandatory work

Obtain and verify the six assets, freeze the real catalogue and exact F_READY_MAG fixture, resolve the unavailable-error oracle and actual runtime case inventory, and implement every OBS-01–08, EVT-01–04 and HY-01–05 parameterized case. Product corrections must follow genuine controlled RED twice with two processes sharing PostgreSQL. The protected inventory and artifact-aware release gate remain to be implemented. A read-only GitHub check found no current protection rule on `dev`; local scripts alone cannot establish a required remote status check.

Then execute the complete MCP suite and unchanged official A/B pack for the exact candidate, preserving the sole TECH-07 exception and separate official/policy results. The present preparatory checks are not a successful development cycle or release sign-off. The complete MCP gate, production build and official A/B acceptance have not run for these preparation commits. No application/worker deployment, UAT change or observation/event product correction has been made.
