# DEV QA harness

Authenticated, DEV-only fixture and observer for the v3.0 deterministic pack. Ordinary users and the public connector never see these tools.

- URL: `https://dev.mattanutra.com/api/mcp/qa`
- Auth: `Authorization: Bearer $MCP_QA_TOKEN`
- Audience: `x-mattanutra-qa-audience: mattanutra-dev-qa`

Public `tools/list` stays `info`, `plan`, `execute`, `order`, `support`, `feedback`, `evidence`.

## Tools

| Tool | Purpose |
| --- | --- |
| `simulate` | Drive a payment scenario for one `orderHandle` through the real payment ingress |
| `simulateFulfilment` | Drive `processing`, `packed`, `shipped`, or `delivered` through the real fulfilment ingress |
| `observe` | Read funnel events, attribution, and contribution for one `orderHandle` |
| `evidence` | Payment-confirm and OMS counts for one order |
| `isolationProof` / `checkoutContinuityProof` / `latencyProof` / `packProof` | Authorized in-process proofs |

Golden commerce drive: decline → retry success → processing → packed → shipped → delivered. Duplicate payment event ids must not bump counts.
