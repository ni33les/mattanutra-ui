# Web matching correction release

Control: e46e16016fe0544d48da37224dde614bc153ee15. Retain the separately committed payment-return recovery when releasing. PRD remains unchanged.

- WM-01/02: questionnaire dietary and food allergy answers reach existing product exclusions. Capsule preference does not imply vegan. Missing allergen evidence is not an assurance of absence.
- WM-04/05: ten billion CFU remains ten billion, not ten CFU.
- WM-06–08/17: measured curcumin is distinct from turmeric powder or unquantified extract. Original facts remain visible as incidental facts.
- WM-09: unknown product quantities retain null totals; web uncertainty responds to the explicitly strong pill preference (one point per unknown product for balanced), while existing MCP coefficient behavior remains unchanged.
- WM-10/11: unknown monthly supply does not remove the independently known first-order price objective. No estimated monthly price or false budget overrun is invented.
- WM-13/16: contributions no longer promise a strong match or a routine complying with diet, pill or budget preferences before matching. Formula and UI layout are unchanged.
- Matcher identity advances to importance-matching-3; web profile advances to web-practical-penalties-4. Four existing customer-value tests update their exact matcher-version expectation only. Their original cases, assertions, prices and evidence remain intact.
- Public six-tool contract remains 11.0.0. No locks, schema changes, financial updates, catalogue seeds or UAT data corrections are part of this code release.

The reported catalogue fixture retains original product prices and incorporates the six separately audited DEV label corrections. It is a corrected frozen fixture, not a new live snapshot. Full historical input/results and RED logs remain outside the checkout under /root/.codex/diagnostics/match-f2091aaa and /root/.codex/deploy/web-matching-correctness-20260912.

Validation selects the reviewed impacted inventory and rejects incomplete or skipped execution. This is not a full application or full MCP acceptance claim.
