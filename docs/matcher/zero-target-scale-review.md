# Zero-target engineering scale review — policy 1

Pure importance uses `weight × exposure / scale` for an explicit zero target, on its requested intake basis. A zero weight disables only that component. Fixed diet and continued intake are not removable decisions. Neither a reference limit nor the smallest storage unit defines the scale.

The initial supported scales are **Vitamin D3: 25 mcg (1000 IU)** and **Selenium: 50 mcg**. These are engineering reference quantities chosen from individual captured catalogue composition rows, not recommended doses or clinically calibrated limits. A full scale represents one unweighted penalty point. Fifty mcg of D3 therefore costs two points, while 50 mcg of selenium costs one. Fractional importance multiplies these points directly.

The versioned in-memory `ZERO_TARGET_POLICY` records the exact frozen fixture hash, product IDs, original labelled amount/unit and provenance. The D3 anchor is the captured Blackmores Vitamin D3 1000 IU listing. Selenium is the Blackmores Multivitamin Active row at 50 mcg. Both source rows were entered by an administrator and lack external label provenance. This review selects comparison units; it does **not** verify or upgrade those nutrient facts. Acceptance checks those exact original rows and units and preserves fixture prices. No claim of optimal production calibration is made.

Other ingredients have **SCALE_UNREVIEWED** status. Their zero targets return an explicit amount-field error before admission; no fallback denominator is invented. Positive targets and categorical exclusions remain available. Extending support requires a versioned scale/provenance entry and fixture trade-off review, not a database write or clinical-reference change.

Exposure in different supported units converts to the same immutable physical scale. At zero target, coverage is binary: quantified zero contributes 100%; confirmed positive or uncertain exposure contributes 0%. Uncertain totals stay incomplete, with supported lower bounds. There is no percentage of a zero target.

The finite selenium fixture compares an exact-target incidental basket supplying 50 mcg with a clean basket covering 90% of the positive target, at unchanged prices. Importance one selects the clean trade-off; importance zero restores the exact-target basket. An explicit retained-product refinement can still request the incidental basket above preferences. Raw dose fit and commercial values are recorded separately from weighted score differences.

The policy hash covers coefficients, precision (six decimal places), numerical normalization constants and this complete scale manifest. Existing task/cursor/cache identities carry that hash; retired coefficients cannot resume as the new policy. All evaluation remains in memory, outside mutation transactions.
