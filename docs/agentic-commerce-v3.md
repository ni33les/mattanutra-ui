# Agentic Commerce v3 — architecture map

This is a clean rebuild. Previous MCP branches and the connected UAT MCP server are not sources. The public contract is six tools at `POST /api/mcp`: `info`, `plan`, `execute`, `order`, `support`, `feedback`.

## Existing modules reused

| Concern | Existing module | Agentic use |
|---|---|---|
| Matching | `lib/product-recommendations.ts` (`recommendProductStackFullBeam`) | Plan-domain adapter: MCP needs → TH candidates → beam → ≤3 options |
| Catalogue | `products`, `product_facts`, `product_countries`, `supplements` | Snapshot + public `sup_` / `prd_` IDs |
| Availability | `lib/retail-cart-availability.ts` | `available_now` and `backorder` are orderable; unavailable is not |
| Retail OMS | `retail_customer_orders` workflow | Behind `RetailOrderManagementPort`; MCP never sees retailer IDs |
| Tasks | `lib/task-service.ts` | OMS submit, checkout expiry, fulfilment sync |
| i18n | `lib/i18n.ts`, `content/i18n` | Errors, questions, guidance, checkout, order, support, invitation |
| RBAC | `lib/admin-rbac.ts`, agent credentials | Staff/QA/workers; anonymous clients use capabilities |
| Logging | `lib/logger.ts` | Correlation IDs; handles redacted |
| Rate limit | `lib/rate-limit.ts` | `/api/mcp` and checkout POSTs |
| DEV payments | `stripePaymentConfig().mode === "mock"` | Pattern only. MCP orders use `MockPaymentAdapter`, not `payments` or `retail_checkout_payments` |

## New modules

`lib/agentic/**` is the adapter and new order/plan domain. Domain code does not import MCP, Stripe, retailer SDKs, or host SDKs.

## Data classification

| Data | Class | Rules |
|---|---|---|
| Capability / checkout access values | Secret | Hash at rest; never log; never return except once at issue |
| Plan medical context | Sensitive | Plan/order relationship only; never sent to retailer |
| Checkout address/contact | PII | Encrypted; checkout and OMS only |
| Payment provider payloads | Restricted | Internal workers; never MCP |
| Catalogue / coverage / prices | Public facts | Returned to the agent |

## Continuation

Polling `order` with `orderHandle` is the only host continuation. Stripe webhooks (later) and mock events (DEV) are provider ingestion, not AI-host callbacks.

## Environments

DEV: mock payment, mock Thailand OMS, internal QA harness. UAT Stripe is a later adapter on the same immutable build after QA 10/10.
