> Historical implementation record. For the current six-tool, single-recommendation protocol, use the [generated MCP client guide](../../contract/mcp/11.0.0/README.md). Retired tools, identifiers and response modes described below are not the current public API.

# Customer-value regression expectations for matcher v5

The original case IDs and historical result artifacts remain unchanged. The active
contract assertions use the published contract version; archived v4 resources
remain covered by the contract-history tests.

| Cases | Obsolete assumption | Maintained behaviour |
| --- | --- | --- |
| FIX-01–06, CV state and value packs | A memory store can publish a live-epoch snapshot without checking its epoch. | Frozen fixtures implement a transaction-only exact-epoch check. Missing or mismatched epochs still fail closed; PostgreSQL publication fences are unchanged. |
| FIX-02 and shared conditional-target cases | A medical-status question is a prerequisite for purchase. | The pending choice is explicitly whether the customer wants a provisional target. Target amounts, medication context and ordinary revision/idempotency checks remain. |
| FIX-06, DEV-CONTRACT-02/04 | Current schemas must equal archived v4 schemas. | The seven tools and five operations must match the active generated contract, manifest and checksum. Archived v4 files are preserved. |
| REG-CV-03, DEV-SAFETY-06 | Raising a target from 150 mg to 300 mg can retain a 187.5 mg maximum. | The overlap scenario requests a coherent 300–375 mg range. Existing 150 mg intake remains exact; the result must account for both continued and new sources. |
| DEV-STATE-03 | An unselected plan may select frozen catalogue facts after those facts change. | A historical get remains readable; selection returns actionable availability_changed; replanning obtains a different catalogue identity. |
| DEV-PACK-01, DEV-ECON-01, DEV-SAVE-01/06, R3 and R4 financial cases | A retail title supplies a verified pack size. | These financial invariants use the already-maintained sampleValueSnapshot with its explicit administration provenance. The existing 39000/25000/12000/45000 prices and 3 g/150 mg/1000 IU labelled doses remain unchanged. Ordinary FIX and IMPL cases still use the untouched isolated retail freeze; unknown-pack controls remain. |
| R3-ORD-04 | A one-serving daily schedule must replenish a 90-serving pack before day 90. | The multiple-shipping-event scenario explicitly uses two supported 150 mg servings daily: the same 25000-minor pack supplies 45 days. Exact dose, price and supply assertions accompany event reconciliation. Other cases retain the one-serving schedule. |
| R2 inventory, pack arithmetic, order, savings and hash cases | Financial preconditions can be inferred from retail titles or absent pack metadata. | Scope these calculations to the same maintained declared financial fixtures; ordinary coverage, unknown-pack and safety cases retain the isolated retail freeze. Original case IDs, prices and arithmetic assertions remain. |
| R2-PACK-02/04/05 | Unavailable reasons are strings; removing a title removes structured pack facts; a repair can pass merely because the fixture still exists. | Read structured reason codes, remove the actual administration metadata in missing-fact controls, and require the repaired product in the returned basket. PACK-05 exposed and retains the regression for incomplete catalogue cache identity. |
| IMPL/R2/R3 repeat-run checks | Matching assertion statuses alone proves deterministic business responses. | Compare complete normalized request/response evidence, retaining doses, prices, advice, quantities, constraints and state. Explicit missing fixtures fail rather than skip. |
| DEV-DET-03/04 | A pass flag or a repeated unchanged request proves result consistency. | Retain all ten repeated results and all twenty permutation requests/results in acceptance evidence. Execute the actual permutations, compare complete coverage rows by nutrient identity and compare the full basket; requested display order may differ. |

Missing fixture preconditions fail the pack instead of skipping cases. R3 and R4
load the same isolated administration safety ledger as the retail packs; financial
fixtures do not invent or override safety limits. The unknown-duration cases retain
their prohibition on unsupported horizon coverage or lowest-cost claims.
