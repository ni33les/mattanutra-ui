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

    assert.match(schema, /currency text DEFAULT 'THB'::text NOT NULL/);
    assert.match(schema, /country_code text DEFAULT 'TH'::text NOT NULL/);
    assert.match(schema, /organisations_currency_check CHECK \(\(currency ~ '\^\[A-Z\]\{3\}\$'::text\)\)/);
    assert.match(schema, /organisations_country_code_check CHECK \(\(country_code ~ '\^\[A-Z\]\{2\}\$'::text\)\)/);
    assert.match(schema, /CREATE TABLE public\.retail_sellable_products/);
    assert.match(schema, /retail_sellable_products_org_product_key UNIQUE \(organisation_id, product_id\)/);
    assert.match(schema, /rrp_price_amount numeric\(20,6\)/);
    assert.match(schema, /CREATE TABLE public\.product_countries \((?:(?!\n\);)[\s\S])*rrp_price_amount numeric\(20,6\)/);
    assert.match(schema, /CREATE TABLE public\.product_countries \((?:(?!\n\);)[\s\S])*currency text DEFAULT 'THB'::text NOT NULL/);
    assert.match(schema, /product_countries_pricing_status_check/);
    assert.match(schema, /product_countries_rrp_price_check/);
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
    assert.match(migration, /create table if not exists public\.retail_sellable_products/);
    assert.match(migration, /drop constraint if exists retail_sellable_products_active_price_check/);
    assert.match(migration, /alter table public\.product_countries[\s\S]*add column if not exists rrp_price_amount/);
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
	    const shoppingListModal = readFileSync(
	      "components/admin/retail-shopping-list-modal.tsx",
	      "utf8"
	    );
	    const service = readFileSync("lib/admin-retail-stock.ts", "utf8");
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
      /retail_admin:\s*\[[\s\S]*"access\.agents\.read"[\s\S]*"communications\.read"[\s\S]*"communications\.write"[\s\S]*"settings\.read"[\s\S]*"stock\.read"[\s\S]*"stock\.write"[\s\S]*\]/
    );
    assert.match(rbac, /retail_assistant: \["settings\.read", "stock\.read"\]/);
    assert.match(page, /getAdminRetailStockData\(adminContext, locale\)/);
    assert.match(dashboard, /AdminRetailStockView/);
	    assert.match(
	      dashboardShared,
	      /items=\{labels\.retailSellingNavigation\}[\s\S]*items=\{labels\.retailInventoryNavigation\}[\s\S]*items=\{labels\.retailBuyingNavigation\}/
	    );
	    assert.match(view, /labels\.stock\.addProduct/);
	    assert.match(view, /ProductThumbnail/);
		    assert.doesNotMatch(view, /const panelSearchLabel = labels\.stock\.search/);
			    assert.doesNotMatch(view, /aria-label=\{panelSearchLabel\}/);
	    assert.match(view, /aria-label=\{labels\.stock\.search\}/);
	    assert.doesNotMatch(view, /\n\s*\{panelSearchLabel\}\s*\n\s*<input/);
	    assert.doesNotMatch(view, /\n\s*\{labels\.stock\.search\}\s*\n\s*<input/);
	    assert.doesNotMatch(view, /panel === "purchase-orders" \|\| panel === "receiving"/);
	    assert.match(view, /placeholder=\{labels\.stock\.search\}/);
	    assert.match(view, /customerOrderLinesByOrderId/);
	    assert.match(view, /function customerOrderRetailValue/);
	    assert.match(view, /order\.orderNumber/);
	    assert.match(view, /order\.customerName/);
	    assert.match(view, /labels\.stock\.retailValue/);
	    assert.match(view, /customerOrderRetailValueHeader/);
	    assert.match(view, /customerOrderRetailValue\(order\)/);
	    assert.match(view, /formatWholeAmount\(\s*locale,\s*customerOrderRetailValue\(order\)\s*\)/);
	    assert.match(view, /customerOrderRetailValue\(customerOrderDetail\)/);
	    assert.match(view, /printRetailOrderDocument/);
	    assert.match(view, /deliveryAddressForOrder\(customerOrderDetail\)/);
	    assert.match(view, /billingAddressForOrder\(customerOrderDetail\)/);
	    assert.match(view, /billingSameAsShipping\) \{\s*return null;\s*\}/);
	    assert.match(view, /labels\.stock\.downloadPdf/);
	    assert.match(view, /labels\.stock\.packingSheet/);
	    assert.match(view, /labels\.stock\.shippingLabel/);
	    assert.match(view, /labels\.stock\.invoice/);
	    assert.match(view, /labels\.stock\.deliveryDetails/);
	    assert.match(view, /function addressNoteLines/);
	    assert.match(view, /customerOrderDeliveryNoteLines\.map/);
	    assert.match(view, /customerOrderBillingNoteLines\.map/);
	    assert.match(view, /kind: "order-pack"/);
	    assert.match(view, /standardSheetHtml\(labels\.stock\.printOrder, true, true\)/);
	    assert.match(view, /standardSheetHtml\(labels\.stock\.packingSheet, false, false\)/);
	    assert.match(view, /shippingLabelSheetHtml\(\)/);
	    assert.match(view, /standardSheetHtml\(labels\.stock\.invoice, true, true\)/);
	    assert.match(view, /grid gap-x-3 gap-y-4 text-sm text-gray-600 sm:grid-cols-4/);
	    assert.match(view, /<FileDown aria-hidden="true"/);
	    assert.match(view, /<PackageCheck aria-hidden="true"/);
	    assert.match(view, /<Truck aria-hidden="true"/);
	    assert.match(view, /<ReceiptText aria-hidden="true"/);
	    assert.match(view, /title="Ship order"/);
	    assert.match(view, /openShipmentEditor\(customerOrderDetail\)/);
	    assert.match(view, /Products are packed and ready to hand to the courier\/customer\./);
	    assert.match(view, /confirmedPacked/);
	    assert.match(view, /carrierName/);
	    assert.match(view, /trackingNumber/);
	    assert.match(view, /trackingUrl/);
	    assert.match(view, /customerOrderStatusDisplay\(order\)/);
	    assert.doesNotMatch(
	      view,
	      /runCustomerOrderAction\(customerOrderDetail, "mark_picking"\)/
	    );
	    assert.doesNotMatch(
	      view,
	      /runCustomerOrderAction\(customerOrderDetail, "mark_packed"\)/
	    );
	    assert.doesNotMatch(view, /package-insert|packageInsert|FileText/);
	    assert.match(service, /function deliveryDetailsFromMetadata/);
	    assert.match(service, /shippingAddress = orderAddressFromMetadata\(metadata\.shippingAddress\)/);
	    assert.match(service, /billingAddress = billingSameAsShipping[\s\S]*orderAddressFromMetadata\(metadata\.billingAddress\)/);
	    assert.match(service, /deliveryDetails: deliveryDetailsFromMetadata\(row\.metadata\)/);
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
				    assert.match(shoppingListModal, /\{labels\.stock\.exportCsv\}/);
				    assert.match(view, /createShoppingListFromSelection/);
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
					    assert.match(route, /executeRetailCommand/);
				    assert.match(route, /reopenRetailShoppingList/);
				    assert.match(service, /export async function reopenRetailShoppingList/);
				    assert.match(service, /previousStatus === "active"[\s\S]*return list\.id/);
				    assert.match(service, /admin\.retail_shopping_list_reopened/);
				    assert.match(service, /Closed shopping lists cannot be edited/);
				    assert.match(shoppingListModal, /onReopen/);
				    assert.match(shoppingListModal, /list\.status === "closed"/);
				    assert.match(shoppingListModal, /onClick=\{onReopen\}[\s\S]*Reopen/);
				    assert.match(shoppingListModal, /onClick=\{\(\) => onSave\("closed"\)\}/);
				    assert.match(shoppingListModal, /onClick=\{\(\) => onSave\(\)\}/);
				    assert.doesNotMatch(shoppingListModal, /onSave\("active"\)/);
				    assert.match(packageJson, /"dev:live": "node scripts\/dev-live\.mjs"/);
				    assert.match(devLive, /await npmRun\("build:dev-fast"\)/);
				    assert.match(devLive, /start:platform/);
				    assert.match(devLive, /curl/);
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
	    assert.match(view, /function backorderPolicyClass/);
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
	    assert.match(view, /colSpan=\{showOrganisationContext \? 10 : 9\}/);
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
		    assert.match(view, /value=\{stockSearch\}/);
			    assert.doesNotMatch(view, /panel === "tasks" \? \([\s\S]*<BusinessStatsGrid[\s\S]*metrics=\{retailTaskMetrics\}/);
		    assert.doesNotMatch(view, /panel === "purchase-orders" \? \([\s\S]*<BusinessStatsGrid[\s\S]*metrics=\{purchaseOrderMetrics\}/);
	    assert.match(view, /selectedStockFilter/);
	    assert.match(view, /type CustomerOrderFilter = "all" \| RetailCustomerOrderStatus/);
	    assert.match(view, /selectedCustomerOrderFilter/);
	    assert.match(view, /customerOrderStatusFilters/);
	    assert.match(view, /customerOrderMetrics/);
	    assert.match(view, /order\.status !== "shipped"/);
	    assert.match(view, /metrics=\{customerOrderMetrics\}/);
	    assert.match(view, /current === metricId \? "all" : \(metricId as CustomerOrderFilter\)/);
	    assert.match(view, /type RetailStockAvailabilityStatus/);
	    assert.match(view, /function stockAvailabilityStatus/);
	    assert.match(view, /daysCover <= leadTimeDays \+ 1/);
	    assert.match(view, /daysCover === null && row\.stockQuantity < 3/);
		    assert.match(view, /row\.status !== "active"/);
		    assert.match(view, /id: "all"[\s\S]*label: labels\.stock\.all/);
		    assert.match(view, /value: formatNumber\(organisationStockRows\.length, locale\)/);
		    assert.match(view, /labels\.stock\.inStock/);
		    assert.match(view, /labels\.stock\.lowStock/);
	    assert.doesNotMatch(view, /id: "active"[\s\S]*label: labels\.access\.active/);
	    assert.doesNotMatch(view, /id: "disabled"[\s\S]*label: labels\.stock\.disabled/);
	    assert.match(view, /current === metricId \? "all" : \(metricId as RetailStockFilter\)/);
		    assert.match(content, /inStock: "In stock"/);
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
	    assert.match(view, /order\.workflowTimeline\.orderedAt/);
	    assert.match(view, /labels\.stock\.awaitingStock/);
	    assert.match(view, /label: "Ready to pack"/);
	    assert.match(view, /label: "Ready to ship"/);
	    assert.match(view, /order\.workflowTimeline\.boxedAt \?\? order\.workflowTimeline\.allocatedAt/);
	    assert.match(view, /grid gap-3 md:grid-cols-5/);
	    assert.doesNotMatch(view, /labels\.stock\.boxed/);
	    assert.match(view, /labels\.stock\.sent/);
	    assert.match(view, /grid shrink-0 grid-cols-2 gap-8 text-right sm:gap-10/);
	    assert.match(view, /\{labels\.stock\.quantity\}[\s\S]*\{line\.quantityOrdered\}[\s\S]*\{customerOrderDetail\.currency\}[\s\S]*formatWholeAmount/);
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
				    assert.match(view, /line\.actualQuantity - line\.stockedQuantity/);
				    assert.match(view, /returnedDemandByOrgProduct/);
				    assert.match(view, /line\.assignedQuantity - line\.actualQuantity/);
				    assert.match(view, /returnedDemandByOrgProduct\.get\(key\) \?\? 0/);
				    assert.doesNotMatch(
				      view,
				      /Math\.min\(\s*line\.assignedQuantity,\s*line\.actualQuantity/
				    );
				    assert.match(view, /selectedOutstandingPurchaseKeys/);
				    assert.match(view, /defaultOutstandingPurchaseKeys/);
				    assert.match(view, /outstandingPurchaseSelectionKeys/);
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
				    assert.doesNotMatch(view, /labels\.stock\.purchasePlan/);
				    assert.match(view, /Unassigned order demand for the selected retailer/);
				    assert.match(view, /Shopping Lists/);
				    assert.match(view, /Backorder demand/);
				    assert.match(view, /Assigned to active lists/);
				    assert.match(shoppingListModal, /Actual bought quantity/);
						    assert.doesNotMatch(view, /groupedShoppingListDraftLines/);
						    assert.doesNotMatch(view, /<Fragment/);
						    assert.match(shoppingListModal, /\bSave\b/);
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
	    assert.match(service, /export type AdminRetailStockPipelineRow/);
	    assert.match(service, /export async function getRetailStockPipeline/);
		    assert.match(service, /customerDemandUnits[\s\S]*allocatedUnits[\s\S]*availableNowUnits[\s\S]*unorderedNeedUnits/);
		    assert.doesNotMatch(service, /export async function buildPurchaseOrderDraftFromBackorderTask/);
		    assert.doesNotMatch(service, /retail_purchase_order_place_order/);
	    assert.match(service, /No live stock is available to allocate/);
	    assert.match(service, /export type AdminRetailCustomerOrderActionStates/);
	    assert.match(service, /export function getRetailCustomerOrderActionStates/);
	    assert.match(service, /export async function ensureOrderWorkflowTask/);
	    assert.match(service, /admin\.retail_order_workflow_task_repaired/);
	    assert.match(service, /retail_order_task_repaired/);
	    assert.doesNotMatch(service, /Missing open \$\{nextExpectedTaskType\} task for \$\{workflowStage\}/);
	    assert.doesNotMatch(service, /Build a draft purchase order before completing this task/);
		    assert.doesNotMatch(service, /select distinct\s+retail_customer_orders\.id::text[\s\S]*retail_customer_orders\.due_at/);
			    assert.match(service, /where organisation_id = \$\{list\.organisation_id\}::uuid[\s\S]*status in \('placed', 'awaiting_stock'\)[\s\S]*allocateRetailCustomerOrder\(context/);
			    assert.match(service, /releaseRetailStockOverAllocationsAfterStockCount/);
			    assert.match(service, /shopping_list_stock_count_reduced/);
			    assert.match(service, /status = 'cancelled'/);
			    assert.match(service, /quantity_allocated = greatest\(0, quantity_allocated - \$\{releaseUnits\}\)/);
			    assert.match(service, /set status = 'awaiting_stock'/);
			    assert.match(service, /admin\.retail_stock_allocations_released/);
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
						    assert.match(content, /reorderBackorders: "Backorders"/);
						    assert.match(content, /reorderBackordersDescription:\s*"These items are required to cover active customer orders\."/);
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
    assert.match(service, /products[\s\S]*status = 'approved'/);
    assert.match(service, /lower\(coalesce\(products\.normalized_brand_name, products\.brand_name, ''\)\) in \('dhc', 'dmc'\)/);
    assert.match(service, /coalesce\(products\.source_url, ''\) ilike '%dhc\.co\.jp%'/);
    assert.match(service, /retail_sellable_products/);
    assert.match(service, /getRetailCartLineAvailability/);
    assert.match(service, /resolveUsdRateForCurrency/);
    assert.match(service, /pricingSnapshot/);
    assert.match(service, /fulfillmentPromise/);
    assert.match(service, /Master List country RRP is required before checkout/);
    assert.doesNotMatch(service, /taskType: "retail_purchase_order_review"/);
	    assert.doesNotMatch(service, /tasks\.task_type <> 'retail_purchase_order_review'/);
    assert.match(service, /claimedByDisplayName/);
    assert.match(service, /claimed_people\.display_name/);
    assert.doesNotMatch(service, /completedReviewTaskIds/);
    assert.doesNotMatch(service, /completedByAction: "mark_purchase_order_ordered"/);
    assert.doesNotMatch(service, /Task must be claimed before it can be completed/);
	    assert.doesNotMatch(service, /voidRetailPurchaseOrder/);
	    assert.doesNotMatch(service, /admin\.retail_purchase_order_voided/);
    assert.match(service, /awaiting_stock/);
    assert.match(service, /currency = excluded\.currency/);
    assert.match(service, /status <> 'deleted'/);
    assert.match(service, /recordAdminAudit/);
    assert.match(service, /AdminRetailAuditEvent/);
    assert.match(service, /admin_audit_events/);
    assert.match(service, /task_events/);
    assert.match(service, /auditEvents/);
    assert.match(service, /admin\.stock_created/);
    assert.match(service, /admin\.stock_updated/);
    assert.match(service, /admin\.stock_status_updated/);
    assert.match(service, /recordRetailStockSnapshot/);
    assert.match(service, /retail_product_stock_snapshots/);
    assert.doesNotMatch(service, /retail_product_stock\.expires_at/);
    assert.doesNotMatch(service, /sourceEntityType: "retail_product_stock"[\s\S]*retail_stock_expiry_review/);
	    assert.match(service, /case when tasks\.status in \('completed', 'cancelled', 'skipped'\) then 1 else 0 end/);
	    assert.match(service, /priorityReason: "Refresh stock forecast after stock changed\."[\s\S]*taskType: "retail_stock_forecast_refresh"/);
	    assert.doesNotMatch(service, /tasks\.task_type <> 'retail_stock_forecast_refresh'/);
	    assert.match(service, /tasks\.actor_type/);
	    assert.match(service, /reserved_agents\.name as agent_name/);
	    assert.match(service, /isAgentTask/);
	    assert.match(service, /recordRetailStockMovement/);
		    assert.doesNotMatch(service, /export type RetailPurchaseOrderShortfallResolution/);
		    assert.doesNotMatch(service, /export async function reconcileRetailPurchaseOrderLineShortfall/);
		    assert.doesNotMatch(service, /export async function markRetailPurchaseOrderLineMissing/);
		    assert.doesNotMatch(service, /admin\.retail_purchase_order_shortfall_reconciled/);
		    assert.doesNotMatch(service, /retail_purchase_order_shortfall_reconciled/);
		    assert.doesNotMatch(service, /retail_purchase_order_shortfall_reopened_demand/);
			    assert.doesNotMatch(service, /reconcileRetailerShoppingListShortages/);
			    assert.match(service, /ensureRetailOrderShortagesOnShoppingList/);
			    assert.match(service, /admin\.retail_shopping_list_shortages_reconciled/);
			    assert.match(service, /expectedTaskType === "retail_shopping_list_review"[\s\S]*ensureRetailOrderShortagesOnShoppingList/);
			    assert.match(service, /shoppingListAddedUnits/);
			    assert.match(service, /shopping_list_receiving/);
	    assert.match(service, /voidRetailStockMovement/);
    assert.match(service, /refreshRetailStockReorderAdvice/);
    assert.match(service, /retail_stock_reorder_advice\.risk_level <> 'ok'/);
    assert.match(service, /retail_stock_reorder_advice\.suggested_order_quantity > 0/);
    assert.match(service, /queueRetailStockIntelligenceRefresh/);
    assert.match(service, /retail_stock_movements/);
    assert.match(service, /retail_stock_lots/);
    assert.match(service, /retail_stock_reorder_advice/);
	    assert.doesNotMatch(service, /createRetailPurchaseOrder/);
	    assert.match(service, /createRetailCustomerOrder/);
	    assert.match(service, /if \(value === null \|\| value === undefined \|\| value === ""\)/);
	    assert.match(service, /resolveRegionalBasketAvailability/);
    assert.match(service, /regionalRouting/);
	    assert.match(service, /selectedRetailerOrganisationId/);
	    assert.match(service, /shippingCountry/);
	    assert.match(service, /completeOrderWorkflowTask/);
	    assert.match(service, /assertOrderWorkflowTaskClaimable/);
	    assert.match(service, /reconcileRetailOrderLifecycle/);
	    assert.match(service, /admin\.retail_order_lifecycle_reconciled/);
	    assert.match(service, /AdminRetailCustomerOrderWorkflowTimeline/);
	    assert.match(service, /customerOrderWorkflowTimeline/);
	    assert.match(service, /workflowTimeline: customerOrderWorkflowTimeline/);
	    assert.match(service, /workflowEventStatus/);
	    assert.match(service, /transitionRetailCustomerOrder/);
	    assert.match(service, /recordRetailOrderWorkflowBpm/);
	    assert.match(service, /sendRetailOrderWorkflowEmail/);
	    assert.match(workflowService, /queueRetailOrderWorkflowEmail/);
	    assert.match(workflowService, /send_retail_order_workflow_email/);
	    assert.match(workflowService, /RETAIL_ORDER_EMAIL_TASK_PRIORITY = 220/);
	    assert.match(service, /workflowTaskTypeForAction/);
	    assert.match(service, /retailOrderWorkflowTaskDetails/);
	    assert.match(service, /status === "shipped"[\s\S]*return "deliver"/);
	    assert.match(service, /taskType: "retail_order_ship"/);
	    assert.match(service, /taskType: actionTaskType/);
	    assert.match(service, /retail_order_delivery_confirm/);
	    assert.match(service, /retail_order_cancel_review/);
	    assert.match(service, /retail_order_return_review/);
	    assert.match(service, /title: "Ship customer order"/);
	    assert.match(service, /title: "Confirm customer delivery"/);
	    assert.match(service, /title: "Review customer order cancellation"/);
	    assert.match(service, /title: "Review customer order return"/);
	    assert.match(service, /source: "one_click_ship"/);
	    assert.match(service, /shipmentMetadata/);
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
    assert.match(basketRoute, /normalizeProductCountryCode/);
    assert.match(basketRoute, /Cache-Control/);
    assert.match(cartService, /export type RetailRoutingPreference = "cheapest_price" \| "fastest_delivery"/);
    assert.match(cartService, /export type RegionalBasketAvailability/);
    assert.match(cartService, /selectedRetailerOrganisationId/);
    assert.match(cartService, /organisations\.country_code = \$\{shippingCountry\}/);
    assert.doesNotMatch(cartService, /products\.region = \$\{shippingCountry\}/);
    assert.match(service, /queueRetailOperationTask/);
	    assert.doesNotMatch(service, /admin\.retail_purchase_order_created/);
    assert.match(service, /admin\.retail_customer_order_created/);
    assert.match(service, /admin\.stock_movement_recorded/);
    assert.match(service, /admin\.stock_movement_voided/);
    assert.match(service, /"status_changed"/);
    assert.match(agents, /retailStockForecast: "retail_stock_forecast"/);
    assert.match(agents, /retailStockPlanner/);
    assert.match(agents, /retail_stock_forecast_refresh: "retailStockPlanner"/);
    assert.match(agents, /send_retail_order_workflow_email: "emailDispatcher"/);
    assert.match(worker, /"send_retail_order_workflow_email"/);
    assert.match(worker, /stock: agentProfile\("retailStockPlanner"/);
    assert.match(workItems, /RetailStockForecastWorkItem/);
    assert.match(execution, /executeRetailAgentCommand/);
    assert.doesNotMatch(execution, /humanApprovalRequired: true/);
  });
});
