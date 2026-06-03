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
    assert.match(schema, /CREATE TABLE public\.retail_purchase_orders/);
    assert.match(schema, /CREATE TABLE public\.retail_purchase_order_lines/);
    assert.match(schema, /'closed'::text/);
    assert.match(schema, /quantity_cancelled integer DEFAULT 0 NOT NULL/);
    assert.match(schema, /quantity_received \+ quantity_cancelled\) <= quantity_ordered/);
    assert.match(schema, /CREATE TABLE public\.retail_purchase_order_line_shortfalls/);
    assert.match(schema, /retail_purchase_order_line_shortfalls_resolution_check/);
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
    assert.match(migration, /create table if not exists public\.retail_purchase_orders/);
    assert.match(migration, /add column if not exists quantity_cancelled/);
    assert.match(migration, /quantity_received \+ quantity_cancelled <= quantity_ordered/);
    assert.match(migration, /create table if not exists public\.retail_purchase_order_line_shortfalls/);
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
    const service = readFileSync("lib/admin-retail-stock.ts", "utf8");
    const route = readFileSync("app/api/admin/retail-stock/route.ts", "utf8");
    const basketRoute = readFileSync("app/api/retail/basket/availability/route.ts", "utf8");
    const cartService = readFileSync("lib/retail-cart-availability.ts", "utf8");
    const agents = readFileSync("lib/system-agents.ts", "utf8");
    const worker = readFileSync("workers/runner.ts", "utf8");
    const workItems = readFileSync("lib/task-work-items.ts", "utf8");
    const execution = readFileSync("lib/task-execution.ts", "utf8");
    const settingsView = readFileSync("components/admin/settings-view.tsx", "utf8");
    const currencies = readFileSync("lib/currencies.ts", "utf8");

    assert.match(rbac, /"stock\.read"/);
    assert.match(rbac, /"stock\.write"/);
    assert.match(rbac, /retail_admin: \["access\.agents\.read", "settings\.read", "stock\.read", "stock\.write"\]/);
    assert.match(rbac, /retail_assistant: \["settings\.read", "stock\.read"\]/);
    assert.match(page, /getAdminRetailStockData\(adminContext, locale\)/);
    assert.match(dashboard, /AdminRetailStockView/);
    assert.match(view, /labels\.stock\.addProduct/);
    assert.match(view, /ProductThumbnail/);
	    assert.match(view, /const panelSearchLabel = labels\.stock\.search/);
	    assert.match(view, /aria-label=\{panelSearchLabel\}/);
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
	    assert.doesNotMatch(view, /labels\.stock\.searchProducts/);
	    assert.doesNotMatch(view, /labels\.stock\.searchOrders/);
	    assert.doesNotMatch(view, /labels\.stock\.searchStock/);
    assert.match(view, /type PurchaseOrderLineDraft/);
    assert.match(view, /purchaseOrderProductOptions/);
    assert.match(view, /addPurchaseOrderLine/);
    assert.match(view, /removePurchaseOrderLine/);
    assert.match(view, /purchaseOrderDraft\.lines\.map/);
		    assert.match(view, /AdminIconButton/);
		    assert.match(view, /<Download aria-hidden=\{true\} className="size-4" \/>/);
		    assert.match(view, /aria-label=\{labels\.stock\.exportCsv\}/);
		    assert.match(view, /createShoppingListFromSelection/);
		    assert.match(view, /applyShoppingListDraft/);
		    assert.match(view, /downloadShoppingListCsv/);
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
	    assert.match(view, /downloadStockCsv/);
	    assert.match(view, /const showStockCsvExport = panel === "list"/);
	    assert.match(view, /\{showStockCsvExport \? \(/);
	    assert.match(view, /const showOrganisationContext = data\.canFilterOrganisation/);
	    assert.match(view, /downloadStockCsv\(rows, labels, showOrganisationContext\)/);
	    assert.match(view, /includeOrganisation[\s\S]*labels\.stock\.organisation/);
	    assert.match(view, /showOrganisationContext \? \([\s\S]*labels\.stock\.organisation/);
	    assert.match(view, /colSpan=\{showOrganisationContext \? 10 : 9\}/);
		    assert.match(view, /colSpan=\{showOrganisationContext \? 6 : 5\}/);
		    assert.doesNotMatch(content, /Wholesale\s+price/);
		    assert.match(content, /wholesalePrice: "Wholesale"/);
	    assert.match(content, /retailPrice: "Retail"/);
	    assert.match(view, /stockMetrics/);
	    assert.doesNotMatch(view, /stockPipelineSummary/);
	    assert.doesNotMatch(view, /PipelineStrip/);
	    assert.match(view, /panel === "list" \? \([\s\S]*<BusinessStatsGrid[\s\S]*metrics=\{stockMetrics\}/);
	    assert.match(view, /panel === "tasks" \? \([\s\S]*<BusinessStatsGrid[\s\S]*metrics=\{retailTaskMetrics\}/);
	    assert.match(view, /panel === "purchase-orders" \? \([\s\S]*<BusinessStatsGrid[\s\S]*metrics=\{purchaseOrderMetrics\}/);
	    assert.match(view, /selectedStockFilter/);
	    assert.match(view, /type RetailStockAvailabilityStatus/);
	    assert.match(view, /function stockAvailabilityStatus/);
	    assert.match(view, /daysCover <= leadTimeDays \+ 1/);
	    assert.match(view, /daysCover === null && row\.stockQuantity < 3/);
	    assert.match(view, /row\.status !== "active"/);
	    assert.match(view, /labels\.stock\.inStock/);
	    assert.match(view, /labels\.stock\.lowStock/);
	    assert.doesNotMatch(view, /id: "active"[\s\S]*label: labels\.access\.active/);
	    assert.doesNotMatch(view, /id: "disabled"[\s\S]*label: labels\.stock\.disabled/);
	    assert.match(view, /current === metricId \? "all" : \(metricId as RetailStockFilter\)/);
	    assert.match(content, /inStock: "In stock"/);
	    assert.match(content, /lowStock: "Low stock"/);
		    assert.match(view, /retailTaskMetrics/);
		    assert.doesNotMatch(view, /taskSummary\.total/);
	    assert.match(view, /all: organisationTaskRows\.filter\(\(task\) => task\.status !== "completed"\)\.length/);
	    assert.match(content, /agentTasks: "Agent tasks"/);
	    assert.match(view, /id: "all"/);
	    assert.match(view, /id: "unclaimed"/);
	    assert.match(view, /id: "claimed"/);
	    assert.match(view, /id: "processing"/);
	    assert.match(view, /id: "completed"/);
	    assert.match(view, /label: labels\.visibility\.total/);
	    assert.match(view, /label: labels\.stock\.unclaimed/);
	    assert.match(view, /label: labels\.stock\.claimedBy/);
	    assert.match(view, /label: labels\.visibility\.active/);
	    assert.match(view, /label: labels\.stock\.completeTask/);
	    assert.doesNotMatch(view, /id: "agent"/);
	    assert.match(view, /selectedTaskFilter/);
	    assert.match(view, /selectedTaskFilter === "unclaimed"/);
	    assert.match(view, /selectedTaskFilter === "claimed"/);
	    assert.match(view, /selectedTaskFilter === "processing"/);
	    assert.match(view, /selectedTaskFilter === "completed"/);
	    assert.match(view, /return task\.status !== "completed"/);
	    assert.match(view, /task\.isAgentTask/);
	    assert.match(view, /task\.agentName \?\? labels\.visibility\.agent/);
	    assert.match(view, /Number\(left\.isAgentTask\) - Number\(right\.isAgentTask\)/);
	    assert.match(view, /supportedOrganisationCurrencies/);
	    assert.match(currencies, /supportedOrganisationCurrencies/);
	    assert.match(settingsView, /supportedOrganisationCurrencies/);
	    assert.match(settingsView, /const canEditCurrency/);
	    assert.match(settingsView, /session\.actorMembership\.role === "platform_owner"/);
	    assert.match(settingsView, /session\.actorMembership\.role === "platform_admin"/);
	    assert.match(settingsView, /disabled=\{!canEditCurrency \|\| busy\}/);
    assert.match(view, /taskStatusClass\(task\.status\)/);
    assert.match(view, /taskValueClass\(task\.priorityScore\)/);
    assert.match(view, /taskValueLabel\(task\.priorityScore, locale\)/);
    assert.match(view, /task\.priorityReason \?\? labels\.stock\.notSet/);
    assert.doesNotMatch(view, /fxAttribution|exchangerate-api\.com/);
    assert.doesNotMatch(view, /expiresAt: draft\.expiresAt/);
    assert.doesNotMatch(view, /row\.expiresAt/);
    assert.doesNotMatch(view, /editor\.draft\.expiresAt/);
    assert.match(view, /panelFromView/);
    assert.match(view, /view === "retail-task-queue"/);
    assert.match(view, /view === "retail-audit"/);
    assert.match(view, /panel === "audit"/);
    assert.match(view, /auditRows/);
    assert.match(view, /auditDetailText/);
	    assert.match(view, /labels\.stock\.event/);
	    assert.match(view, /labels\.stock\.claimedBy/);
	    assert.match(view, /formatDateTime\(task\.claimedAt, locale\)/);
	    assert.match(view, /function openCustomerOrderDraft/);
	    assert.match(view, /function updateCustomerOrderOrganisation/);
	    assert.match(view, /function addCustomerOrderLine/);
	    assert.match(view, /function updateCustomerOrderLine/);
	    assert.match(view, /function removeCustomerOrderLine/);
	    assert.match(view, /customerOrderAvailability/);
	    assert.match(view, /\/api\/retail\/basket\/availability/);
	    assert.match(view, /const customerOrderProductOptions = useMemo/);
	    assert.match(view, /organisationId: selectedRetailerOrganisationId/);
	    assert.match(view, /Boolean\(customerOrderDraft\?\.lines\.length\)/);
	    assert.match(view, /const mode: CustomerOrderMode = data\.canRouteRegionalCheckout/);
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
	    assert.match(view, /const showCustomerOrderWorkbench =/);
	    assert.match(view, /showCustomerOrderWorkbench\s*\?\s*"space-y-5"/);
	    assert.match(view, /!\s*showCustomerOrderWorkbench \? \(/);
	    assert.match(view, /labels\.stock\.backToCustomerOrders/);
	    assert.match(view, /labels\.stock\.allocatedTo/);
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
	    assert.match(view, /labels\.stock\.buildDraftPo/);
	    assert.match(view, /labels\.stock\.shortfallHandling/);
	    assert.match(view, /labels\.stock\.noSupplierShortfall/);
	    assert.match(view, /labels\.stock\.ordered\}: \{line\.remaining\} \//);
	    assert.match(view, /labels\.stock\.receivedNow\}: \{receivedNow\} \//);
	    assert.match(view, /labels\.stock\.shortfall\}: \{shortfallAfterReceive\}/);
	    assert.doesNotMatch(view, /sm:col-span-3[\s\S]*labels\.stock\.ordered/);
	    assert.match(view, /value=\{[\s\S]*hasSupplierShortfall[\s\S]*"no_shortfall"/);
	    assert.match(view, /disabled=\{Boolean\(busyId\) \|\| !hasSupplierShortfall\}/);
	    assert.doesNotMatch(view, /shortfallAfterReceive > 0 \? \(/);
	    assert.doesNotMatch(view, /shortfallResolutionLabel\(labels, line\.shortfallResolution\)/);
	    assert.doesNotMatch(view, /rounded-md bg-emerald-50[\s\S]*labels\.stock\.noSupplierShortfall/);
	    assert.match(view, /shortfallResolutionLabel/);
	    assert.match(view, /taskCanBuildDraftPo\(taskDetail\)/);
	    assert.match(view, /build_purchase_order_from_backorder_task/);
	    assert.match(view, /customerOrderCanAllocate/);
	    assert.match(view, /actionStates\.allocateAvailable\.enabled/);
	    assert.match(view, /disabled=\{Boolean\(busyId\) \|\| !customerOrderCanAllocate\}/);
	    assert.doesNotMatch(view, /line\.pipeline\?\.availableNowUnits \?\? line\.quantityAvailableNow/);
	    assert.doesNotMatch(view, /openCustomerOrderDetail/);
	    assert.match(view, /customerOrderDetail\.routingSnapshot\?\.unavailableLines\.length[\s\S]*customerOrderDetail\.workflowHealth\.reason[\s\S]*orderItems/);
	    assert.match(content, /dueAt: "Due date"/);
		    assert.match(view, /openPurchaseOrderDetail/);
		    assert.match(view, /aria-label=\{`\$\{labels\.stock\.purchaseOrderDetails\}: \$\{order\.poNumber\}`\}/);
		    assert.match(view, /onClick=\{\(\) => openPurchaseOrderDetail\(order\.id\)\}/);
		    assert.match(view, /openPurchaseOrderDetail\(order\.id\);/);
		    assert.match(view, /openTaskDetail/);
	    assert.match(view, /labels\.stock\.taskDetails/);
		    assert.match(view, /labels\.stock\.purchaseOrderDetails/);
		    assert.match(view, /purchaseOrderStatusLabel\(labels, order\.status\)/);
		    assert.match(view, /purchaseOrderStatusLabel\(labels, purchaseOrderDetail\.status\)/);
	    assert.match(view, /selectedPurchaseOrderFilter, setSelectedPurchaseOrderFilter\][\s\S]*useState<RetailPurchaseOrderFilter>\("all"\)/);
	    assert.match(view, /searchedPurchaseOrderRows/);
			    assert.match(view, /purchaseOrderStatusSummary/);
			    assert.match(view, /summary\.all \+= 1/);
			    assert.match(view, /order\.status !== "cancelled" && order\.status !== "closed"/);
			    assert.match(view, /purchaseOrderMetrics/);
			    assert.match(view, /labels\.stock\.purchaseOrderStatusAll/);
			    assert.match(view, /outstandingPurchaseItems/);
			    assert.match(view, /restockingAdviceItems/);
			    assert.match(view, /reorderPurchaseItems/);
			    assert.match(view, /reorderKind: "required"/);
			    assert.match(view, /reorderKind: "advisory"/);
			    assert.match(view, /pipeline\.unorderedNeedUnits <= 0/);
			    assert.match(view, /Math\.max\(item\.unorderedNeedUnits, item\.suggestedOrderQuantity\)/);
			    assert.match(view, /selectedOutstandingPurchaseKeys/);
			    assert.match(view, /defaultOutstandingPurchaseKeys/);
			    assert.match(view, /outstandingPurchaseSelectionKeys/);
			    assert.match(view, /function toggleOutstandingPurchaseItem/);
			    assert.match(view, /function openSelectedOutstandingPurchaseOrderDraft/);
			    assert.match(view, /function openBlankPurchaseOrderDraft/);
			    assert.match(view, /panel === "reorder" && data\.canWrite && reorderPurchaseItems\.length > 0/);
			    assert.match(view, /startsNewGroup && "mt-5"/);
			    assert.match(view, /<div className="mb-5">[\s\S]*labels\.stock\.reorderAdvise/);
			    assert.match(view, /bg-red-50\/35 ring-red-100 hover:bg-red-50\/60/);
			    assert.match(view, /bg-sky-50\/35 ring-sky-100 hover:bg-sky-50\/60/);
			    assert.doesNotMatch(view, /panel === "purchase-orders" && outstandingPurchaseItems\.length > 0/);
			    assert.match(view, /type="checkbox"/);
			    assert.match(view, /labels\.stock\.createPo/);
			    assert.doesNotMatch(view, /labels\.stock\.purchasePlan/);
			    assert.match(view, /labels\.stock\.reorderBackordersDescription/);
			    assert.match(view, /labels\.stock\.reorderAdvise/);
			    assert.match(view, /labels\.stock\.reorderAdviseDescription/);
			    assert.match(view, /labels\.stock\.quantity/);
			    assert.doesNotMatch(view, /const quantityLabel/);
			    assert.doesNotMatch(view, /grid shrink-0 grid-cols-2 gap-4 text-right/);
			    assert.match(view, /labels\.stock\.recommendedOrder/);
			    assert.match(view, /labels\.stock\.reorderRequired/);
			    assert.match(view, /labels\.stock\.reorderAdvisory/);
		    assert.match(view, /panel === "purchase-orders" \? \([\s\S]*openBlankPurchaseOrderDraft/);
		    assert.doesNotMatch(view, /openPurchaseOrderDraft\(item\.organisationId\)/);
	    assert.match(view, /selectedMetricId=\{selectedPurchaseOrderFilter\}/);
	    assert.match(view, /setSelectedPurchaseOrderFilter/);
		    assert.match(view, /\["claim", "complete", "snooze"\] as const/);
		    assert.doesNotMatch(view, /purchaseOrderReviewTask/);
		    assert.match(view, /if \(saved && taskAction === "claim"\)/);
		    assert.match(view, /setTaskDetailId\(""\);[\s\S]*setPurchaseOrderDetailId\(""\);/);
		    assert.match(view, /disabled=\{Boolean\(busyId\)\}[\s\S]*markPurchaseOrderOrdered\(purchaseOrderDetail\.id\)/);
		    assert.match(view, /taskAction === "complete" && !taskIsClaimed\(taskDetail\)/);
    assert.doesNotMatch(view, /labels\.stock\.profitImpact/);
    assert.doesNotMatch(view, /"escalate"/);
		    assert.match(view, /create_purchase_order/);
		    assert.match(view, /create_customer_order/);
		    assert.match(view, /receive_purchase_order_line/);
	    assert.match(route, /mark_purchase_order_line_missing/);
	    assert.doesNotMatch(view, /labels\.stock\.markMissing/);
	    assert.doesNotMatch(view, /Mark missing/);
		    assert.match(view, /receiveLineRemaining\(line\) > 0/);
		    assert.match(view, /function validReceiveQuantity/);
		    assert.match(view, /Number\.isInteger\(quantity\)/);
			    assert.match(view, /quantity <= line\.remaining/);
			    assert.match(view, /setReceiveEditor\(null\);[\s\S]*action: "receive_purchase_order_lines"/);
			    assert.doesNotMatch(view, /receiveEditor\.expiresAt/);
		    assert.match(route, /action === "receive_purchase_order_lines"[\s\S]*reconcileRetailPurchaseOrderLineShortfall/);
		    assert.match(route, /quantityReceived/);
		    assert.match(route, /shortfallResolution/);
		    assert.match(route, /action === "receive_purchase_order_line"[\s\S]*expiresAt: null/);
		    assert.match(route, /action === "mark_purchase_order_line_missing"/);
	    assert.match(route, /action === "build_purchase_order_from_backorder_task"/);
	    assert.match(service, /export type AdminRetailStockPipelineRow/);
	    assert.match(service, /export async function getRetailStockPipeline/);
	    assert.match(service, /customerDemandUnits[\s\S]*allocatedUnits[\s\S]*availableNowUnits[\s\S]*incomingUnits[\s\S]*draftPoUnits[\s\S]*unorderedNeedUnits/);
	    assert.match(service, /export async function buildPurchaseOrderDraftFromBackorderTask/);
	    assert.match(service, /retail_purchase_order_place_order/);
	    assert.match(service, /No live stock is available to allocate/);
	    assert.match(service, /export type AdminRetailCustomerOrderActionStates/);
	    assert.match(service, /export function getRetailCustomerOrderActionStates/);
	    assert.match(service, /export async function ensureOrderWorkflowTask/);
	    assert.match(service, /admin\.retail_order_workflow_task_repaired/);
	    assert.match(service, /retail_order_task_repaired/);
	    assert.doesNotMatch(service, /Missing open \$\{nextExpectedTaskType\} task for \$\{workflowStage\}/);
	    assert.match(service, /Build a draft purchase order before completing this task/);
		    assert.doesNotMatch(service, /select distinct\s+retail_customer_orders\.id::text[\s\S]*retail_customer_orders\.due_at/);
		    assert.match(service, /exists \(\s*select 1[\s\S]*retail_customer_order_lines\.customer_order_id = retail_customer_orders\.id[\s\S]*retail_customer_order_lines\.product_id = \$\{line\.product_id\}::uuid/);
				    assert.match(view, /labels\.stock\.receiveAll/);
			    assert.doesNotMatch(view, /labels\.stock\.receiveQuantityError/);
		    assert.match(view, /openReceiveEditor\(order, lines\)/);
		    assert.match(view, /updateReceiveLineDraft\(line\.lineId/);
		    assert.match(view, /receiveLineRemaining\(line\)/);
			    assert.match(view, /receiveQuantity: String\(remaining\)/);
		    assert.match(view, /receiveQuantity: String\(line\.remaining\)/);
		    assert.match(view, /variant="primary"[\s\S]*\{labels\.stock\.receiveAll\}/);
		    assert.match(view, /onClick=\{\(\) => saveReceiving\(\)\}/);
		    assert.match(view, /const receivingGroups = useMemo/);
	    assert.match(view, /linesByPurchaseOrderId/);
			    assert.match(content, /search: "Search"/);
			    assert.match(content, /search: "ค้นหา"/);
			    assert.match(content, /capital: "Capital"/);
			    assert.match(content, /units: "Units"/);
				    assert.match(content, /retailValue: "Retail value"/);
				    assert.match(content, /customerOrderSaveError: "Could not save customer order\."/);
				    assert.match(content, /addPurchaseOrder: "New Purchase Order"/);
					    assert.match(content, /createPo: "Create PO"/);
					    assert.doesNotMatch(content, /purchasePlan: "Purchase plan"/);
					    assert.match(content, /unorderedNeedDescription:/);
					    assert.match(content, /recommendedOrder: "Recommended order"/);
					    assert.match(content, /reorderBackorders: "Backorders"/);
					    assert.match(content, /reorderBackordersDescription:\s*"These items are required to cover active customer orders\."/);
					    assert.match(content, /reorderAdvise: "Advise"/);
					    assert.match(content, /reorderAdviseDescription:\s*"We suggest you order these items to satisfy future demand"/);
					    assert.match(content, /reorderRequired: "Required"/);
					    assert.match(content, /reorderAdvisory: "Advisory"/);
			    assert.match(content, /purchaseOrderDetails: "Purchase order details"/);
			    assert.match(content, /purchaseOrderStatusAll: "All"/);
			    assert.match(content, /purchaseOrderStatusPartial: "Partial"/);
			    assert.match(content, /purchaseOrderStatusClosed: "Closed"/);
		    assert.match(content, /voidPurchaseOrder: "Void purchase order"/);
		    assert.match(content, /receiveAll: "All"/);
	    assert.doesNotMatch(content, /Enter a whole quantity between 0 and the remaining amount/);
	    assert.match(content, /supplierBackorder: "Supplier backorder"/);
	    assert.match(content, /closedShort: "Closed short"/);
	    assert.match(content, /noSupplierShortfall: "No shortfall"/);
	    assert.match(content, /noOrders: "No orders"/);
	    assert.match(view, /purchaseOrderRows\.length === 0[\s\S]*labels\.stock\.noOrders/);
	    assert.match(view, /customerOrderRows\.length === 0[\s\S]*labels\.stock\.noOrders/);
	    assert.match(content, /ordered: "Ordered"/);
	    assert.match(content, /receivedNow: "Received"/);
	    assert.match(view, /labels\.stock\.supplier/);
	    assert.match(view, /order\.supplierName/);
	    assert.match(view, /update_retail_task/);
    assert.match(view, /record_stock_movement/);
    assert.match(view, /void_stock_movement/);
    assert.match(view, /setEditor/);
    assert.match(view, /<AdminModal/);
    assert.match(view, /role="button"/);
    assert.match(view, /<option key=\{status\} value=\{status\}>/);
    assert.doesNotMatch(view, /function saveRow/);
    assert.doesNotMatch(view, /const \[drafts/);
    assert.match(route, /action === "upsert_stock_item"/);
    assert.match(route, /backorderPolicyValue/);
    assert.doesNotMatch(
      route,
      /action === "upsert_stock_item"[\s\S]*?expiresAt[\s\S]*?action === "set_stock_status"/
    );
    assert.match(route, /action === "set_stock_status"/);
	    assert.match(route, /action === "record_stock_movement"/);
	    assert.match(route, /action === "void_stock_movement"/);
	    assert.match(route, /action === "void_purchase_order"/);
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
    assert.match(service, /tasks\.task_type <> 'retail_purchase_order_review'/);
    assert.match(service, /claimedByDisplayName/);
    assert.match(service, /claimed_people\.display_name/);
    assert.doesNotMatch(service, /completedReviewTaskIds/);
    assert.doesNotMatch(service, /completedByAction: "mark_purchase_order_ordered"/);
    assert.match(service, /Task must be claimed before it can be completed/);
    assert.match(service, /voidRetailPurchaseOrder/);
    assert.match(service, /admin\.retail_purchase_order_voided/);
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
	    assert.match(service, /export type RetailPurchaseOrderShortfallResolution/);
	    assert.match(service, /export async function reconcileRetailPurchaseOrderLineShortfall/);
	    assert.match(service, /export async function markRetailPurchaseOrderLineMissing/);
	    assert.match(service, /quantity_ordered[\s\S]*quantity_received[\s\S]*quantity_cancelled/);
	    assert.match(service, /admin\.retail_purchase_order_shortfall_reconciled/);
	    assert.match(service, /retail_purchase_order_shortfall_reconciled/);
	    assert.match(service, /retail_purchase_order_shortfall_reopened_demand/);
	    assert.match(service, /unordered_demand_reopened/);
	    assert.match(service, /Number\.isInteger\(quantity\)/);
	    assert.match(service, /quantity > remaining/);
	    assert.match(service, /Receiving quantity must be a whole number within the remaining amount/);
	    assert.match(service, /voidRetailStockMovement/);
    assert.match(service, /refreshRetailStockReorderAdvice/);
    assert.match(service, /retail_stock_reorder_advice\.risk_level <> 'ok'/);
    assert.match(service, /retail_stock_reorder_advice\.suggested_order_quantity > 0/);
    assert.match(service, /queueRetailStockIntelligenceRefresh/);
    assert.match(service, /retail_stock_movements/);
    assert.match(service, /retail_stock_lots/);
    assert.match(service, /retail_stock_reorder_advice/);
    assert.match(service, /createRetailPurchaseOrder/);
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
	    assert.match(service, /writeFulfillmentBpmEvent/);
	    assert.match(route, /routingPreference/);
	    assert.match(route, /selectedRetailerOrganisationId/);
	    assert.match(route, /shippingCountry/);
	    assert.match(route, /action === "reconcile_customer_order_lifecycle"/);
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
    assert.match(service, /admin\.retail_purchase_order_created/);
    assert.match(service, /admin\.retail_customer_order_created/);
    assert.match(service, /admin\.stock_movement_recorded/);
    assert.match(service, /admin\.stock_movement_voided/);
    assert.match(service, /"status_changed"/);
    assert.match(agents, /retailStockForecast: "retail_stock_forecast"/);
    assert.match(agents, /retailStockPlanner/);
    assert.match(agents, /retail_stock_forecast_refresh: "retailStockPlanner"/);
    assert.match(worker, /stock: agentProfile\("retailStockPlanner"/);
    assert.match(workItems, /RetailStockForecastWorkItem/);
    assert.match(execution, /refreshRetailStockReorderAdvice/);
  });
});
