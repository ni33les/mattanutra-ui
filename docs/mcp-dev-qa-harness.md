# DEV QA harness

Authenticated, DEV-only fixture and observer for the v3.0 deterministic pack. Ordinary users and the public connector never see these tools.

- URL: `https://dev.mattanutra.com/api/mcp/qa`
- DEV writes: `x-mattanutra-qa-audience: mattanutra-dev-qa` (no bearer). Missing audience is 401.
- UAT/PRD: bearer token and audience; empty token is not an open door.
- Optional on public `/api/mcp` only: the same DEV audience header plus `x-mattanutra-qa-namespace` to bind clock and principal. Public `tools/list` stays seven names.

Public `tools/list` stays `info`, `plan`, `execute`, `order`, `support`, `feedback`, `evidence`.

## Preflight

`GET /api/mcp/qa` and QA `initialize` / `preflight` return:

- `clock.settable` and `clock.now`
- `namespaces.begin` / `namespaces.reset`
- `fulfilment`: `preparing`, `dispatched`, `delivered`
- `observer`: `funnel`, `queries`, `contribution`
- `manifest`: schema checksum, live `snap_*` catalogue checksum, locale bundle hash, locales, named fixture recipes (real catalogue names only)

## Tools

| Tool | Purpose |
| --- | --- |
| `preflight` | Return the v3.0 preflight contract |
| `beginRun` | Isolated namespace + fake clock (`2026-09-02T00:00:00.000Z`) |
| `reset` | Drop that `qa-v3:` namespace only |
| `setClock` | Set the namespace clock |
| `simulate` | Payment scenario through real ingress |
| `simulateFulfilment` | `preparing` → `dispatched` → `delivered` (OMS aliases `packed`/`shipped` still accepted) |
| `setChannel` | Reporting-only `qa_campaign` / `agent_connector` plus `acquisitionMinor` |
| `observe` | Funnel events, attribution, contribution, query counters |
| `evidence` | Payment-confirm and OMS counts |
| `isolationProof` / `checkoutContinuityProof` / `latencyProof` / `packProof` | Authorized in-process proofs |

REST POST also accepts `{ runId }`, `{ namespace, reset: true }`, `{ orderHandle, scenario }`, `{ orderHandle, fulfilment }`, and `{ orderHandle, observe: true }`.

Golden commerce drive: decline → retry success → preparing → dispatched → delivered. Duplicate event ids must not bump counts.
