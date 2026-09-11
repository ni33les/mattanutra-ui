> Historical implementation record. For the current six-tool, single-recommendation protocol, use the [generated MCP client guide](../contract/mcp/11.0.0/README.md). Retired tools, identifiers and response modes described below are not the current public API.

# MCP 7.2.1: scoped DEV release

This package changes hosted discovery verification, optional response transport,
conversation advice, and equal-dose routine ranking. It does not run or claim a
full application/MCP acceptance gate. UAT and PRD are outside this rollout.

## Compatibility and intentional expectation changes

- Historical six-tool connector exports still validate against their historical
  contracts. Current exports require all seven published tools, including evidence.
- JSON text remains complete unless the request explicitly sends
  `X-MattaNutra-Result-Content: structured`. Enable that header only after observing
  structured results in the actual connector. Full/details/errors retain JSON text.
- PAY-VIEW-01 now checks inline advice for selected/highlighted options; PAY-VIEW-02
  still requires exact full details for every option. Missing-reference notices
  summarize original findings without merging measured excesses or interactions.
- The existing pack-price tie test now expects the 55,000-minor one-serving option
  ahead of the 48,500-minor two-serving option at equal dose fit. Both fixture prices
  remain unchanged. The country-eligibility case now selects the 21-minor one-pill
  option and retains the 10-minor two-pill alternative. Dose and exclusion checks
  remain intact; M721-ROUTINE-01–03 independently cover the new ordering.
- A target-focused product can remain visible with `roles=[]` and a localized reason
  even when unknown administration facts prevent a verified pill comparison. It is
  not labelled cheaper, safer, or simpler without evidence. No new option-role enum
  or mandatory purchase condition is introduced.
- The 7.2.0 native resources and all prior artifacts remain historical. The 7.2
  explicit-version compatibility window is retained. Existing checkouts are frozen.

## Focused validation and DEV deployment

`npm run test:mcp:721 -- --list` shows the reviewed affected-file inventory.
`npm run validate:dev:mcp:721 -- --output /absolute/new/evidence/path` runs it once,
then typecheck, release-diff lint and production build against unchanged source.
It uses frozen inputs, memory stores, mock payments and blocked external networking;
there are no SQL migrations or live automated test mutations in this package.

`npm run deploy:dev -- --mcp-721-attestation /absolute/evidence/path/attestation.json`
requires a clean dev branch, the DEV environment and the exact attested build.
Ordinary full-gate and previous package deployment paths remain available.

Hosted acceptance requires an actual installed-client export, not tools/list alone:
verify all seven tool names, current descriptions, complete operation schemas, and
the ability to receive structured results. Documented host wrappers are normalized;
unrecognized schema rewriting fails rather than weakening validation.

No refresh/configuration API for the installed connector is exposed in the current
agent session. Connector refresh and opt-in remain separate operator steps and must
be reported as outstanding until verified in a fresh session.
