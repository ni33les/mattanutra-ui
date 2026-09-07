# Matcher v5 maintained value-slice expectations

The current-source baseline retained all 42 cases and found eight failures. The
historical run and its prices remain unchanged. These updates preserve case IDs,
financial assertions and the exact 3 g creatine / 150 mg magnesium fixture doses.

| Case | Previous assumption | Maintained v5 behaviour |
| --- | --- | --- |
| Continued inventory: missing pack facts | Removing serving-label text removes pack knowledge. | Clear the fixture's verified `administration.packQuantity` as well; missing pack or price still prevents complete future-cost and savings claims. |
| Slice 0 live freeze | An unusable catalogue could return after a no-fixture assertion. | Both isolated catalogue captures must be usable; missing setup is an actionable failure. |
| VAL-02 / OPT-01 | At most two options. | The unchanged fixture produces three distinct closest-dose, lower-cost and simpler choices. A lone basket merges applicable roles. All remain deduplicated, eligible and non-dominated. |
| COST-04 | Any partial basket must have `equivalent: false`. | A partial basket may have an equally partial baseline. It is not recommended over the exact core fit, discloses reduced coverage, excludes the uncovered core product from its baseline and claims no savings against the complete choice. Required coverage is checked at 100%. |
| OPT-02 | Moderate-confidence calcium is quantified as a verified incidental. | Preserve the unchanged labelled 500 mg calcium fact and its moderate confidence; do not invent verified exposure or requested calcium coverage. |
| OPT-04 | Every secondary role is `fewer_concerns`. | An independent finite-fixture oracle derives the v5 roles from dose loss, goods price, physical burden and concerns. It imports no production candidate, scoring or selection implementation. The legacy primary role remains checked too. |
| SAFE-01.C | The cheap excessive magnesium product must disappear from every option. | The exact 150 mg dose stays recommended. The unchanged 2,000 mg / 900-minor-unit product remains an eligible lower-cost choice, with 2× limit excess penalty and serious, sourced, quantified, nonblocking advice. A scoped 350 mg reference fixture makes the safety assertion explicit and is restored after the case. |
| DET-01.C | Equivalent units must produce the same canonical identity. | This expectation is unchanged. A separate production fix converts leftover mass amounts and unit annotations instead of hashing their presentation units. New regressions preserve unequal doses, nutrient forms, unsupported units and advice differences. |

Slice 1 and all unrelated assertions remain intact. No historical results, SKU
identities or fixture prices were edited. Evidence is stored outside the checkout
under `/tmp/mattanutra-flexible-v5-evidence/value-slices`.
