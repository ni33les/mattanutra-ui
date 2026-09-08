# MCP 7.2.3: refinement and concise decisions

Release control: `380a1dd08ededd7dfcf25aef45ab3c4649b65b2b` (7.2.2).
DEV only. `impact.json` is the bounded test inventory. No matcher arithmetic,
clinical reference, catalogue, database schema, payment or UAT changes.

## Evidence and honest classification

Immutable run evidence is outside the checkout under
`/root/.codex/visualizations/2026/09/08/mcp-7-2-3`.
Tests were committed in `3bf20e86` before product changes.

| Requirement | Valid control observation | Candidate behavior |
| --- | --- | --- |
| Installed get/create schema and service blurb | Three named tests fail against observed installed declarations (`01-hosted-red.tap`). Native endpoint already passes. | Regenerated shared 7.2.3 artifacts. Actual hosted refresh still requires a separate owner action and observation. Native success never closes this item. |
| Published version and get hash | Already passes natively | CI checks native, published, well-known and adapter identities; historical 7.2.2 resources stay exact. |
| Short conversation text | Current installed response has one text block, no reproduced clone. A valid long question and long summary exceed 800 characters in named regression. | Text is bounded summary plus next action; complete decision and questions stay structured. |
| At most five advice rows | Eight distinct measured findings yield eight rows; adding missing information yields nine. | Grouped speaking rows retain each distinct finding, exposure, reference, uncertainty and source identity. Full/details remain exact. |
| Independent expanded jobs | Both complete with constraints intact. An injected statement timeout during real HTTP hydration returns 500/-32603. | Same fault returns a retryable MCP business result and poll_plan; workers retain original work. Unexpected defects still fail. |
| Dedicated D3 / highlights | Already passes frozen and live control | Lock the exact one-product, two-pill routine and returned alternative. |
| K2 plus D3 | Both frozen and live control have a D3-only option but hide its K2 gap in summary | Disclose the one-product D3 choice and 90 mcg K2 gap. Options, selection and dose score are unchanged. |

Initial fixture setup errors (short idempotency keys, schema traversal, and a
wording assertion) are preserved but **not** counted as product RED evidence.
Passing control cases are regression locks; no artificial failure is claimed.

Intentional expectation change: PAY-VIEW-01/03 now verify original findings
inside grouped rows as well as standalone rows, retaining exact measurements,
uncertainty and source checks. PAY-VIEW-02 still verifies full advice verbatim.
No fixture prices or historical results changed.

## Commands

- `npm run test:mcp:723 -- --list`
- `npm run validate:dev:mcp:723 -- --output /absolute/new/evidence/path`
- `node scripts/mcp-723-live.mjs --output /absolute/new/live/path --build <commit>`

The gate runs only the reviewed inventory, typecheck, release-diff lint and one
production build. It rejects incomplete or changed proofs. The native live
client uses only published schemas, public tools, returned identifiers, fixed
fictional requests and documented polling. It performs no payment or email
operation. It never asserts that installed connector definitions were verified.
