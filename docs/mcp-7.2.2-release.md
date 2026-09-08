# MCP 7.2.2 — open-point repair, DEV only

Base: `391ba2beafc01a49d119a85b5f632a8a6f737944` (7.2.1).
The reviewed inventory is `test/mcp-7-2-2/impact.json`. It includes the named
regressions, L1–L7, and directly affected contract, matcher, web and transaction
consumers. No full application/MCP acceptance is claimed. UAT/PRD and existing
checkouts are unchanged. Clinical reference values and fixture prices are preserved.

## RED trail and review order

| Point | RED commit | Implementation | Baseline observation |
| --- | --- | --- | --- |
| P0 listing | `0917d5c7`, assertion correction `53a04fd3` | `0f04dce7` | Three failures on native and installed declarations; input `$ref` factoring loses fields in host compilation. |
| P6 identity | `88c28abd` | `1421c6a8` | Listing checksum absent; guide URI already passes. |
| P1 clone | `ac0cbeca` | `65c10424` | JSON cloned without the old opt-in. Long-handle status fixture exceeds the limit. |
| P2 advice | `f196a575` | `b3529af0` | Three failures: repeated uncertainty, missing-reference severity, float text. Foreground filtering already passes. |
| P4 expanded | `f8a3c4f1` | `94216423` | Restart deadline fails. Serial expanded create/revise, same-plan contention and constraint preservation already pass. Historical six-job stall remains NOT_REPRODUCED. |
| P5 medications | `8b65e6ae` | `fb2e520d` | Apixaban is treated as assessed from vocabulary alone. Honest info wording already passes. |
| P3 routine | `cf581b61` | `8b8f57ae`, composition-tie consumer follow-up | Dedicated D3 golden fails; highlight already exists. |

Immutable local evidence root:
`/root/.codex/visualizations/2026/09/08/mcp-7-2-2`.
`baseline/391ba2be-named-tests.tap` replays all 27 named/lock checks against the
exact original source: 13 failures, 14 passes, zero omissions/skips/cancellations.
The serial live baseline records 25 checks, its complete calls, byte counts and
build identity in `live-baseline`. Already-passing cases are regression locks;
they are not presented as reproduced defects. Missing-threshold severity and
floating-point faults need the explicit fixtures; the live D3 baseline did not
exercise those defects. Original evidence is never overwritten.

## Intentional expectation changes

- Conversation/status text is summary and next action for every client, without
  an opt-in header. Structured results retain functionality. Full/details/errors
  retain complete JSON text. The old header remains accepted.
- PAY-VIEW-01/04 expect one foreground/plan uncertainty notice with the union of
  evidence identifiers and uncertainty codes. Measured rows retain their exact
  numbers and provenance; full/details retain all original rows. Message-only
  formatting removes floating-point display artifacts.
- The independent finite oracle and Phase 1 single-target test now prefer the
  equally accurate single-nutrient product, based on composition, before the
  existing pill/product/price ties. The 160/80 THB fixture prices are unchanged;
  the 80 THB incidental alternative must remain available. Multi-target priority
  and arithmetic are unchanged; title-only preference is still unsupported.
- The historical real D3 fixture retains unknown administration, so its two
  servings cannot assert a known pill count. A separate reviewed DEV correction
  establishes one oral capsule per labelled serving. Its test preserves unknown
  pack size, nutrient confidence, amounts, prices and reference identities.
- The highlight test always requires an eligible positive-coverage alternative.
  `alternativeSearch` describes the separate fewer-concerns search and can be
  `incomplete` after the selected basket changes; it is not relabelled `found`.
- Expanded testing uses a committed standard revision followed by expanded
  exclusions and a competing revision. Real worker execution is explicit;
  processing preconditions cannot silently pass via the synchronous test shortcut.

## Scoped execution and release

`npm run test:mcp:722 -- --list` prints the inventory.
`npm run validate:dev:mcp:722 -- --output /absolute/new/evidence/path` runs affected
tests once, typecheck, entire release-diff lint and one production build. Source,
schemas, fixture inputs, inventory, execution counts and compiled build are bound
to a DEV-only attestation. CI runs the scoped test inventory and L1–L7; it neither
calls customer environments nor executes unrelated suites.

Set `TEST_DB_URL` to an isolated PostgreSQL database on a non-production port.
`test/mcp-7-2-2/prepare-postgres.mjs` prepares the owned clean fixture, then apply
`scripts/apply-agentic-commerce-schema.ts`. Missing database prerequisites fail.
The reviewed correction manifest is tested with the real applier and idempotent
replay before DEV application. Operation deadlines are additive JSON metadata;
legacy operations fall back to creation time, and stale completion remains fenced.

Deploy only the exact validated source/build with
`npm run deploy:dev -- --mcp-722-attestation /absolute/evidence/attestation.json`.
Apply `data/catalogue-corrections/mcp-7.2.2-dev.json` separately after code/worker
verification, using the guarded correction applier and preserving its audit receipt.

Run the identical named native DEV assertions with
`node scripts/mcp-722-live.mjs --output /absolute/new/evidence/path --build <commit>`.
This uses published schemas, real public calls and returned identifiers; no payment
or email is initiated. It is not an installed-connector check. Actual hosted
definitions must be refreshed by the connector owner and verified separately in a
fresh session; P0/P6 hosted sign-off remains outstanding until that succeeds.
