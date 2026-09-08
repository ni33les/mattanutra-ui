# Frozen Anna scoring experiment inputs

`anna-dev.json` and `anna-uat.json` preserve separate reconstructed corrected baselines. Each starts with the archived 7 September 2026 catalogue (154 seller listings, 79 products) and overlays the reviewed 57 administration changes, three exact fact corrections and six nutrient reference corrections. Original seller quotes, stock observations, fact confidence and health-context uncertainty are retained. These are offline reconstructions, not new live catalogue captures.

`manifest.json` pins the fixture bytes. Each fixture records original source hashes, the baseline catalogue fingerprint, correction receipts and their before/after fingerprints. The loader verifies every reviewed before record, all 18 original reference heads, all 31 appended reference changes and the 79-product review. Latest null heads retire a scope and never reveal an older limit. DEV and UAT retain their different internal advisory thresholds.

The four cases are `anna-dev-create`, `anna-dev-revise`, `anna-uat-create` and `anna-uat-revise`. Revision changes only the objective from `lowest_cost` to `best_coverage`. The original four target amounts, two-product/two-pill preferences, explicit empty current supplements and unknown diet remain intact. The production normalizer runs in a child with no inherited credentials and disabled network transports; the result uses request-scoped reference ceilings without changing global caches.

Only explicit catalogue, reference and request fields are retained. No customer/contact records, order/payment identifiers, capability handles, raw administrative tables or MCP transcripts are included. The deidentified health context remains sensitive; opaque case IDs should be used in exported reports. Original health context is not a claim that these fixtures represent population-level clinical outcomes.

The historical `../anna-v6/dev-baseline.json` remains unchanged. It is a historical control, not a corrected input or golden expectation for new curves.

To rebuild from preserved local evidence only:

```sh
node test/fixtures/matcher-experiments/freeze-anna-inputs.mjs /path/to/preserved/baseline /path/to/preserved/anna-v6-release
```

The rebuild command reads the preserved baseline manifests, database/matcher JSON, tracked correction manifests and existing rollout receipts. It verifies the source hashes and reference receipt identity before writing allowlisted fixture files. It does not import database clients or make network requests. A changed fixture or manifest requires review; never rebuild historical evidence from live data.
