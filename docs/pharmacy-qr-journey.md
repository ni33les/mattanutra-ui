# Pharmacy QR journey (DEV)

Public entry: `/retail/{pharmacy}/landing`; questionnaire: `/retail/{pharmacy}/quiz`.
Locale middleware supplies EN, TH or zh-CN. `delight` aliases the existing `delight-pharmacy` organisation; no organisation is renamed.

The existing questionnaire capture binds the pharmacy server-side. Formula and HealthScore explanation jobs run independently; product matching follows the formula. Pharmacy reveal waits for the formula/product result, not the optional explanation. The same existing matcher evaluates that shop's eligible listings at captured RRP, without the online margin. The original source locale/revision remains the generation identity when a visitor switches display language.

`POST /api/retail/orders` accepts `planId`, `pharmacy`, `locale`, `expectedRevision`, `productIds` and `customerName`, with `Idempotency-Key`. Server data supplies prices and first-order packs. `GET` retrieves an owned receipt or current quote; `view=analysis` reads the explanation for that order's frozen revision. Possession of the existing opaque assessment identifier follows the existing web access model; a human order reference alone grants no access.

Orders use source `pharmacy`, status `placed`, and explicit unpaid/pay-at-till metadata. No online payment, financial booking, stock allocation, shipment or settlement is initiated. The shared order-creation revision/catalogue fences protect only final validation and necessary writes. Reused task infrastructure commits the notification request with the order and dispatches after commit. Delivery failure cannot invalidate a saved order. Counter payment/collection/POS integration is outside this version.

The order UI reuses existing basket/order-summary styles. It removes address, billing, shipping and Stripe controls; it adds product inclusion, name/nickname and pay-at-till copy. Attached examples provide structure and text, not customer facts, prices, clearance claims or fixed counts. Deep-dive results distinguish the original formulation from the ordered product subset.

## Save the plan in LINE

The ready pharmacy page and deep dive prepare a local QR image automatically. It opens MattaNutra's official-account chat with a short-lived `MN PLAN` connection code; the same link supports phones already running LINE. The customer taps Send. A signature-verified private message then connects the saved assessment and queues an English, Thai or Chinese greeting with its full-plan link. A saved order retains its frozen-order link. Neither the QR nor an external image service receives questionnaire data.

Connection, message and existing dispatch-task records commit together. Duplicate deliveries reuse the same message and provider retry key; provider acknowledgement controls sent status. QR preparation alone never claims delivery. Expired codes refresh on the page; failed preparation offers an explicit retry. The ordinary website's LINE flow remains unchanged.

The LINE account's webhook must point to its own environment's `/api/line/webhook`. Verify this separately from application deployment. Focused validation: `node scripts/mcp-721.mjs validate --package=pharmacy-line --output /absolute/evidence/path` with isolated `TEST_DB_URL`; its reviewed inventory is `test/pharmacy-line/impact.json`.

## Verification and deployment

- `npm run test:pharmacy -- --list`
- `TEST_DB_URL=... npm run test:pharmacy -- --output /absolute/evidence/path`
- `TEST_DB_URL=... npm run validate:dev:pharmacy -- --output /absolute/evidence/path`
- From the clean DEV runtime checkout: `npm run deploy:dev -- --pharmacy-attestation /absolute/evidence/path/attestation.json --pharmacy-build /absolute/validated/.next`

The reviewed impact inventory lives in `test/pharmacy/impact.json`. The shared runner rejects incomplete execution/skips/retries, checks type/lint/build and exercises the three localized browser journeys. This is scoped evidence, not a full application/MCP claim.

Only `db-rollout/pharmacy-orders.sql` is applied: it adds `pharmacy` to the source constraint. No catalogue, pricing, food or financial data corrections are included. Existing source values and frozen orders remain valid. UAT/PRD deployment is not part of this package.

## Expectation changes

- T15: skipping the pharmacy HealthScore page no longer skips its background explanation generation.
- PHARM-07: shop filtering uses the candidate's actual organisation UUID, not the public encoded seller ID.
- PHARM-PG-05: orders paid directly to a pharmacy are excluded from platform settlement replay.
- Existing ordinary web captures, complete-advice gates and online checkout session replay remain maintained controls.

## QR acquisition sources

- Poster: `/retail/delight?source=in_store`
- Business card: `/retail/delight?source=business_card`

Use any existing pharmacy slug in place of `delight`. Both links use the same pharmacy flow and pay at the till. New untagged entries default to in-store; malformed explicit sources and historical entries without evidence are unknown. The initial redirect preserves query parameters and assigns a session for source correlation. Saved assessment/resume attribution wins over later URL or browser state.

BPM uses `trafficSource=pharmacy`, the canonical pharmacy slug in `sourceChannel`, and `in_store|business_card|unknown` in `sourceDetail`. Acquisition is stored in `answers.inStorePharmacy.acquisition` and new order metadata; it is excluded from generation identity and worker inputs. No historical backfill or pricing change is performed.

Conversions → Pharmacy QR journeys shows both sources and unknowns by pharmacy, respecting the selected period and locale. Orders are durable unpaid orders, not payment conversions. Repeated tracking events/retries count once. Customer Intelligence includes the pharmacy/source label in its source field and CSV export.

Scoped validation: `node scripts/mcp-721.mjs validate --package=pharmacy-source --output /absolute/evidence/path` with the usual isolated `TEST_DB_URL`. Deploy with the existing `--pharmacy-attestation` and `--pharmacy-build` arguments. This source-only package verifies the existing schema without running migrations.
