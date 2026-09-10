# Practical matching expectation ledger

Release control: `ab102ab3930cbaea0594847152ac010bcae722ca` (DEV and UAT).

- PRACTICAL-SCORE-01 replaces dose-first default ranking with the approved shared weighted penalty. Raw dose arithmetic, clinical reference content and prices do not change.
- Numerical preferences remain advisory. Profiles affect ranking only; no new eligibility conditions, locks or execution queues are permitted.
- Historical results remain historical. Every later changed assertion must identify its replacement behaviour and independent arithmetic here.
- The reported assessment is in DEV, not UAT. Evidence exports permit only matching inputs, catalogue/reference facts, quantities, preferences and generated matching results; contact and capability data are excluded.

## Contract 8 maintained expectations

- Advisory-dose-fit bounded-frontier case now asserts deterministic traversal and the same expansion allowance per selected profile. Identical dose-first winners across profiles would contradict the approved weighted policy.
- ADV6-CORE-04 compares the actual purchasable one-product choices, including fallback when no purchase wins. Unknown quantities keep null actuals and an uncertainty penalty; the `simpler` role still prefers verified counts. Unknown is not required to rank behind arbitrarily large known overruns.
- V5-COUNT-02 keeps the two-product zero-preference purchase choice available instead of requiring it as the default.
- V5-DOSE-01, V5-INTAKE-01–03, V5-SEARCH-01/05, V5-REPAIR-01/03/04 and ADV6-REPAIR-01 retain their exact SKU, quantity, exposure and price assertions on the returned `closest_dose` witness. Weighted default assertions live in PRACTICAL-SCORE/SEARCH/ORACLE. An absent or worse exact-dose witness remains a regression, not an expectation to weaken.
- V5-REPAIR-02/05 and V5-SEARCH-03 require expansion to preserve the incumbent's overall score under the selected profile. Catalogue ordering and deterministic results remain asserted.
- V5-OPTION-02 now recommends the existing 99.9%-fit cheap choice under `lowest_cost`, preserving the exact-fit alternative, original prices and 0.1 gap. V5-OPTION-03 retains the exact two-product basket while allowing the simpler partial choice to be recommended.
- Phase-2/QA-GOLD M-01/M-05 retain the original exact-dose golden products, quantities and ฿610 price as an exposed trade-off. Phase-3's above-budget exact SKU remains selectable, without requiring a very expensive basket to be recommended.
- V5-CHECKOUT-01/02 and V5-CHECKOUT-PG-01 call the explicitly named mutation-fence method when checking checkout publication. PRACTICAL-CHECKOUT-PG-01 separately proves the preview method does not lock. Existing frozen-payment expectations remain unchanged.
- The numeric-preference browser fixture explicitly selects its returned exact-dose basket above zero preferences; it does not require that basket to be the default. Original C/D3 labels and ฿23/฿17 fixture prices remain unchanged.
- New PRACTICAL-SEARCH-04 fixture uses a preference of two for a known two-pill option, isolating an unknown-as-zero bug rather than incorrectly demanding that uncertainty outweigh every known overrun. No historical fixture changed.
- The isolated PostgreSQL RED setup initially rejected an incomplete environment (DB_URL missing). The subsequent valid isolated run reproduced SQLSTATE 55P03 on a held catalogue writer; only that run counts as the contention RED.
