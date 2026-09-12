# UAT gap repair

Control: 9294c22a; catalogue/reference revision 99. Original captured catalogue prices and the historical result remain unchanged in fixtures.

- GAP-01: a standard search must retain a feasible practical basket at least as good as the reproduced one-product addition. Existing scoring gives the saved basket 6.301283333333333 and the witness 6.046333333333333.
- GAP-02: with the manufacturer-supported active B12 correction, the same input must discover a basket at least as good as the six-pill, three-product witness (5.533133333333334); the existing 8,000 budget is preserved.
- GAP-03: diagnostic candidate/eligible counts use the same nutrient aliases as matching; exclusions remain effective.
- Numerical weights, physical quantities and safety penalties are unchanged. No extra matching locks or work budgets.
- DEV already contains the correct Relacza B12 fact and must not be rewritten. UAT's independent audited manifest corrects mg to mcg and records the manufacturer evidence. Prices, clinical references and frozen orders are untouched.

RED evidence: /root/.codex/deploy/uat-match-repair-20260912/red-behaviour.log (all three named cases fail on control).
