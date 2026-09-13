# Pharmacy QR journey (DEV)

Public entry: `/retail/{pharmacy}/landing`; questionnaire: `/retail/{pharmacy}/quiz`.
Locale middleware supplies EN, TH or zh-CN. `delight` aliases the existing `delight-pharmacy` organisation; no organisation is renamed.

The existing questionnaire capture binds the pharmacy server-side. Formula and HealthScore explanation jobs run independently; product matching follows the formula. Pharmacy reveal waits for the formula/product result, not the optional explanation. The same existing matcher evaluates that shop's eligible listings at captured RRP, without the online margin. The original source locale/revision remains the generation identity when a visitor switches display language.

`POST /api/retail/orders` accepts `planId`, `pharmacy`, `locale`, `expectedRevision`, `productIds` and `customerName`, with `Idempotency-Key`. Server data supplies prices and first-order packs. `GET` retrieves an owned receipt or current quote; `view=analysis` reads the explanation for that order's frozen revision. Possession of the existing opaque assessment identifier follows the existing web access model; a human order reference alone grants no access.

Orders use source `pharmacy`, status `placed`, and explicit unpaid/pay-at-till metadata. No online payment, financial booking, stock allocation, shipment or settlement is initiated. The shared order-creation revision/catalogue fences protect only final validation and necessary writes. Reused task infrastructure commits the notification request with the order and dispatches after commit. Delivery failure cannot invalidate a saved order. Counter payment/collection/POS integration is outside this version.

The order UI reuses existing basket/order-summary styles. It removes address, billing, shipping and Stripe controls; it adds product inclusion, name/nickname and pay-at-till copy. Attached examples provide structure and text, not customer facts, prices, clearance claims or fixed counts. Deep-dive results distinguish the original formulation from the ordered product subset. LINE sharing opens only after a customer click and does not claim automatic delivery.

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
