# Discovery expectation changes — 9 September 2026

Baseline: 41ed9fd07e8b9c8814d361eab33d72b27ac7c157, contract 7.2.4.

- All 29 DISC IDs remain. Metadata gaps were observed RED before implementation; existing invariants are regression locks, not fabricated RED results. DISC-DET-05 initially exposed a test inventory regex omitting I18N IDs; its corrected regex counts all 29.
- COPY-RED, A-UNIT, S4, 82-VAL, SCORE and LIVE-TRUST IDs retain product and wellness checks. The approved info sentence is exact; stock/pharmacy context is checked on initialization, and responsibility is checked as a structured version field. The old prose-only requirements and word budget must not override the new approved copy. Historical v3 scorer goldens remain unchanged and supported alongside the current proposition.
- M721-HOST-03 reads operational host guidance from the generated instructions field. Short connector positioning no longer repeats the full instructions. AG72-CARD-01 expects the approved purpose sentence followed by the unchanged operational card, with the existing size limits.
- PAY-SCHEMA-01 had already exceeded its historical 65% byte target before this package: 7.2.4 intentionally inlined callable input schemas for schema-only hosts. The immutable baseline-tools fixture preserves that served publication. Replacement: input/output schemas equal that baseline, complete seven-tool inventory, and at most 2,000 additional bytes for titles/purpose copy. No schema or fixture price is changed.
- LIVE-TRUST discovery checks the valid POST-only transport (GET 405), then checks tools/list against the served contract with seven tools. Six-tool and GET-discovery historical results remain untouched.
- Full regression uses the existing complete MCP/matcher inventory once for the DEV release cycle and once after UAT promotion, in isolated databases. No full application or unrelated browser suite is claimed.
- Local adapter parity and native endpoint probes are not installed-host proof. A missing owner refresh/export remains an open integration requirement.
