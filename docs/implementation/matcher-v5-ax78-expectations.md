# AX7/AX8 expectations for contract 5.0.0

Historical case IDs, reports and fixture prices remain unchanged. The maintained
report versions advance to `agentic-experience-7.2` and
`agentic-experience-8.1` to identify these intentional contract changes.

| Case | Retired expectation | Maintained replacement |
| --- | --- | --- |
| AX7-03 | Thirty targets require a breadth block, splitting, or a purchasable basket. | A completed empty match returns `no_purchase`, all 30 requested targets and their gaps, and stable replay. The ten-target control retains its exact four products and 467300-minor-unit price. |
| AX7-04 | Reconstruct an executable request from forced split groups. | Reconstruct every original name, quantity and unit from the public coverage/leftovers; reject 31 targets through ordinary validation; retain the independent Vitamin A unit-conversion check. |
| AX8-01 | An uncovered B12 target requires an answer before the otherwise useful basket is ready. | The same B-complex SKU, 18900 price and one-serving dose remain confirmable. B1/B6 contributions stay exact; B12 remains uncovered with a 250 mcg gap and cannot appear as a covered ingredient. |
| AX8-03 | Seven gaps are automatically bundled into a mandatory question. | All seven named, quantified gaps appear in public advice without a blocking question. D3 remains 1200/2000 IU with an 800 IU gap; manganese remains 1.75/2.3 mg with a 0.55 mg gap. |
| AX8-04 | A synthetic gap-answer operation changes targets without rematching. | An explicit customer patch removes Iron and sets D3 to 1200 IU. It rematches exactly once, preserves other targets and medication/intake context, replays idempotently and rejects stale revisions. The existing SKU, 8900 price and one-serving dose remain fixed. |
| AX8-06 | Thai gap-question prompts contain the requested target names. | English and Thai public gap advice preserve the same names, reasons, units and quantities; both remain ready without gap questions. Existing explanation-key and payload-budget assertions remain. |

The AX8 matching stub now responds to explicit target revisions. Its original
product contributions and prices have not changed. This prevents a fixture
that always returns old requested quantities from masking revision behavior.

The complete pack rollups AX7-06 and AX8-07 still require every preceding case.
AX7-01/02/05 and AX8-02/05 retain their unrelated assertions. No test is skipped
or removed, and no historical acceptance artifact is rewritten.
