import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  midpointUsdRateFromExchangeRateApiOpenPayload,
  midpointUsdRateFromExchangerateHostPayload,
  normalizeCurrencyCode
} from "../lib/finance-fx.ts";

describe("retail stock and FX infrastructure", () => {
  it("stores organisation currency and retailer stock with soft-delete states", () => {
    const schema = readFileSync("db-schema.sql", "utf8");
    const migration = readFileSync("scripts/apply-retail-stock-schema.ts", "utf8");
    const regulatoryMigration = readFileSync(
      "scripts/apply-product-regulatory-approvals-schema.ts",
      "utf8"
    );

    assert.match(schema, /currency text DEFAULT 'THB'::text NOT NULL/);
    assert.match(schema, /country_code text DEFAULT 'TH'::text NOT NULL/);
    assert.match(schema, /organisations_currency_check CHECK \(\(currency ~ '\^\[A-Z\]\{3\}\$'::text\)\)/);
    assert.match(schema, /organisations_country_code_check CHECK \(\(country_code ~ '\^\[A-Z\]\{2\}\$'::text\)\)/);
    assert.match(schema, /CREATE TABLE public\.retail_sellable_products/);
    assert.match(schema, /retail_sellable_products_org_product_key UNIQUE \(organisation_id, product_id\)/);
    assert.match(schema, /rrp_price_amount numeric\(20,6\)/);
    assert.match(schema, /CREATE TABLE public\.product_countries \((?:(?!\n\);)[\s\S])*rrp_price_amount numeric\(20,6\)/);
    assert.match(schema, /CREATE TABLE public\.product_countries \((?:(?!\n\);)[\s\S])*currency text DEFAULT 'THB'::text NOT NULL/);
    assert.doesNotMatch(schema, /pricing_status/);
    assert.doesNotMatch(schema, /product_countries_pricing_status_check/);
    assert.doesNotMatch(schema, /product_countries_pricing_status_idx/);
    assert.match(schema, /product_countries_rrp_price_check/);
    assert.match(schema, /CREATE TABLE public\.product_regulatory_approvals/);
    assert.match(schema, /product_regulatory_approvals_scope_type_check/);
    assert.match(schema, /product_regulatory_approvals_status_check/);
    assert.match(schema, /product_regulatory_approvals_unique_key UNIQUE \(product_id, scope_type, scope_code, agency_code, approval_type, approval_number\)/);
    assert.match(schema, /product_regulatory_approvals_product_idx/);
    assert.match(regulatoryMigration, /create table if not exists public\.product_regulatory_approvals/);
    assert.match(regulatoryMigration, /legacy_products_fda_approval_number/);
    assert.match(regulatoryMigration, /grant select, insert, update, delete on table[\s\S]*public\.product_regulatory_approvals[\s\S]*to mn/);
    assert.match(schema, /backorder_policy text DEFAULT 'allow'::text NOT NULL/);
    assert.doesNotMatch(schema, /retail_sellable_products_active_price_check/);
    assert.match(schema, /CREATE TABLE public\.retail_product_stock/);
    assert.match(schema, /retail_product_stock_org_product_key UNIQUE \(organisation_id, product_id\)/);
    assert.match(schema, /retail_product_stock_status_check CHECK \(\(status = ANY \(ARRAY\['active'::text, 'disabled'::text, 'deleted'::text\]\)\)\)/);
    assert.doesNotMatch(schema, /retail_product_stock_active_price_check/);
    assert.doesNotMatch(
      schema,
      /CREATE TABLE public\.retail_product_stock \((?:(?!\n\);)[\s\S])*expires_at date/
    );
    assert.doesNotMatch(
      schema,
      /CREATE TABLE public\.retail_product_stock_snapshots \((?:(?!\n\);)[\s\S])*expires_at date/
    );
    assert.match(
      schema,
      /CREATE TABLE public\.retail_stock_lots \((?:(?!\n\);)[\s\S])*expires_at date/
    );
    assert.match(schema, /retail_product_stock_organisation_id_fkey[\s\S]*ON DELETE RESTRICT/);
    assert.match(schema, /CREATE TABLE public\.retail_product_stock_snapshots/);
    assert.match(schema, /retail_product_stock_snapshots_event_type_check CHECK/);
    assert.match(schema, /retail_product_stock_snapshots_stock_id_fkey[\s\S]*ON DELETE RESTRICT/);
    assert.match(schema, /retail_product_stock_snapshots_org_product_idx/);
    assert.match(schema, /CREATE TABLE public\.retail_stock_lots/);
    assert.match(schema, /CREATE TABLE public\.retail_stock_movements/);
    assert.match(schema, /CREATE TABLE public\.retail_stock_reorder_advice/);
    assert.doesNotMatch(schema, /CREATE TABLE public\.retail_purchase_orders/);
    assert.doesNotMatch(schema, /CREATE TABLE public\.retail_purchase_order_lines/);
    assert.doesNotMatch(schema, /CREATE TABLE public\.retail_purchase_order_line_shortfalls/);
    assert.match(schema, /CREATE TABLE public\.retail_customer_orders/);
    assert.match(schema, /CREATE TABLE public\.retail_customer_order_lines/);
    assert.match(schema, /CREATE TABLE public\.retail_order_allocations/);
    assert.match(schema, /'fulfillment'::text/);
    assert.match(migration, /'fulfillment'/);
    assert.match(schema, /priority_score integer DEFAULT 200 NOT NULL/);
    assert.match(schema, /source_entity_type text/);
    assert.match(schema, /retail_stock_movements_type_check CHECK/);
    assert.match(schema, /retail_stock_movements_void_check CHECK/);
    assert.match(schema, /retail_stock_reorder_advice_org_product_key UNIQUE \(organisation_id, product_id\)/);
    const approvedListing = readFileSync(
      "scripts/apply-retail-sellable-approved-trigger.ts",
      "utf8"
    );
    assert.match(
      approvedListing,
      /create trigger retail_sellable_requires_approved_product/
    );
    assert.match(
      approvedListing,
      /Only approved platform products can be selected for retail/
    );
    assert.match(migration, /create table if not exists public\.retail_sellable_products/);
    assert.match(migration, /drop constraint if exists retail_sellable_products_active_price_check/);
    assert.match(migration, /alter table public\.product_countries[\s\S]*add column if not exists rrp_price_amount/);
    assert.match(migration, /drop column if exists pricing_status/);
    assert.match(migration, /update public\.product_countries[\s\S]*set[\s\S]*rrp_price_amount = products\.price_amount/);
    assert.match(migration, /insert into public\.retail_sellable_products/);
    assert.match(migration, /drop constraint if exists retail_product_stock_active_price_check/);
    assert.match(migration, /create table if not exists public\.retail_product_stock/);
    assert.match(migration, /alter table public\.retail_product_stock[\s\S]*drop column if exists expires_at/);
    assert.match(migration, /alter table public\.retail_product_stock_snapshots[\s\S]*drop column if exists expires_at/);
    assert.match(migration, /create table if not exists public\.retail_product_stock_snapshots/);
    assert.match(migration, /create table if not exists public\.retail_stock_lots/);
    assert.match(migration, /create table if not exists public\.retail_stock_movements/);
    assert.match(migration, /create table if not exists public\.retail_stock_reorder_advice/);
    assert.match(migration, /drop table if exists public\.retail_purchase_order_line_shortfalls cascade/);
    assert.match(migration, /drop table if exists public\.retail_purchase_order_lines cascade/);
    assert.match(migration, /drop table if exists public\.retail_purchase_orders cascade/);
    assert.match(migration, /create table if not exists public\.retail_customer_orders/);
    assert.match(migration, /add column if not exists priority_score integer/);
    assert.match(migration, /Backfilled opening stock/);
    assert.match(migration, /set currency = 'USD'[\s\S]*lower\(slug\) = 'mattanutra'/);
    assert.match(migration, /add column if not exists country_code text not null default 'TH'/);
  });

  it("keeps FX observations reusable while copying immutable USD rates onto transactions", () => {
    const schema = readFileSync("db-schema.sql", "utf8");
    const ledger = readFileSync("lib/finance-ledger.ts", "utf8");
    const fx = readFileSync("lib/finance-fx.ts", "utf8");

    assert.match(schema, /CREATE TABLE public\.finance_fx_rates/);
    assert.match(schema, /base_currency text NOT NULL/);
    assert.match(schema, /quote_currency text NOT NULL/);
    assert.match(schema, /mid numeric\(20,10\) NOT NULL/);
    assert.match(schema, /finance_transactions_fx_rate_id_fkey[\s\S]*REFERENCES public\.finance_fx_rates\(id\) ON DELETE RESTRICT/);
    assert.match(schema, /usd_rate numeric\(20,10\) NOT NULL/);
    assert.match(ledger, /fxRateId\?: string \| null/);
    assert.match(ledger, /fx_rate_id,/);
    assert.match(fx, /DEFAULT_FRESHNESS_MS = 24 \* 60 \* 60 \* 1000/);
    assert.match(fx, /DEFAULT_PROVIDER = EXCHANGE_RATE_API_OPEN_PROVIDER/);
    assert.match(fx, /EXCHANGE_RATE_API_OPEN_BASE_URL = "https:\/\/open\.er-api\.com"/);
    assert.match(fx, /new URL\("\/v6\/latest\/USD", config\.baseUrl\)/);
    assert.match(fx, /EXCHANGERATE_HOST_API_KEY/);
    assert.match(fx, /if \(provider === EXCHANGERATE_HOST_PROVIDER\)/);
    assert.match(fx, /fxFallbackUsed|fallbackUsed/);
  });

  it("normalizes ExchangeRate-API Open Access USD-base rates into currency-to-USD midpoints", () => {
    assert.equal(normalizeCurrencyCode("thb"), "THB");
    assert.equal(
      midpointUsdRateFromExchangeRateApiOpenPayload("THB", {
        base_code: "USD",
        result: "success",
        rates: {
          THB: 36.5
        },
        time_last_update_unix: 1710000000
      }),
      1 / 36.5
    );
    assert.equal(
      midpointUsdRateFromExchangeRateApiOpenPayload("EUR", {
        base_code: "USD",
        result: "success",
        rates: {
          EUR: 0.92
        }
      }),
      1 / 0.92
    );
    assert.equal(
      midpointUsdRateFromExchangeRateApiOpenPayload("THB", {
        base_code: "EUR",
        result: "success",
        rates: {
          THB: 39
        }
      }),
      null
    );
    assert.equal(
      midpointUsdRateFromExchangeRateApiOpenPayload("THB", {
        result: "error",
        rates: {
          THB: 36.5
        }
      }),
      null
    );
    assert.equal(
      midpointUsdRateFromExchangeRateApiOpenPayload("THB", {
        result: "success",
        rates: {}
      }),
      null
    );
    assert.equal(
      midpointUsdRateFromExchangeRateApiOpenPayload("THB", {
        result: "success",
        rates: {
          THB: 0
        }
      }),
      null
    );
    assert.equal(
      midpointUsdRateFromExchangeRateApiOpenPayload("THB", {
        result: "success",
        rates: {
          THB: -1
        }
      }),
      null
    );
    assert.equal(midpointUsdRateFromExchangeRateApiOpenPayload("THB", null), null);
  });

  it("normalizes exchangerate.host live quotes into currency-to-USD midpoints", () => {
    assert.equal(normalizeCurrencyCode("thb"), "THB");
    assert.equal(
      midpointUsdRateFromExchangerateHostPayload("THB", {
        quotes: {
          USDTHB: 36.5
        },
        source: "USD",
        success: true,
        timestamp: 1710000000
      }),
      1 / 36.5
    );
    assert.equal(
      midpointUsdRateFromExchangerateHostPayload("EUR", {
        rates: {
          USD: 1.08
        }
      }),
      1.08
    );
    assert.equal(midpointUsdRateFromExchangerateHostPayload("THB", {}), null);
    assert.throws(() => normalizeCurrencyCode("thai"));
  });

  it("exposes first-class stock UI, API, and RBAC hooks", () => {
    const rbac = readFileSync("lib/admin-rbac.ts", "utf8");
    const page = readFileSync("app/[locale]/admin/dashboard/page.tsx", "utf8");
    const dashboard = readFileSync("components/admin-dashboard.tsx", "utf8");
	    const content = readFileSync("components/admin/dashboard-content.tsx", "utf8");
	    const view = readFileSync("components/admin/retail-stock-view.tsx", "utf8");
	    const customerOrderDisplay = readFileSync(
	      "components/admin/retail-stock/customer-order-display-model.ts",
	      "utf8"
	    );
	    const orderDocuments = readFileSync(
	      "components/admin/retail-stock/order-documents.ts",
	      "utf8"
	    );
	    const shoppingListViewModel = readFileSync(
	      "components/admin/retail-stock/shopping-list-view-model.ts",
	      "utf8"
	    );
	    const stockControls = readFileSync(
	      "components/admin/retail-stock/stock-controls.tsx",
	      "utf8"
	    );
	    const shoppingListModal = readFileSync(
	      "components/admin/retail-shopping-list-modal.tsx",
	      "utf8"
	    );
	    const service = readFileSync("lib/admin-retail-stock.ts", "utf8");
	    const customerOrders = readFileSync(
	      "lib/admin-retail-customer-orders.ts",
	      "utf8"
	    );
	    const operationTasks = readFileSync(
	      "lib/admin-retail-operation-tasks.ts",
	      "utf8"
	    );
	    const stockSideEffects = readFileSync(
	      "lib/admin-retail-stock-side-effects.ts",
	      "utf8"
	    );
	    const stockReorderAdvice = readFileSync(
	      "lib/admin-retail-stock-reorder-advice.ts",
	      "utf8"
	    );
	    const stockAllocationIntegrity = readFileSync(
	      "lib/admin-retail-stock-allocation-integrity.ts",
	      "utf8"
	    );
	    const stockMutations = readFileSync(
	      "lib/admin-retail-stock-mutations.ts",
	      "utf8"
	    );
	    const stockData = readFileSync(
	      "lib/admin-retail-stock-data.ts",
	      "utf8"
	    );
	    const orderReadModel = readFileSync(
	      "lib/admin-retail-order-read-model.ts",
	      "utf8"
	    );
	    const stockReadModel = readFileSync(
	      "lib/admin-retail-stock-read-model.ts",
	      "utf8"
	    );
	    const stockPipeline = readFileSync(
	      "lib/admin-retail-stock-pipeline.ts",
	      "utf8"
	    );
	    const stockCodecs = readFileSync(
	      "lib/admin-retail-stock-codecs.ts",
	      "utf8"
	    );
	    const stockTypes = readFileSync(
	      "lib/admin-retail-stock-types.ts",
	      "utf8"
	    );
	    const workflowRules = readFileSync(
	      "lib/retail-order-workflow-rules.ts",
	      "utf8"
	    );
    const route = readFileSync("app/api/admin/retail-stock/route.ts", "utf8");
    const basketRoute = readFileSync("app/api/retail/basket/availability/route.ts", "utf8");
    const cartService = readFileSync("lib/retail-cart-availability.ts", "utf8");
    const retailProductCheckout = readFileSync(
      "lib/retail-product-checkout.ts",
      "utf8"
    );
    const workflowService = readFileSync(
      "lib/retail-order-workflow.ts",
      "utf8"
    );
    const flowData = readFileSync("lib/admin-flow-data.ts", "utf8");
    const agents = readFileSync("lib/system-agents.ts", "utf8");
    const worker = readFileSync("workers/runner.ts", "utf8");
    const workerProfiles = readFileSync("lib/worker-agent-credentials.ts", "utf8");
    const workItems = readFileSync("lib/task-work-items.ts", "utf8");
    const execution = readFileSync("lib/task-execution.ts", "utf8");
    const settingsView = readFileSync("components/admin/settings-view.tsx", "utf8");
    const currencies = readFileSync("lib/currencies.ts", "utf8");
    const dashboardShared = readFileSync(
      "components/admin/dashboard-shared.tsx",
      "utf8"
    );
    const packageJson = readFileSync("package.json", "utf8");
    const devLive = readFileSync("scripts/dev-live.mjs", "utf8");

    assert.match(rbac, /"stock\.read"/);
    assert.match(rbac, /"stock\.write"/);
    assert.match(
      rbac,
      /retail_admin:\s*\[[\s\S]*"access\.agents\.read"[\s\S]*"communications\.read"[\s\S]*"communications\.write"[\s\S]*"finance\.read"[\s\S]*"settings\.read"[\s\S]*"stock\.read"[\s\S]*"stock\.write"[\s\S]*\]/
    );
	    assert.match(rbac, /retail_assistant: \["settings\.read", "shipments\.read", "stock\.read"\]/);
    assert.match(page, /getAdminRetailStockData\(adminContext, locale\)/);
    assert.match(dashboard, /AdminRetailStockView/);
	    assert.match(
	      dashboardShared,
	      /items=\{labels\.retailSellingNavigation\}[\s\S]*items=\{labels\.retailInventoryNavigation\}[\s\S]*items=\{labels\.retailBuyingNavigation\}/
	    );
	    assert.match(dashboardShared, /if \(visibleItems\.length === 0\) \{\s*return null;\s*\}/);
	    assert.match(view, /labels\.stock\.addProduct/);
	    assert.match(view, /ProductThumbnail/);
		    assert.doesNotMatch(view, /const panelSearchLabel = labels\.stock\.search/);
			    assert.doesNotMatch(view, /aria-label=\{panelSearchLabel\}/);
	    assert.match(view, /aria-label=\{labels\.stock\.search\}/);
	    assert.doesNotMatch(view, /\n\s*\{panelSearchLabel\}\s*\n\s*<input/);
	    assert.doesNotMatch(view, /\n\s*\{labels\.stock\.search\}\s*\n\s*<input/);
	    assert.doesNotMatch(view, /panel === "purchase-orders" \|\| panel === "receiving"/);
	    assert.match(view, /placeholder=\{labels\.stock\.search\}/);
	    assert.match(view, /const showKexCarrierSetup = false/);
	    assert.match(view, /showKexCarrierSetup \? \(/);
	    assert.match(view, /row\.ean13/);
	    assert.match(view, /row\.manufacturerSku/);
	    assert.match(view, /line\.ean13/);
	    assert.match(view, /line\.manufacturerSku/);
	    assert.match(view, /customerOrderLinesByOrderId/);
	    assert.match(customerOrderDisplay, /function customerOrderRetailValue/);
	    assert.match(customerOrderDisplay, /function customerOrderProcessingFeeAmount/);
	    assert.match(customerOrderDisplay, /function customerOrderSubtotalAmount/);
	    assert.match(orderDocuments, /processingFee|Processing fee/);
	    assert.match(orderDocuments, /totals-stack/);
	    assert.match(view, /customerOrderProcessingFeeAmount/);
	    assert.match(view, /customerOrderSubtotalAmount/);
	    assert.match(view, /order\.orderNumber/);
	    assert.match(view, /order\.customerName/);
	    assert.match(view, /labels\.stock\.retailValue/);
	    assert.match(view, /customerOrderRetailValueHeader/);
	    assert.match(view, /customerOrderRetailValue\(order\)/);
	    assert.match(view, /formatWholeAmount\(\s*locale,\s*customerOrderRetailValue\(order\)\s*\)/);
	    assert.match(view, /customerOrderRetailValue\(customerOrderDetail\)/);
	    assert.match(view, /printRetailOrderDocument/);
	    assert.match(view, /deliveryAddressForOrder\(customerOrderDetail\)/);
	    assert.doesNotMatch(view, /billingAddressForOrder/);
	    assert.doesNotMatch(view, /labels\.stock\.billingAddress/);
	    assert.doesNotMatch(view, /customerOrderBilling/);
	    assert.doesNotMatch(orderDocuments, /billingAddressForOrder|billingSection|showBilling/);
	    assert.match(view, /labels\.stock\.downloadPdf/);
	    assert.match(view, /labels\.stock\.packingSheet/);
	    assert.match(orderDocuments, /labels\.stock\.shippingLabel/);
	    assert.doesNotMatch(view, /labels\.stock\.kexHandlingSheet/);
	    assert.doesNotMatch(view, /downloadKexMygeiaLabelCsv/);
	    assert.doesNotMatch(view, /labels\.stock\.kexMygeiaExport/);
	    assert.match(view, /labels\.stock\.invoice/);
	    assert.match(orderDocuments, /<th>\$\{escapeHtml\(labels\.stock\.product\)\}<\/th>[\s\S]*<th>\$\{escapeHtml\(labels\.stock\.quantity\)\}<\/th>[\s\S]*\$\{priceHeadings\}/);
	    assert.doesNotMatch(orderDocuments, /<th>\$\{escapeHtml\(labels\.stock\.allocate\)\}<\/th>/);
	    assert.doesNotMatch(orderDocuments, /<th>\$\{escapeHtml\(labels\.stock\.ship\)\}<\/th>/);
	    assert.doesNotMatch(orderDocuments, /<td>\$\{escapeHtml\(line\.quantityAllocated\)\}<\/td>/);
	    assert.doesNotMatch(orderDocuments, /<td>\$\{escapeHtml\(line\.quantityShipped\)\}<\/td>/);
	    assert.match(view, /orderLineIdentifierParts/);
	    assert.match(orderDocuments, /SKU: \$\{line\.productId\}/);
	    assert.match(orderDocuments, /Manufacturer SKU: \$\{line\.manufacturerSku\}/);
	    assert.match(orderDocuments, /EAN-13: \$\{line\.ean13\}/);
	    assert.match(orderDocuments, /class="identifiers"/);
	    assert.match(view, /labels\.stock\.deliveryDetails/);
	    assert.match(orderDocuments, /function addressNoteLines/);
	    assert.match(view, /customerOrderDeliveryNoteLines\.map/);
	    assert.match(view, /kind: "order-pack"/);
	    assert.match(orderDocuments, /standardSheetHtml\(labels\.stock\.printOrder, true\)/);
	    assert.match(orderDocuments, /standardSheetHtml\(labels\.stock\.packingSheet, false\)/);
	    assert.match(orderDocuments, /shippingLabelSheetHtml\(\)/);
	    assert.match(orderDocuments, /standardSheetHtml\(labels\.stock\.invoice, true\)/);
	    assert.match(view, /grid gap-x-3 gap-y-4 text-sm text-gray-600 sm:grid-cols-4/);
	    assert.match(view, /<FileDown aria-hidden="true"/);
	    assert.match(view, /<PackageCheck aria-hidden="true"/);
	    assert.match(view, /<Truck aria-hidden="true"/);
	    assert.match(view, /<ReceiptText aria-hidden="true"/);
    assert.doesNotMatch(view, /title="Mark Shipped"/);
	    assert.match(view, /labels\.stock\.bookPickup/);
	    assert.match(view, /book_order_pickup/);
	    assert.match(view, /openPickupDialog\(customerOrderDetail\)/);
	    assert.match(view, /markCustomerOrderShipped\(customerOrderDetail\)/);
	    assert.match(view, /runCustomerOrderAction\(customerOrderDetail, "mark_packed"\)/);
	    assert.match(view, /Generate official label/);
	    assert.match(view, /Print fallback label/);
	    assert.doesNotMatch(view, /Products are packed and ready to hand to the courier\/customer\./);
	    assert.doesNotMatch(view, /confirmedPacked/);
	    assert.match(view, /carrierName/);
	    assert.match(view, /trackingNumber/);
	    assert.match(view, /trackingUrl/);
	    assert.match(view, /customerOrderStatusDisplay\(order\)/);
	    assert.doesNotMatch(
	      view,
	      /runCustomerOrderAction\(customerOrderDetail, "mark_picking"\)/
	    );
	    assert.match(view, /customerOrderDetail\.planInsertAvailable/);
	    assert.match(view, /openRetailPlanInsert\(customerOrderDetail, locale\)/);
	    assert.match(view, /<FileText aria-hidden="true"/);
	    assert.match(view, /labels\.stock\.planInsert/);
	    assert.doesNotMatch(view, /package-insert|packageInsert/);
	    assert.match(orderReadModel, /function deliveryDetailsFromMetadata/);
	    assert.match(orderReadModel, /shippingAddress = orderAddressFromMetadata\(metadata\.shippingAddress\)/);
	    assert.match(orderReadModel, /billingAddress = billingSameAsShipping[\s\S]*orderAddressFromMetadata\(metadata\.billingAddress\)/);
	    assert.match(orderReadModel, /deliveryDetails: deliveryDetailsFromMetadata\(row\.metadata\)/);
	    assert.match(stockCodecs, /export function stockStatus/);
	    assert.match(stockCodecs, /export function movementDelta/);
	    assert.match(stockCodecs, /export function integerOrDefault/);
	    assert.match(retailProductCheckout, /billingAddress: paymentMetadata\.billingAddress \?\? null/);
	    assert.match(retailProductCheckout, /billingSameAsShipping: paymentMetadata\.billingSameAsShipping !== false/);
	    assert.doesNotMatch(view, /labels\.stock\.searchProducts/);
	    assert.doesNotMatch(view, /labels\.stock\.searchOrders/);
	    assert.doesNotMatch(view, /labels\.stock\.searchStock/);
    assert.doesNotMatch(view, /type PurchaseOrderLineDraft/);
    assert.doesNotMatch(view, /purchaseOrderProductOptions/);
    assert.doesNotMatch(view, /addPurchaseOrderLine/);
    assert.doesNotMatch(view, /removePurchaseOrderLine/);
    assert.doesNotMatch(view, /purchaseOrderDraft\.lines\.map/);
			    assert.doesNotMatch(view, /AdminIconButton/);
			    assert.doesNotMatch(view, /<Download/);
				    assert.match(
				      shoppingListModal,
				      /\{labels\.stock\.importCsv\}[\s\S]*\{labels\.stock\.exportCsv\}[\s\S]*\{labels\.stock\.exportPdf\}/
				    );
				    assert.match(view, /createShoppingListFromSelection/);
				    assert.doesNotMatch(view, /shoppingListIdFromResult\(created\.result\)/);
				    assert.doesNotMatch(view, /setSelectedShoppingListId\(createdShoppingListId\)/);
				    assert.match(view, /if \(!activeShoppingList\) \{[\s\S]*return;[\s\S]*setShoppingListDraftLines\(nextLines\)/);
				    assert.doesNotMatch(view, /pendingShoppingList/);
				    assert.doesNotMatch(view, /setPendingShoppingList/);
				    // Create succeeds silently; modal opens only when user selects an existing list.
				    assert.match(
				      view,
				      /if \(created\) \{[\s\S]*setSelectedShoppingListId\(""\)[\s\S]*refreshRetailStockData/
				    );
				    assert.doesNotMatch(view, /applyShoppingListDraft/);
				    assert.doesNotMatch(view, /apply_shopping_list/);
				    assert.match(shoppingListModal, /downloadShoppingListCsv/);
				    assert.doesNotMatch(view, /downloadShoppingListCsv/);
				    assert.doesNotMatch(view, /parseCsvLine|csvCell/);
				    assert.match(view, /action: "reopen_shopping_list"/);
				    assert.match(view, /function reopenShoppingList\(\)/);
				    assert.match(view, /onReopen=\{\(\) => void reopenShoppingList\(\)\}/);
				    assert.match(view, /if \(saved\) \{[\s\S]*setSelectedShoppingListId\(""\)/);
					    assert.match(route, /async reopen_shopping_list\(context, body\)/);
					    assert.match(route, /result: \{ shoppingListId: resourceId \}/);
					    assert.match(route, /executeRetailCommand/);
				    assert.match(route, /reopenRetailShoppingList/);
				    assert.match(service, /export async function reopenRetailShoppingList/);
				    assert.match(service, /previousStatus === "active"[\s\S]*return list\.id/);
				    assert.match(service, /admin\.retail_shopping_list_reopened/);
				    assert.match(service, /Closed shopping lists cannot be edited/);
				    assert.match(shoppingListModal, /onReopen/);
				    assert.match(shoppingListModal, /list\.status === "closed"/);
				    assert.match(shoppingListModal, /onClick=\{onReopen\}[\s\S]*Reopen/);
				    assert.match(shoppingListModal, /onClick=\{\(\) => onSave\(\)\}/);
				    assert.doesNotMatch(shoppingListModal, /Close list/);
				    assert.doesNotMatch(shoppingListModal, /onSave\("closed"\)/);
				    assert.doesNotMatch(shoppingListModal, /onSave\("active"\)/);
				    assert.match(packageJson, /"dev:live": "node scripts\/dev-live\.mjs"/);
				    assert.match(devLive, /await npmRun\("build:dev-fast"\)/);
				    assert.match(devLive, /start:platform/);
				    assert.match(devLive, /curl/);
				    assert.match(devLive, /verifyStaticAssets/);
				    assert.match(devLive, /\\\/_next\\\/static\\\//);
				    assert.match(devLive, /Static asset smoke passed/);
				    assert.match(devLive, /workers\/runner\.ts/);
	    assert.match(view, /const stockPriceCurrency =/);
	    assert.match(view, /const wholesaleHeader = stockPriceCurrency/);
	    assert.match(view, /const retailHeader = stockPriceCurrency/);
	    assert.match(view, /const wholesalePrice = formatAmount\(\s*locale,\s*row\.wholesalePriceAmount\s*\);/);
	    assert.match(view, /const retailPrice = formatAmount\(\s*locale,\s*row\.retailPriceAmount\s*\);/);
	    assert.match(view, /<th className="py-2 pr-4">\{wholesaleHeader\}<\/th>/);
	    assert.match(view, /<th className="py-2 pr-4">\{retailHeader\}<\/th>/);
	    assert.match(view, /w-52 max-w-52/);
	    assert.doesNotMatch(view, /\{labels\.stock\.wholesalePrice\}: \{wholesalePrice\}/);
	    assert.doesNotMatch(view, /formatPrice\(\s*locale,\s*row\.currency,\s*row\.retailPriceAmount\s*\)/);
	    assert.match(view, /labels\.stock\.backorderPolicy/);
	    assert.match(view, /backorderPolicy: draft\.backorderPolicy/);
	    assert.match(stockControls, /function backorderPolicyClass/);
	    assert.match(view, /bg-emerald-50 text-emerald-700 ring-emerald-100/);
	    assert.match(view, /bg-red-50 text-red-700 ring-red-100/);
	    assert.match(content, /backorderAllowed: "Allowed"/);
	    assert.match(content, /backorderDisabled: "Disabled"/);
	    assert.doesNotMatch(content, /Backorder allowed|Backorder disabled/);
		    assert.doesNotMatch(view, /downloadStockCsv/);
		    assert.doesNotMatch(view, /const showStockCsvExport = panel === "list"/);
		    assert.doesNotMatch(view, /\{showStockCsvExport \? \(/);
	    assert.match(view, /const showOrganisationContext = data\.canFilterOrganisation/);
		    assert.doesNotMatch(view, /downloadStockCsv\(rows, labels, showOrganisationContext\)/);
		    assert.doesNotMatch(view, /includeOrganisation[\s\S]*labels\.stock\.organisation/);
	    assert.match(view, /showOrganisationContext \? \([\s\S]*labels\.stock\.organisation/);
	    assert.match(view, /colSpan=\{showOrganisationContext \? 11 : 10\}/);
			    assert.match(view, /colSpan=\{showOrganisationContext \? 7 : 6\}/);
		    assert.doesNotMatch(content, /Wholesale\s+price/);
		    assert.match(content, /wholesalePrice: "Wholesale"/);
	    assert.match(content, /retailPrice: "Retail"/);
	    assert.match(view, /stockMetrics/);
	    assert.doesNotMatch(view, /stockPipelineSummary/);
	    assert.doesNotMatch(view, /PipelineStrip/);
		    assert.match(view, /panel === "list" \? \([\s\S]*<BusinessStatsGrid[\s\S]*metrics=\{stockMetrics\}/);
		    assert.match(view, /function openAddStockEditor/);
		    assert.match(view, /onClick=\{openAddStockEditor\}[\s\S]*labels\.stock\.addProduct/);
		    assert.match(view, /hygeiaExportHref/);
		    assert.match(view, /scope=retail/);
		    assert.match(view, /importRetailHygeiaFile/);
		    assert.match(view, /importType: "stock"/);
		    assert.match(view, /labels\.stock\.hygeiaExport/);
		    assert.match(view, /labels\.stock\.hygeiaImport/);
		    assert.match(view, /value=\{stockSearch\}/);
			    assert.doesNotMatch(view, /panel === "tasks" \? \([\s\S]*<BusinessStatsGrid[\s\S]*metrics=\{retailTaskMetrics\}/);
		    assert.doesNotMatch(view, /panel === "purchase-orders" \? \([\s\S]*<BusinessStatsGrid[\s\S]*metrics=\{purchaseOrderMetrics\}/);
	    assert.match(view, /selectedStockFilter/);
	    assert.match(customerOrderDisplay, /type CustomerOrderMetricKey =/);
	    assert.match(customerOrderDisplay, /type CustomerOrderFilter = "all" \| CustomerOrderMetricKey/);
	    assert.match(view, /selectedCustomerOrderFilter/);
	    assert.match(view, /customerOrderStatusFilters/);
	    assert.match(view, /customerOrderMetrics/);
	    assert.match(customerOrderDisplay, /const customerOrderAllExcludedStatuses = new Set<RetailCustomerOrderStatus>/);
	    assert.match(customerOrderDisplay, /"shipped",\s*"delivered",\s*"cancelled",\s*"returned"/);
	    assert.match(customerOrderDisplay, /function customerOrderIncludedInAllMetric/);
	    assert.match(customerOrderDisplay, /!customerOrderAllExcludedStatuses\.has\(order\.status\)/);
	    assert.match(customerOrderDisplay, /function customerOrderHasPickupBooked/);
	    assert.match(customerOrderDisplay, /\["booked", "queued", "requested"\]\.includes\(providerStatus\)/);
	    assert.match(customerOrderDisplay, /function customerOrderStatusMetricKey/);
	    assert.match(customerOrderDisplay, /return "pickup_booked";/);
	    assert.match(customerOrderDisplay, /if \(status === "picking"\) \{\s*return "packed";\s*\}/);
	    assert.match(customerOrderDisplay, /if \(status === "packed"\) \{\s*return "Ready to ship";\s*\}/);
	    assert.match(customerOrderDisplay, /if \(status === "pickup_booked"\) \{\s*return "Pickup booked";\s*\}/);
	    assert.match(view, /metrics=\{customerOrderMetrics\}/);
	    assert.match(view, /current === metricId \? "all" : \(metricId as CustomerOrderFilter\)/);
	    assert.match(stockControls, /type RetailStockAvailabilityStatus/);
	    assert.match(stockControls, /function stockAvailabilityStatus/);
	    assert.match(stockControls, /daysCover <= leadTimeDays \+ 1/);
	    assert.match(stockControls, /daysCover === null && row\.stockQuantity < 3/);
		    assert.match(stockControls, /row\.status !== "active"/);
		    assert.match(view, /id: "approved"/);
		    assert.match(view, /id: "selected_for_sale"/);
		    assert.match(view, /approvedProductCount/);
		    assert.doesNotMatch(view, /id: "in_stock"/);
		    assert.doesNotMatch(view, /id: "low_stock"/);
	    assert.doesNotMatch(view, /id: "active"[\s\S]*label: labels\.access\.active/);
	    assert.doesNotMatch(view, /id: "disabled"[\s\S]*label: labels\.stock\.disabled/);
	    assert.match(view, /current === metricId \? "all" : \(metricId as RetailStockFilter\)/);
		    assert.match(content, /inStock: "Stock OK"/);
		    assert.match(content, /lowStock: "Low stock"/);
		    assert.match(content, /all: "All"/);
			    assert.doesNotMatch(view, /retailTaskMetrics/);
			    assert.doesNotMatch(view, /taskSummary\.total/);
		    assert.doesNotMatch(view, /all: organisationTaskRows\.filter\(\(task\) => task\.status !== "completed"\)\.length/);
		    assert.match(content, /agentTasks: "Agent tasks"/);
		    assert.doesNotMatch(view, /id: "unclaimed"/);
		    assert.doesNotMatch(view, /id: "claimed"/);
		    assert.doesNotMatch(view, /id: "processing"/);
		    assert.doesNotMatch(view, /id: "completed"/);
		    assert.doesNotMatch(view, /label: labels\.stock\.unclaimed/);
		    assert.doesNotMatch(view, /label: labels\.stock\.claimedBy/);
		    assert.doesNotMatch(view, /label: labels\.stock\.completeTask/);
		    assert.doesNotMatch(view, /id: "agent"/);
		    assert.doesNotMatch(view, /selectedTaskFilter/);
		    assert.doesNotMatch(view, /selectedTaskFilter === "unclaimed"/);
		    assert.doesNotMatch(view, /selectedTaskFilter === "claimed"/);
		    assert.doesNotMatch(view, /selectedTaskFilter === "processing"/);
		    assert.doesNotMatch(view, /selectedTaskFilter === "completed"/);
		    assert.doesNotMatch(view, /return task\.status !== "completed"/);
		    assert.doesNotMatch(view, /task\.isAgentTask/);
		    assert.doesNotMatch(view, /task\.agentName \?\? labels\.visibility\.agent/);
		    assert.doesNotMatch(view, /Number\(left\.isAgentTask\) - Number\(right\.isAgentTask\)/);
	    assert.match(view, /supportedOrganisationCurrencies/);
	    assert.match(currencies, /supportedOrganisationCurrencies/);
	    assert.match(settingsView, /supportedOrganisationCurrencies/);
		    assert.match(settingsView, /const canEditCurrency/);
		    assert.match(settingsView, /const canEditCustomerPriceMargin/);
		    assert.match(settingsView, /canEditCustomerPriceMargin \? \(/);
		    assert.match(settingsView, /session\.actorMembership\.role === "platform_owner"/);
		    assert.match(settingsView, /session\.actorMembership\.role === "platform_admin"/);
		    assert.match(settingsView, /disabled=\{!canEditCurrency \|\| busy\}/);
		    assert.match(settingsView, /\.\.\.\(canEditCustomerPriceMargin \? \{ customerPriceMarginPercent \} : \{\}\)/);
		    const customerPricing = readFileSync("lib/customer-pricing.ts", "utf8");
		    assert.match(customerPricing, /lower\(slug\) = 'mattanutra'/);
		    assert.match(customerPricing, /organisation_type = 'platform'/);
		    assert.doesNotMatch(customerPricing, /organisationId/);
	    assert.doesNotMatch(view, /taskStatusClass\(task\.status\)/);
    assert.doesNotMatch(view, /taskValueClass\(task\.priorityScore\)/);
    assert.doesNotMatch(view, /taskValueLabel\(task\.priorityScore, locale\)/);
    assert.doesNotMatch(view, /task\.priorityReason \?\? labels\.stock\.notSet/);
    assert.doesNotMatch(view, /fxAttribution|exchangerate-api\.com/);
    assert.doesNotMatch(view, /expiresAt: draft\.expiresAt/);
    assert.doesNotMatch(view, /row\.expiresAt/);
    assert.doesNotMatch(view, /editor\.draft\.expiresAt/);
    assert.match(view, /panelFromView/);
    assert.doesNotMatch(view, /view === "retail-task-queue"/);
    assert.match(view, /view === "retail-audit"/);
    assert.doesNotMatch(view, /panel === "audit"/);
    assert.doesNotMatch(view, /auditRows/);
    assert.doesNotMatch(view, /auditDetailText/);
	    assert.doesNotMatch(view, /labels\.stock\.event/);
	    assert.doesNotMatch(view, /labels\.stock\.claimedBy/);
	    assert.doesNotMatch(view, /formatDateTime\(task\.claimedAt, locale\)/);
		    assert.doesNotMatch(view, /function openCustomerOrderDraft/);
	    assert.match(view, /function updateCustomerOrderOrganisation/);
	    assert.match(view, /function addCustomerOrderLine/);
	    assert.match(view, /function updateCustomerOrderLine/);
	    assert.match(view, /function removeCustomerOrderLine/);
	    assert.match(view, /customerOrderAvailability/);
	    assert.match(view, /\/api\/retail\/basket\/availability/);
	    assert.match(view, /const customerOrderProductOptions = useMemo/);
	    assert.match(view, /organisationId: selectedRetailerOrganisationId/);
	    assert.match(view, /Boolean\(customerOrderDraft\?\.lines\.length\)/);
	    assert.match(view, /function updateCustomerOrderMode\(mode: CustomerOrderMode\)/);
	    assert.match(view, /mode === "regional" && !data\.canRouteRegionalCheckout/);
	    assert.match(view, /source: customerOrderDraft\.mode === "regional" \? "checkout" : "manual"/);
	    assert.match(view, /errorFallback: labels\.stock\.customerOrderSaveError/);
	    assert.match(view, /labels\.stock\.dueAt/);
	    assert.match(view, /updateCustomerOrderOrganisation\(event\.target\.value\)/);
	    assert.match(view, /customerOrderProductOptions\.map/);
	    assert.match(page, /selectedRetailCustomerOrderId = firstParam\(query\.order\)/);
	    assert.match(dashboard, /selectedRetailCustomerOrderId/);
	    assert.match(view, /selectedRetailCustomerOrderId/);
	    assert.match(view, /customerOrderHref\(order\.id\)/);
	    assert.match(view, /href=\{customerOrderHref\(order\.id\)\}/);
	    assert.doesNotMatch(view, /const showCustomerOrderWorkbench =/);
	    assert.match(view, /panel === "customer-orders" \|\| panel === "fulfillment"/);
	    assert.match(view, /customerOrderDetail \? \(/);
	    assert.match(view, /labels\.stock\.backToCustomerOrders/);
	    assert.match(view, /labels\.stock\.allocatedTo/);
	    assert.match(view, /buildCustomerOrderWorkflowSteps/);
	    assert.match(customerOrderDisplay, /order\.workflowTimeline\.orderedAt/);
	    assert.match(customerOrderDisplay, /labels\.stock\.awaitingStock/);
	    assert.match(customerOrderDisplay, /current === "ready_to_pack"[\s\S]*current === "ready_to_ship"[\s\S]*current === "pickup_booked"[\s\S]*current === "sent"[\s\S]*key: "awaiting_stock"/);
	    assert.match(customerOrderDisplay, /label: labels\.stock\.readyToPack/);
	    assert.match(customerOrderDisplay, /label: labels\.stock\.readyToShip/);
	    assert.match(customerOrderDisplay, /active: current === "ready_to_ship"[\s\S]*key: "ready_to_ship"/);
	    assert.match(customerOrderDisplay, /active: false,[\s\S]*key: "pickup_booked"/);
	    assert.match(customerOrderDisplay, /active: current === "pickup_booked"[\s\S]*key: "sent"/);
	    assert.match(customerOrderDisplay, /label: labels\.stock\.pickupBooked/);
	    assert.match(customerOrderDisplay, /order\.workflowTimeline\.boxedAt \?\? order\.workflowTimeline\.allocatedAt/);
	    assert.match(view, /grid gap-3 md:grid-cols-6/);
		    assert.match(view, /isCurrent[\s\S]*bg-amber-50 text-amber-900 ring-amber-200/);
		    assert.match(view, /isCompleted[\s\S]*bg-\[#ECFDF5\] text-\[#126B4F\] ring-\[#A7F3D0\]/);
		    assert.match(view, /<Check className="size-3\.5" strokeWidth=\{3\} \/>/);
		    assert.match(customerOrderDisplay, /function customerOrderStatusPillClass/);
			    assert.match(customerOrderDisplay, /order\.status === "awaiting_stock" \|\| order\.workflowStage === "awaiting_stock"[\s\S]*return "Awaiting stock";/);
			    assert.match(customerOrderDisplay, /order\.status === "awaiting_stock" \|\|[\s\S]*order\.workflowStage === "awaiting_stock" \|\|[\s\S]*customerOrderHasPickupBooked\(order\)[\s\S]*bg-amber-50 text-amber-800 ring-amber-100/);
		    assert.doesNotMatch(view, /labels\.stock\.stuck/);
		    assert.doesNotMatch(view, /labels\.stock\.onTrack/);
		    assert.match(orderDocuments, /const emptyRetailField = "";/);
		    assert.match(view, /formatDate\(step\.at, locale\) \?\? emptyRetailField/);
	    assert.doesNotMatch(view, /labels\.stock\.boxed/);
	    assert.match(customerOrderDisplay, /label: labels\.stock\.sent/);
	    assert.match(view, /grid shrink-0 grid-cols-3 gap-5 text-right sm:gap-8/);
	    assert.match(view, /const identifiers = orderLineIdentifierParts\(line\)/);
	    assert.match(view, /identifiers\.map\(\(identifier\)/);
	    assert.match(view, /line\.etaDate \? \([\s\S]*awaitingStockUnits > 0 \? \([\s\S]*line\.availabilityStatus \? \(/);
	    assert.match(stockControls, /function retailAvailabilityLabel/);
	    assert.match(stockControls, /available_now: "Available now"/);
	    assert.match(view, /retailAvailabilityLabel\(\s*line\.availabilityStatus\s*\)/);
	    assert.doesNotMatch(view, /readableToken\(line\.availabilityStatus\)/);
	    assert.match(view, /\{labels\.stock\.quantity\}[\s\S]*\{line\.quantityOrdered\}[\s\S]*\{labels\.stock\.retailPrice\}[\s\S]*formatPrice\([\s\S]*line\.retailPriceAmount[\s\S]*\{labels\.stock\.lineTotal\}[\s\S]*line\.retailPriceAmount \* line\.quantityOrdered/);
	    assert.match(view, /const pickupDialogItemCount = pickupDialogLines\.reduce/);
	    assert.match(view, /\{labels\.stock\.quantity\}[\s\S]*\{labels\.stock\.retailPrice\}[\s\S]*\{labels\.stock\.lineTotal\}/);
	    assert.doesNotMatch(view, /\{labels\.stock\.lineTotal\}: /);
	    assert.doesNotMatch(view, /\{labels\.stock\.allocate\}: \{line\.quantityAllocated\}/);
	    assert.doesNotMatch(view, /\{labels\.stock\.ship\}: \{line\.quantityShipped\}/);
	    assert.doesNotMatch(view, /customerOrderDetailEvents/);
	    assert.doesNotMatch(view, /labels\.stock\.workflow/);
	    assert.doesNotMatch(view, /labels\.stock\.audit/);
	    assert.doesNotMatch(view, /labels\.stock\.taskDetails/);
	    assert.doesNotMatch(view, /customerOrderDetail\.openTaskCount/);
	    assert.doesNotMatch(view, /customerOrderDetail\.taskCount/);
	    const retailStockFormatters = readFileSync("components/admin/retail-stock-formatters.ts", "utf8");
	    assert.match(view, /from "@\/components\/admin\/retail-stock-formatters"/);
	    assert.match(retailStockFormatters, /export function formatPrice/);
	    assert.match(retailStockFormatters, /export function formatAmount/);
	    assert.match(retailStockFormatters, /export function formatWholeAmount/);
	    assert.doesNotMatch(view, /function pipelineCapitalValues/);
	    assert.doesNotMatch(view, /customerOrderListPipelineSummary/);
	    assert.doesNotMatch(view, /customerOrderDetailCapitalValues/);
	    assert.doesNotMatch(view, /pipeline=\{customerOrderDetail\.pipeline\}/);
	    assert.doesNotMatch(view, /pipeline=\{line\.pipeline\}/);
	    assert.doesNotMatch(view, /labels\.stock\.stockPipeline/);
	    assert.match(view, /labels\.stock\.allocateAvailable/);
		    assert.doesNotMatch(view, /labels\.stock\.buildDraftPo/);
		    assert.doesNotMatch(view, /labels\.stock\.shortfallHandling/);
		    assert.doesNotMatch(view, /labels\.stock\.noSupplierShortfall/);
		    assert.doesNotMatch(view, /labels\.stock\.ordered\}: \{line\.remaining\} \//);
		    assert.doesNotMatch(view, /labels\.stock\.receivedNow\}: \{receivedNow\} \//);
		    assert.doesNotMatch(view, /labels\.stock\.shortfall\}: \{shortfallAfterReceive\}/);
	    assert.doesNotMatch(view, /sm:col-span-3[\s\S]*labels\.stock\.ordered/);
		    assert.doesNotMatch(view, /value=\{[\s\S]*hasSupplierShortfall[\s\S]*"no_shortfall"/);
		    assert.doesNotMatch(view, /disabled=\{Boolean\(busyId\) \|\| !hasSupplierShortfall\}/);
	    assert.doesNotMatch(view, /shortfallAfterReceive > 0 \? \(/);
	    assert.doesNotMatch(view, /shortfallResolutionLabel\(labels, line\.shortfallResolution\)/);
	    assert.doesNotMatch(view, /rounded-md bg-emerald-50[\s\S]*labels\.stock\.noSupplierShortfall/);
		    assert.doesNotMatch(view, /shortfallResolutionLabel/);
		    assert.doesNotMatch(view, /taskCanBuildDraftPo\(taskDetail\)/);
		    assert.doesNotMatch(view, /build_purchase_order_from_backorder_task/);
	    assert.match(view, /customerOrderCanAllocate/);
	    assert.match(view, /actionStates\.allocateAvailable\.enabled/);
	    assert.match(view, /disabled=\{Boolean\(busyId\) \|\| !customerOrderCanAllocate\}/);
	    assert.doesNotMatch(view, /line\.pipeline\?\.availableNowUnits \?\? line\.quantityAvailableNow/);
	    assert.doesNotMatch(view, /openCustomerOrderDetail/);
	    assert.match(view, /customerOrderDetail\.routingSnapshot\?\.unavailableLines\.length[\s\S]*customerOrderDetail\.workflowHealth\.reason[\s\S]*orderItems/);
	    assert.match(content, /dueAt: "Due date"/);
	    assert.match(content, /downloadPdf: "Download PDF"/);
	    assert.match(content, /deliveryDetails: "Delivery details"/);
	    assert.match(content, /shippingLabel: "Shipping label"/);
	    assert.doesNotMatch(content, /kexHandlingSheet/);
	    assert.doesNotMatch(content, /kexMygeiaExport/);
	    assert.match(content, /awaitingStock: "Awaiting Stock"/);
	    assert.match(content, /boxed: "Boxed"/);
			    assert.doesNotMatch(view, /openPurchaseOrderDetail/);
			    assert.doesNotMatch(view, /aria-label=\{`\$\{labels\.stock\.purchaseOrderDetails\}: \$\{order\.poNumber\}`\}/);
			    assert.doesNotMatch(view, /onClick=\{\(\) => openPurchaseOrderDetail\(order\.id\)\}/);
			    assert.doesNotMatch(view, /openPurchaseOrderDetail\(order\.id\);/);
			    assert.doesNotMatch(view, /openTaskDetail/);
			    assert.doesNotMatch(view, /labels\.stock\.purchaseOrderDetails/);
			    assert.doesNotMatch(view, /purchaseOrderStatusLabel\(labels, order\.status\)/);
			    assert.doesNotMatch(view, /purchaseOrderStatusLabel\(labels, purchaseOrderDetail\.status\)/);
		    assert.doesNotMatch(view, /selectedPurchaseOrderFilter, setSelectedPurchaseOrderFilter\][\s\S]*useState<RetailPurchaseOrderFilter>\("all"\)/);
		    assert.doesNotMatch(view, /searchedPurchaseOrderRows/);
				    assert.doesNotMatch(view, /purchaseOrderStatusSummary/);
				    assert.doesNotMatch(view, /purchaseOrderMetrics/);
				    assert.doesNotMatch(view, /labels\.stock\.purchaseOrderStatusAll/);
				    assert.match(view, /outstandingPurchaseItems/);
				    assert.doesNotMatch(view, /restockingAdviceItems/);
				    assert.match(view, /reorderPurchaseItems/);
					    assert.doesNotMatch(view, /reorderKind: "required"/);
				    assert.match(view, /pipeline\.unorderedNeedUnits <= 0/);
				    assert.match(view, /unassignedDemandUnits/);
				    assert.match(view, /assignedActiveUnits/);
				    assert.doesNotMatch(view, /availableStockUnits/);
				    assert.doesNotMatch(view, /allocatedStockUnits/);
				    assert.match(shoppingListViewModel, /function activeShoppingListCoverageUnits/);
				    assert.match(view, /coveredByActiveListUnits/);
				    assert.match(shoppingListViewModel, /line\.actualQuantity - line\.stockedQuantity/);
				    assert.match(view, /returnedDemandByOrgProduct/);
				    assert.match(shoppingListViewModel, /function activeShoppingListReturnedDemandUnits/);
				    assert.match(view, /returnedDemandByOrgProduct\.get\(key\) \?\? 0/);
				    assert.doesNotMatch(
				      view,
				      /Current awaiting-stock products are already on active/
				    );
				    assert.match(view, /selectedOutstandingPurchaseKeys/);
				    assert.match(view, /defaultOutstandingPurchaseKeys/);
				    assert.match(view, /defaultOutstandingPurchaseKeySignature/);
				    assert.match(view, /outstandingPurchaseSelectionKeys/);
				    assert.doesNotMatch(view, /assignedPurchaseItems/);
				    assert.match(view, /function toggleOutstandingPurchaseItem/);
					    assert.doesNotMatch(view, /function openSelectedOutstandingPurchaseOrderDraft/);
					    assert.doesNotMatch(view, /function openBlankPurchaseOrderDraft/);
				    assert.match(view, /selectedOutstandingPurchaseItems\.length === 0/);
				    assert.doesNotMatch(view, /startsNewGroup && "mt-5"/);
				    assert.doesNotMatch(view, /labels\.stock\.reorderAdvise/);
				    assert.doesNotMatch(view, /bg-red-50\/35 ring-red-100 hover:bg-red-50\/60/);
				    assert.doesNotMatch(view, /bg-sky-50\/35 ring-sky-100 hover:bg-sky-50\/60/);
				    assert.doesNotMatch(view, /panel === "purchase-orders" && outstandingPurchaseItems\.length > 0/);
				    assert.match(view, /type="checkbox"/);
					    assert.match(view, /labels\.stock\.createShoppingList/);
				    assert.doesNotMatch(view, /labels\.stock\.addCheckedToShoppingList/);
				    assert.match(view, /view === "retail-stock-advice" \|\| view === "retail-reorder"/);
				    assert.doesNotMatch(view, /panel === "reorder"/);
				    assert.doesNotMatch(view, /labels\.stock\.purchasePlan/);
				    assert.doesNotMatch(view, /reorderRecommendationItems/);
				    assert.match(view, /labels\.stock\.reorderBackordersDescription/);
				    assert.match(view, /labels\.stock\.reorderBackorders[\s\S]*labels\.stock\.reorderBackordersDescription/);
				    assert.doesNotMatch(view, /labels\.stock\.reorderRecommendations[\s\S]*<p className="mt-1 text-sm font-normal leading-6 text-gray-600">[\s\S]*labels\.stock\.reorderRecommendationsDescription/);
				    assert.doesNotMatch(view, /<p className="mb-4 max-w-3xl text-sm leading-6 text-gray-600">/);
				    assert.match(view, /defaultOutstandingPurchaseKeys[\s\S]*reorderPurchaseItems\[0\]\?\.organisationId/);
				    assert.match(view, /return reorderPurchaseItems[\s\S]*orgProductKey\(item\.organisationId, item\.productId\)/);
				    assert.match(view, /<th className="py-2 pr-3">\{labels\.stock\.product\}<\/th>/);
				    assert.doesNotMatch(view, /<th className="py-2 pl-3 pr-3">\s*\{labels\.stock\.selectProduct\}\s*<\/th>/);
				    assert.match(view, /<header className="mb-4">/);
				    assert.match(view, /labels\.stock\.reorderBackorders[\s\S]*<thead className="bg-gray-50/);
				    assert.doesNotMatch(view, /labels\.stock\.reorderBackorders[\s\S]*border-t border-gray-200[\s\S]*labels\.stock\.reorderRecommendations/);
				    assert.match(view, /rounded-md bg-white p-4 ring-1 ring-gray-200[\s\S]*text-lg font-semibold text-gray-900[\s\S]*labels\.stock\.shoppingLists/);
				    assert.doesNotMatch(view, /labels\.stock\.shoppingListsDescription/);
				    assert.match(view, /shoppingListCandidateItems/);
				    assert.match(view, /shoppingListCandidateItems = useMemo\(\s*\(\) => reorderPurchaseItems/);
				    assert.match(view, /labels\.stock\.createShoppingList[\s\S]*labels\.stock\.shoppingLists/);
				    assert.doesNotMatch(view, /pendingShoppingList/);
				    assert.doesNotMatch(view, /setPendingShoppingList/);
				    assert.match(view, /const shoppingListModalList = activeShoppingList/);
				    assert.match(view, /shoppingListModalList \? \(/);
				    assert.match(view, /movementAdd/);
				    assert.match(view, /movementRemove/);
				    assert.match(view, /type: "receive" as const, label: labels\.stock\.movementAdd/);
				    assert.match(view, /type: "adjustment" as const, label: labels\.stock\.movementRemove/);
				    assert.doesNotMatch(view, /"transfer_in"/);
				    assert.doesNotMatch(view, /"expiry_write_off"/);
				    assert.doesNotMatch(view, /min-w-\[680px\]/);
				    assert.match(view, /labels\.stock\.shoppingLists/);
				    assert.match(view, /labels\.stock\.quantity/);
				    assert.doesNotMatch(view, /Amount to buy/);
				    assert.doesNotMatch(view, /Item count/);
				    assert.doesNotMatch(view, /Open Shopping Lists/);
				    assert.doesNotMatch(view, /Backorder demand/);
				    assert.doesNotMatch(view, /Free stock/);
				    assert.doesNotMatch(view, /Reserved stock/);
				    assert.doesNotMatch(view, /Assigned to active lists/);
				    assert.match(view, /orderLineAwaitingStockUnits/);
				    assert.match(view, /bg-amber-50 px-2 py-1 font-semibold text-amber-800/);
				    assert.doesNotMatch(view, /Awaiting stock ·/);
				    assert.doesNotMatch(view, /customerOrderAwaitingStockUnitsByOrderId/);
				    assert.match(
				      shoppingListModal,
				      /labels\.stock\.requiredQuantity[\s\S]*labels\.stock\.actualQuantity/
				    );
				    assert.match(shoppingListModal, /\{line\.requiredQuantity\}/);
				    assert.doesNotMatch(shoppingListModal, /updateLine\(line\.id, \{ requiredQuantity/);
				    assert.doesNotMatch(shoppingListModal, /Amount to buy/);
				    assert.match(
				      shoppingListModal,
				      /const columns = \[\s*"sku",\s*"ean13",\s*"manufacturerSku",\s*"productTitle",\s*"requiredQuantity",\s*"actualQuantity",\s*"wholesalePrice",\s*"retailPrice"/
				    );
				    assert.doesNotMatch(shoppingListModal, /const columns = \[\s*"productId"/);
				    assert.doesNotMatch(shoppingListModal, /indexByName\.get\("productId"\)/);
				    assert.match(shoppingListModal, /matchShoppingListImportRow/);
				    assert.match(shoppingListModal, /amountToBuy/);
				    assert.match(shoppingListModal, /printShoppingListPdf/);
				    assert.match(shoppingListModal, /\{labels\.stock\.exportPdf\}/);
				    assert.match(shoppingListModal, /priceHeader\("Wholesale Price", list\.currency\)/);
				    assert.match(shoppingListModal, /priceHeader\(labels\.stock\.priceOverride, list\.currency\)/);
				    assert.doesNotMatch(shoppingListModal, /placeholder="Optional"/);
				    assert.doesNotMatch(shoppingListModal, /Actual bought quantity/);
				    assert.doesNotMatch(shoppingListModal, />Demand</);
						    assert.doesNotMatch(view, /groupedShoppingListDraftLines/);
						    assert.doesNotMatch(view, /<Fragment/);
						    assert.match(shoppingListModal, /labels\.stock\.updateStockCounts/);
						    assert.doesNotMatch(shoppingListModal, />\s*Save\s*</);
				    assert.doesNotMatch(view, /const quantityLabel/);
				    assert.doesNotMatch(view, /labels\.stock\.reorderRequired/);
				    assert.doesNotMatch(view, /labels\.stock\.reorderAdvisory/);
			    assert.doesNotMatch(view, /panel === "purchase-orders" \? \([\s\S]*openBlankPurchaseOrderDraft/);
		    assert.doesNotMatch(view, /openPurchaseOrderDraft\(item\.organisationId\)/);
		    assert.doesNotMatch(view, /selectedMetricId=\{selectedPurchaseOrderFilter\}/);
		    assert.doesNotMatch(view, /setSelectedPurchaseOrderFilter/);
			    assert.doesNotMatch(view, /\["claim", "complete", "snooze"\] as const/);
		    assert.doesNotMatch(view, /purchaseOrderReviewTask/);
			    assert.doesNotMatch(view, /if \(saved && taskAction === "claim"\)/);
			    assert.doesNotMatch(view, /setPurchaseOrderDetailId/);
			    assert.doesNotMatch(view, /markPurchaseOrderOrdered/);
			    assert.doesNotMatch(view, /taskAction === "complete" && !taskIsClaimed\(taskDetail\)/);
    assert.doesNotMatch(view, /labels\.stock\.profitImpact/);
    assert.doesNotMatch(view, /"escalate"/);
			    assert.doesNotMatch(view, /create_purchase_order/);
		    assert.match(view, /create_customer_order/);
			    assert.doesNotMatch(view, /receive_purchase_order_line/);
		    assert.doesNotMatch(route, /mark_purchase_order_line_missing/);
	    assert.doesNotMatch(view, /labels\.stock\.markMissing/);
	    assert.doesNotMatch(view, /Mark missing/);
			    assert.doesNotMatch(view, /receiveLineRemaining\(line\) > 0/);
			    assert.doesNotMatch(view, /function validReceiveQuantity/);
			    assert.doesNotMatch(view, /setReceiveEditor\(null\);[\s\S]*action: "receive_purchase_order_lines"/);
			    assert.doesNotMatch(view, /receiveEditor\.expiresAt/);
			    assert.doesNotMatch(route, /action === "receive_purchase_order_lines"[\s\S]*reconcileRetailPurchaseOrderLineShortfall/);
			    assert.doesNotMatch(route, /action === "receive_purchase_order_line"[\s\S]*expiresAt: null/);
			    assert.doesNotMatch(route, /action === "mark_purchase_order_line_missing"/);
		    assert.doesNotMatch(route, /action === "build_purchase_order_from_backorder_task"/);
	    assert.match(stockTypes, /export type AdminRetailStockPipelineRow/);
	    assert.match(service, /export \{ getRetailStockPipeline \}/);
	    assert.match(stockPipeline, /export async function getRetailStockPipeline/);
		    assert.match(stockPipeline, /customerDemandUnits[\s\S]*allocatedUnits[\s\S]*availableNowUnits[\s\S]*unorderedNeedUnits/);
			    assert.match(view, /\.filter\(\(item\) => item\.unassignedDemandUnits > 0\)/);
			    assert.match(view, /outstandingPurchaseItems\.filter\(\(item\) => item\.unassignedDemandUnits > 0\)/);
		    assert.match(view, /setSelectedOutstandingPurchaseKeys\(null\)/);
		    assert.match(view, /async function saveShoppingListDraft\(\)/);
		    assert.match(view, /responseMode: "minimal"/);
		    assert.match(view, /refreshRetailStockData\(\)\.catch/);
		    assert.match(view, /status: "closed"/);
		    assert.match(route, /responseModeValue/);
		    assert.match(route, /readModel: 0/);
		    assert.match(view, /item\.amountToBuyUnits < 1[\s\S]*return;/);
		    assert.doesNotMatch(service, /export async function buildPurchaseOrderDraftFromBackorderTask/);
		    assert.doesNotMatch(service, /retail_purchase_order_place_order/);
	    assert.match(orderReadModel, /No live stock is available to allocate/);
	    assert.match(stockTypes, /export type AdminRetailCustomerOrderActionStates/);
	    assert.match(orderReadModel, /export function getRetailCustomerOrderActionStates/);
	    assert.match(service, /export \{ getRetailCustomerOrderActionStates \}/);
	    assert.match(service, /\bensureOrderWorkflowTask\b/);
	    assert.match(operationTasks, /export async function ensureOrderWorkflowTask/);
	    assert.match(operationTasks, /admin\.retail_order_workflow_task_repaired/);
	    assert.match(operationTasks, /retail_order_task_repaired/);
	    assert.doesNotMatch(service, /Missing open \$\{nextExpectedTaskType\} task for \$\{workflowStage\}/);
	    assert.doesNotMatch(service, /Build a draft purchase order before completing this task/);
		    assert.doesNotMatch(service, /select distinct\s+retail_customer_orders\.id::text[\s\S]*retail_customer_orders\.due_at/);
				    assert.match(service, /retail_customer_orders\.organisation_id = \$\{list\.organisation_id\}::uuid[\s\S]*retail_customer_order_lines\.product_id = any\(\$\{changedProductIds\}::uuid\[\]\)[\s\S]*allocateRetailCustomerOrder\(context/);
			    assert.match(service, /releaseRetailStockOverAllocationsAfterStockCount/);
			    assert.match(stockAllocationIntegrity, /shopping_list_stock_count_reduced/);
			    assert.match(stockAllocationIntegrity, /status = 'cancelled'/);
			    assert.match(stockAllocationIntegrity, /quantity_allocated = greatest\(0, quantity_allocated - \$\{releaseUnits\}\)/);
			    assert.match(stockAllocationIntegrity, /set status = 'awaiting_stock'/);
				    assert.match(stockAllocationIntegrity, /admin\.retail_stock_allocations_released/);
					    assert.doesNotMatch(view, /labels\.stock\.receiveAll/);
			    assert.doesNotMatch(view, /labels\.stock\.receiveQuantityError/);
			    assert.doesNotMatch(view, /openReceiveEditor\(order, lines\)/);
			    assert.doesNotMatch(view, /updateReceiveLineDraft\(line\.lineId/);
			    assert.doesNotMatch(view, /receiveLineRemaining\(line\)/);
				    assert.doesNotMatch(view, /receiveQuantity: String\(remaining\)/);
			    assert.doesNotMatch(view, /receiveQuantity: String\(line\.remaining\)/);
			    assert.doesNotMatch(view, /variant="primary"[\s\S]*\{labels\.stock\.receiveAll\}/);
			    assert.doesNotMatch(view, /onClick=\{\(\) => saveReceiving\(\)\}/);
			    assert.doesNotMatch(view, /const receivingGroups = useMemo/);
		    assert.doesNotMatch(view, /linesByPurchaseOrderId/);
			    assert.match(content, /search: "Search"/);
			    assert.match(content, /search: "ค้นหา"/);
			    assert.match(content, /capital: "Capital"/);
			    assert.match(content, /units: "Units"/);
				    assert.match(content, /retailValue: "Retail value"/);
				    assert.match(content, /customerOrderSaveError: "Could not save customer order\."/);
					    assert.doesNotMatch(content, /addPurchaseOrder: "New Purchase Order"/);
						    assert.doesNotMatch(content, /createPo: "Create PO"/);
						    assert.doesNotMatch(content, /purchasePlan: "Purchase plan"/);
						    assert.match(content, /unorderedNeedDescription:/);
						    assert.match(content, /createShoppingList: "Create Shopping List"/);
						    assert.doesNotMatch(content, /addCheckedToShoppingList/);
						    assert.match(content, /reorderBackorders: "Backorders"/);
						    assert.match(content, /reorderBackordersDescription:\s*"These items are required to cover active customer orders\."/);
						    assert.match(content, /movementAdd: "Add"/);
						    assert.match(content, /movementRemove: "Remove"/);
						    assert.match(content, /shoppingLists: "Shopping Lists"/);
						    assert.doesNotMatch(content, /shoppingListsDescription:/);
					    assert.doesNotMatch(content, /purchaseOrderDetails: "Purchase order details"/);
				    assert.doesNotMatch(content, /purchaseOrderStatusAll: "All"/);
				    assert.doesNotMatch(content, /purchaseOrderStatusPartial: "Partial"/);
				    assert.doesNotMatch(content, /purchaseOrderStatusClosed: "Closed"/);
			    assert.doesNotMatch(content, /voidPurchaseOrder: "Void purchase order"/);
		    assert.doesNotMatch(content, /Enter a whole quantity between 0 and the remaining amount/);
		    assert.doesNotMatch(content, /receiveAll: "All"/);
	    assert.match(content, /supplierBackorder: "Supplier backorder"/);
	    assert.match(content, /closedShort: "Closed short"/);
	    assert.match(content, /noSupplierShortfall: "No shortfall"/);
	    assert.match(content, /noOrders: "No orders"/);
		    assert.doesNotMatch(view, /purchaseOrderRows\.length === 0[\s\S]*labels\.stock\.noOrders/);
	    assert.match(view, /customerOrderRows\.length === 0[\s\S]*labels\.stock\.noOrders/);
	    assert.match(content, /ordered: "Ordered"/);
	    assert.match(content, /receivedNow: "Received"/);
		    assert.doesNotMatch(view, /order\.supplierName/);
		    assert.doesNotMatch(view, /update_retail_task/);
    assert.match(view, /record_stock_movement/);
    assert.match(view, /void_stock_movement/);
    assert.match(view, /setEditor/);
    assert.match(view, /<AdminModal/);
    assert.match(view, /role="button"/);
    assert.match(view, /<option key=\{status\} value=\{status\}>/);
    assert.doesNotMatch(view, /function saveRow/);
    assert.doesNotMatch(view, /const \[drafts/);
    assert.match(route, /async upsert_stock_item\(context, body\)/);
    assert.match(route, /executeRetailCommand/);
    assert.match(route, /backorderPolicyValue/);
    assert.doesNotMatch(
      route,
      /action === "upsert_stock_item"[\s\S]*?expiresAt[\s\S]*?action === "set_stock_status"/
    );
    assert.match(route, /async set_stock_status\(context, body\)/);
	    assert.match(route, /async record_stock_movement\(context, body\)/);
	    assert.match(route, /async void_stock_movement\(context, body\)/);
		    assert.doesNotMatch(route, /action === "void_purchase_order"/);
    assert.match(stockData, /products[\s\S]*status = 'approved'/);
    assert.match(stockData, /lower\(coalesce\(products\.normalized_brand_name, products\.brand_name, ''\)\) in \('dhc', 'dmc'\)/);
    assert.match(stockData, /coalesce\(products\.source_url, ''\) ilike '%dhc\.co\.jp%'/);
    assert.match(service, /retail_sellable_products/);
    assert.match(customerOrders, /getRetailCartLineAvailability/);
    assert.match(customerOrders, /resolveUsdRateForCurrency/);
    assert.match(customerOrders, /pricingSnapshot/);
    assert.match(customerOrders, /fulfillmentPromise/);
    assert.match(customerOrders, /Master List country RRP is required before checkout/);
    assert.doesNotMatch(service, /taskType: "retail_purchase_order_review"/);
    assert.doesNotMatch(service, /tasks\.task_type <> 'retail_purchase_order_review'/);
    assert.match(customerOrders, /claimedByDisplayName/);
    assert.match(stockData, /claimed_people\.display_name/);
    assert.doesNotMatch(service, /completedReviewTaskIds/);
    assert.doesNotMatch(service, /completedByAction: "mark_purchase_order_ordered"/);
    assert.doesNotMatch(service, /Task must be claimed before it can be completed/);
	    assert.doesNotMatch(service, /voidRetailPurchaseOrder/);
	    assert.doesNotMatch(service, /admin\.retail_purchase_order_voided/);
    assert.match(service, /awaiting_stock/);
    assert.match(stockMutations, /currency = excluded\.currency/);
    assert.match(service, /status <> 'deleted'/);
    assert.match(service, /recordAdminAudit/);
    assert.match(stockTypes, /AdminRetailAuditEvent/);
    assert.match(stockData, /admin_audit_events/);
    assert.match(stockData, /task_events/);
    assert.match(stockData, /auditEvents/);
    assert.match(stockMutations, /admin\.stock_created/);
    assert.match(stockMutations, /admin\.stock_updated/);
    assert.match(stockMutations, /admin\.stock_status_updated/);
    assert.match(stockMutations, /recordRetailStockSnapshot/);
    assert.match(stockSideEffects, /retail_product_stock_snapshots/);
    assert.doesNotMatch(service, /retail_product_stock\.expires_at/);
    assert.doesNotMatch(service, /sourceEntityType: "retail_product_stock"[\s\S]*retail_stock_expiry_review/);
	    assert.match(stockData, /case when tasks\.status in \('completed', 'cancelled', 'skipped'\) then 1 else 0 end/);
	    assert.match(stockSideEffects, /priorityReason: "Refresh stock forecast after stock changed\."[\s\S]*taskType: "retail_stock_forecast_refresh"/);
	    assert.doesNotMatch(service, /tasks\.task_type <> 'retail_stock_forecast_refresh'/);
	    assert.match(stockData, /tasks\.actor_type/);
	    assert.match(stockData, /reserved_agents\.name as agent_name/);
	    assert.match(stockData, /isAgentTask/);
	    assert.match(service, /recordRetailStockMovement/);
		    assert.doesNotMatch(service, /export type RetailPurchaseOrderShortfallResolution/);
		    assert.doesNotMatch(service, /export async function reconcileRetailPurchaseOrderLineShortfall/);
		    assert.doesNotMatch(service, /export async function markRetailPurchaseOrderLineMissing/);
		    assert.doesNotMatch(service, /admin\.retail_purchase_order_shortfall_reconciled/);
		    assert.doesNotMatch(service, /retail_purchase_order_shortfall_reconciled/);
		    assert.doesNotMatch(service, /retail_purchase_order_shortfall_reopened_demand/);
			    assert.doesNotMatch(service, /reconcileRetailerShoppingListShortages/);
				    assert.match(service, /ensureRetailOrderShortagesInReorderAdvice/);
				    assert.match(stockAllocationIntegrity, /admin\.retail_reorder_advice_shortages_reconciled/);
				    assert.match(customerOrders, /expectedTaskType === "retail_shopping_list_review"[\s\S]*ensureRetailOrderShortagesInReorderAdvice/);
				    assert.match(customerOrders, /reorderAdviceShortageUnits/);
				    assert.match(stockAllocationIntegrity, /shopping_list_receiving/);
		    assert.match(service, /voidRetailStockMovement/);
			    assert.match(service, /refreshRetailStockReorderAdvice/);
			    assert.match(stockReorderAdvice, /export async function refreshRetailStockReorderAdvice/);
			    assert.match(stockReorderAdvice, /insert into public\.retail_stock_reorder_advice/);
			    assert.match(stockReorderAdvice, /retail_stock_reorder_review/);
		    assert.match(stockAllocationIntegrity, /ensureRetailStockRow\(context,[\s\S]*source: "retail_order_shortage_reorder_advice"/);
		    assert.doesNotMatch(
		      stockAllocationIntegrity,
		      /function ensureRetailOrderShortagesInReorderAdvice[\s\S]*insert into public\.retail_shopping_lists/
		    );
	    assert.match(stockData, /retail_stock_reorder_advice\.risk_level <> 'ok'/);
    assert.match(stockData, /retail_stock_reorder_advice\.suggested_order_quantity > 0/);
    assert.match(service, /queueRetailStockIntelligenceRefresh/);
    assert.match(stockSideEffects, /export async function queueRetailStockIntelligenceRefresh/);
    assert.match(stockMutations, /retail_stock_movements/);
    assert.match(stockMutations, /retail_stock_lots/);
    assert.match(service, /retail_stock_reorder_advice/);
	    assert.doesNotMatch(service, /createRetailPurchaseOrder/);
	    assert.match(service, /createRetailCustomerOrder/);
	    assert.match(stockCodecs, /if \(value === null \|\| value === undefined \|\| value === ""\)/);
	    assert.match(customerOrders, /resolveRegionalBasketAvailability/);
    assert.match(customerOrders, /regionalRouting/);
	    assert.match(customerOrders, /selectedRetailerOrganisationId/);
	    assert.match(customerOrders, /shippingCountry/);
	    assert.match(operationTasks, /completeOrderWorkflowTask/);
	    assert.match(customerOrders, /recordRetailCustomerOrderPickupBooked/);
	    assert.match(customerOrders, /action: "book_pickup"/);
	    assert.match(customerOrders, /workflowAction: "book_pickup"/);
	    assert.match(stockTypes, /bookPickup: AdminRetailCustomerOrderActionState/);
	    assert.match(customerOrders, /taskType: "retail_order_pack"/);
	    assert.match(customerOrders, /idempotencyKey: `\$\{order\.id\}:pack`/);
	    assert.match(customerOrders, /expectedTaskTypes: \["retail_order_ship"\]/);
	    assert.doesNotMatch(customerOrders, /action: "book_pickup"[\s\S]*completeOrderWorkflowTask/);
	    assert.match(orderReadModel, /customerOrderPickupInProgress\(status, shipment\)/);
	    assert.match(customerOrders, /customerOrderPickupInProgressFromShipmentTable/);
	    assert.match(customerOrders, /reason: "pickup_in_progress"/);
	    assert.match(customerOrders, /pickupInProgress: true/);
	    assert.match(orderReadModel, /shipment\?\.pickupBookedAt \?\?[\s\S]*customerOrderPickupInProgress\(status, shipment\) \? updatedAt : null/);
	    assert.match(operationTasks, /assertOrderWorkflowTaskClaimable/);
	    assert.match(customerOrders, /reconcileRetailOrderLifecycle/);
	    assert.match(customerOrders, /admin\.retail_order_lifecycle_reconciled/);
	    assert.match(stockTypes, /AdminRetailCustomerOrderWorkflowTimeline/);
	    assert.match(orderReadModel, /customerOrderWorkflowTimeline/);
	    assert.match(orderReadModel, /workflowTimeline: customerOrderWorkflowTimeline/);
	    assert.match(orderReadModel, /workflowEventStatus/);
	    assert.match(customerOrders, /transitionRetailCustomerOrder/);
	    assert.match(customerOrders, /recordRetailOrderBpmEvent/);
	    assert.match(customerOrders, /sendRetailOrderWorkflowEmail/);
	    assert.match(workflowService, /queueRetailOrderWorkflowEmail/);
	    assert.match(workflowService, /send_retail_order_workflow_email/);
	    assert.match(workflowService, /RETAIL_ORDER_EMAIL_TASK_PRIORITY = 220/);
	    assert.match(customerOrders, /workflowTaskTypeForAction/);
		    assert.match(stockReadModel, /ean13: row\.ean13/);
		    assert.match(stockReadModel, /manufacturerSku: row\.manufacturer_sku/);
	    assert.match(stockData, /product_identifiers\.identifier_type = 'ean13'/);
	    assert.match(stockData, /product_identifiers\.identifier_type = 'manufacturer_sku'/);
	    assert.doesNotMatch(service, /internalSku: row\.internal_sku/);
	    assert.doesNotMatch(stockData, /product_identifiers\.identifier_type = 'internal_sku'/);
	    const hygeiaExportRoute = readFileSync("app/api/admin/products/hygeia/export/route.ts", "utf8");
	    assert.match(hygeiaExportRoute, /buildRetailHygeiaStockExportCsv/);
	    assert.match(hygeiaExportRoute, /scope !== "retail"/);
	    assert.doesNotMatch(hygeiaExportRoute, /buildHygeiaProductExportCsv/);
	    assert.match(hygeiaExportRoute, /Retail Stock only/);
	    const retailStockRoute = readFileSync("app/api/admin/retail-stock/route.ts", "utf8");
	    assert.match(retailStockRoute, /export async function GET/);
	    assert.match(retailStockRoute, /requireAdminRouteAccess\(\s*request,\s*"stock\.read"/);
	    assert.match(customerOrders, /retailOrderWorkflowTaskDetails/);
	    assert.match(customerOrders, /@\/lib\/retail-order-workflow-rules/);
	    assert.match(workflowRules, /status === "shipped"[\s\S]*return "deliver"/);
	    assert.match(customerOrders, /taskType: "retail_order_ship"/);
	    assert.match(customerOrders, /taskType: actionTaskType/);
	    assert.match(workflowRules, /retail_order_delivery_confirm/);
	    assert.match(workflowRules, /retail_order_cancel_review/);
	    assert.match(workflowRules, /retail_order_return_review/);
	    assert.match(workflowRules, /title: "Ship customer order"/);
	    assert.match(workflowRules, /title: "Confirm customer delivery"/);
	    assert.match(workflowRules, /title: "Review customer order cancellation"/);
	    assert.match(workflowRules, /title: "Review customer order return"/);
	    assert.match(customerOrders, /source: "one_click_ship"/);
	    assert.match(customerOrders, /shipmentMetadata/);
	    assert.match(view, /const grabCarrierName = "Grab"/);
	    assert.match(view, /const shipmentCarrierOptions = \[kexCarrierName, grabCarrierName\] as const/);
	    const carrierService = readFileSync("lib/retail-carrier-shipments.ts", "utf8");
	    const kexAdapter = readFileSync("lib/kex-carrier-adapter.ts", "utf8");
	    const kexWebhookRoute = readFileSync("app/api/kex/webhook/route.ts", "utf8");
	    assert.match(kexAdapter, /export type KexCarrierCredentials/);
	    assert.match(kexAdapter, /export async function createKexShipment/);
	    assert.match(kexAdapter, /export async function generateKexLabel/);
	    assert.match(kexAdapter, /export async function bookKexPickup/);
	    assert.match(kexAdapter, /export async function syncKexTracking/);
	    assert.match(kexAdapter, /export function parseKexWebhookPayload/);
	    assert.match(kexWebhookRoute, /parseKexWebhookPayload/);
	    assert.match(carrierService, /createKexShipment/);
	    assert.match(carrierService, /generateKexLabel/);
	    assert.match(carrierService, /bookKexPickup/);
	    assert.match(carrierService, /syncKexTracking/);
	    assert.match(carrierService, /carrier_shipment_create/);
	    assert.match(carrierService, /carrier_label_generate/);
	    assert.match(carrierService, /carrier_pickup_book/);
	    assert.match(carrierService, /recordRetailCustomerOrderPickupBooked/);
	    assert.match(carrierService, /pickupProviderStatus: "requested"/);
	    assert.match(carrierService, /const hasPickupDetails = Boolean/);
	    assert.match(carrierService, /pickupProviderStatus: input\.pickupProviderStatus \?\? null/);
	    assert.match(carrierService, /pickup: hasPickupDetails/);
	    assert.match(carrierService, /pickupProviderStatus: input\.pickupProviderStatus\?\.trim\(\) \|\| "booked"/);
	    assert.match(carrierService, /carrier_tracking_sync/);
	    assert.doesNotMatch(carrierService, /carrier_adapter_not_configured/);
	    assert.doesNotMatch(retailStockRoute, /carrier_tracking_adapter_not_configured/);
	    assert.match(view, /KEX connection/);
	    assert.match(view, /generate_order_shipping_label/);
	    assert.match(view, /shipmentLabelStatusText/);
	    assert.doesNotMatch(service, /retail_order_status_transition/);
	    assert.match(workflowService, /writeFulfillmentBpmEvent/);
	    assert.match(workflowService, /retail_order_awaiting_stock/);
	    assert.match(workflowService, /retail_order_allocated/);
	    assert.match(workflowService, /retail_order_picking/);
	    assert.match(workflowService, /retail_order_packed/);
	    assert.match(workflowService, /retail_order_shipped/);
	    assert.match(workflowService, /retail_order_delivered/);
	    assert.match(workflowService, /retail_order_cancelled/);
	    assert.match(workflowService, /retail_order_returned/);
	    assert.match(workflowService, /requiredTaskTypes: \["retail_order_delivery_confirm"\]/);
	    assert.match(workflowService, /requiredTaskTypes: \["retail_order_cancel_review"\]/);
	    assert.match(workflowService, /requiredTaskTypes: \["retail_order_return_review"\]/);
	    assert.match(workflowService, /taskType: "retail_order_delivery_confirm"/);
	    assert.match(workflowService, /customerEmailEvent: "shipped"/);
	    assert.match(workflowService, /customerEmailEvent: null/);
	    assert.match(workflowService, /retail_order_\$\{input\.event\}_email_sent/);
	    assert.match(workflowService, /retail_order_\$\{input\.event\}_email_skipped/);
	    assert.match(workflowService, /retail_order_email_task_queued/);
	    assert.match(workflowService, /orderWorkflowEmails/);
	    assert.match(workflowService, /orderEmailEvent: input\.event/);
	    assert.match(workflowService, /orderNumber: input\.orderNumber/);
	    assert.match(retailProductCheckout, /sendRetailOrderWorkflowEmail/);
	    assert.doesNotMatch(retailProductCheckout, /sendRetailOrderConfirmationEmail/);
	    assert.match(flowData, /retailOrderAwaitingStock/);
	    assert.match(flowData, /retailOrderShipped/);
	    assert.match(flowData, /retailOrderDelivered/);
	    assert.match(flowData, /retailOrderCancelled/);
	    assert.match(flowData, /retailOrderReturned/);
	    assert.match(flowData, /retail_order_awaiting_stock/);
	    assert.match(flowData, /retail_order_shipped/);
	    assert.match(flowData, /!steps\.has\("retailOrderCancelled"\)/);
	    assert.match(flowData, /!steps\.has\("retailOrderReturned"\)/);
	    assert.match(route, /routingPreference/);
	    assert.match(route, /selectedRetailerOrganisationId/);
	    assert.match(route, /shippingCountry/);
	    assert.match(route, /async reconcile_customer_order_lifecycle\(context, body\)/);
	    assert.match(basketRoute, /resolveRegionalBasketAvailability/);
	    assert.match(basketRoute, /retail_basket_routing_preview/);
    assert.match(basketRoute, /parseShippingCountryCode/);
    assert.match(basketRoute, /Cache-Control/);
    assert.match(cartService, /export type RetailRoutingPreference = "cheapest_price" \| "fastest_delivery"/);
    assert.match(cartService, /export type RegionalBasketAvailability/);
    assert.match(cartService, /selectedRetailerOrganisationId/);
    assert.match(cartService, /organisations\.country_code = \$\{shippingCountry\}/);
    assert.doesNotMatch(cartService, /products\.region = \$\{shippingCountry\}/);
    assert.match(operationTasks, /queueRetailOperationTask/);
	    assert.doesNotMatch(service, /admin\.retail_purchase_order_created/);
    assert.match(customerOrders, /admin\.retail_customer_order_created/);
    assert.match(stockMutations, /admin\.stock_movement_recorded/);
    assert.match(stockMutations, /admin\.stock_movement_voided/);
    assert.match(stockMutations, /"status_changed"/);
    assert.match(agents, /retailStockForecast: "retail_stock_forecast"/);
    assert.match(agents, /retailStockPlanner/);
    assert.match(agents, /retail_stock_forecast_refresh:[\s\S]*agentKey: "retailStockPlanner"/);
    assert.match(agents, /send_retail_order_workflow_email:[\s\S]*agentKey: "emailDispatcher"/);
    assert.match(worker, /runtimeWorkerProfileForMode\(mode\)/);
    assert.match(workerProfiles, /"send_retail_order_workflow_email"/);
    assert.match(workerProfiles, /"stock", "retailStockPlanner"/);
    assert.match(workItems, /RetailStockForecastWorkItem/);
    assert.match(execution, /executeRetailAgentCommand/);
    assert.doesNotMatch(execution, /humanApprovalRequired: true/);
  });
});
