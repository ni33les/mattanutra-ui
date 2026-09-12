# Availability 11.1.0 — reviewed expectation changes

Release baseline: 815bb210e38b2809b9aba32260693c70c048005c. DEV and UAT only.

- AVAIL-MCP-01–05: operational catalogue omissions are per-item results; malformed quantities, physical increments and exclusions remain errors. Original inputs survive independently of executable proposals.
- AVAIL-MCP-06–07: partial create/refine/replay stays usable in all three locales; an entirely unavailable request reaches a non-purchase terminal result. The maintained synthetic D3 catalogue supplies 2,000 IU per physical unit, so the journey uses that unchanged labelled dose, not a 1,000 IU target whose exact-score winner can legitimately be empty.
- AVAIL-WEB-01–09: new formulas may contain only product-backed permitted names, including after generation and publication. Empty input/output completes. Allowed IDs cannot disguise unsupported names. Existing completed formulas and frozen orders are preserved.
- AVAIL-COPY-01–03: raw positive coverage remains positive; exact zero and unknown have distinct localized labels. The strictly-greater-than-12% headline rule is unchanged. The existing empty-diagnostics assertion now requires null, not invented zero; unknown rows do not manufacture food gaps. Existing browser count cases additionally check exact-zero, tiny-positive and missing observations.
- AVAIL-SPEC-01 and existing SPLAN publication/hosted/no-option cases: current publication advances 11.0.0 to 11.1.0 with availability/requestIssues. Historical artifacts and fixtures remain evidence; current tests follow the current contract. No compatibility adapter is introduced.
- Historical UAT fixture: snapshot snap_0bdcc94c32656477, 154 seller listings and 162 allowed ingredients, captured read-only on 2026-09-12. Prices, source identifiers and facts are unchanged. Psyllium and standardized garlic have no eligible quantified supplier; plant sterols are supplied by Choles-Bloc. This is catalogue evidence, not a customer health-data export.

RED evidence is retained outside the checkout in /root/.codex/deploy/availability-20260912: mcp-red.log (five failures), web-red.log (three), presentation-red.log (three), web-boundary-red.log (two). Product fixes follow committed failing cases. Focused and final execution logs retain failures rather than overwriting them.

No full application or full MCP coverage is claimed. The impact inventory selects changed protocol, formulation, projection and directly affected commerce/readiness consumers. Browser execution covers the existing count/retry journey in three locales without repeating AI matching.
