import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const schema = readFileSync(new URL("../db-schema.sql", import.meta.url), "utf8");
const checkout = readFileSync(
  new URL("../lib/retail-product-checkout.ts", import.meta.url),
  "utf8"
);
const financials = readFileSync(
  new URL("../lib/admin-retail-financials.ts", import.meta.url),
  "utf8"
);
const backfillScript = readFileSync(
  new URL("../scripts/backfill-retail-order-settlements.ts", import.meta.url),
  "utf8"
);
const stock = readFileSync(
  new URL("../lib/admin-retail-stock.ts", import.meta.url),
  "utf8"
);
const customerOrders = readFileSync(
  new URL("../lib/admin-retail-customer-orders.ts", import.meta.url),
  "utf8"
);
const financialsView = readFileSync(
  new URL("../components/admin/financials-view.tsx", import.meta.url),
  "utf8"
);
const retailFinancialsView = readFileSync(
  new URL("../components/admin/retail-financials-view.tsx", import.meta.url),
  "utf8"
);
const retailFinancialsLabels = readFileSync(
  new URL("../lib/retail-financials-labels.ts", import.meta.url),
  "utf8"
);
const retailFinancialsApi = readFileSync(
  new URL("../app/api/admin/retail-financials/route.ts", import.meta.url),
  "utf8"
);
const dashboard = readFileSync(
  new URL("../components/admin-dashboard.tsx", import.meta.url),
  "utf8"
);
const dashboardContent = readFileSync(
  new URL("../components/admin/dashboard-content.tsx", import.meta.url),
  "utf8"
);
const rbac = readFileSync(new URL("../lib/admin-rbac.ts", import.meta.url), "utf8");

describe("retail financial settlements", () => {
  it("defines retailer settlement accounts and order settlements", () => {
    assert.match(schema, /CREATE TABLE public\.organisation_finance_accounts/);
    assert.match(schema, /organisation_finance_accounts_role_check[\s\S]*retailer_settlement/i);
    assert.match(schema, /CREATE TABLE public\.retail_order_settlements/);
    assert.match(schema, /'pending'::text[\s\S]*'due'::text[\s\S]*'paid'::text[\s\S]*'confirmed'::text[\s\S]*'needs_review'::text[\s\S]*'voided'::text/);
    assert.match(schema, /retail_order_settlements_org_status_idx/);
  });

  it("creates pending settlements at payment and no longer records checkout payout rows", () => {
    assert.match(checkout, /createPendingRetailOrderSettlement/);
    assert.match(checkout, /retailerPayableAmount/);
    assert.match(checkout, /wholesale_price_amount/);
    assert.match(financials, /retailerPayableAmount/);
    assert.match(financials, /missing_retailer_payable_price/);
    assert.doesNotMatch(checkout, new RegExp(["retailer", "Settlement", "Amount"].join("")));
    assert.doesNotMatch(financials, new RegExp(["retailer", "Settlement", "Amount"].join("")));
    const oldTenant = ["Del", "ight"].join("");
    assert.doesNotMatch(checkout, new RegExp(`Nominal ${oldTenant} Pharmacy settlement`));
    assert.doesNotMatch(checkout, new RegExp(`${oldTenant.toUpperCase()}_FINANCE_ACCOUNT_ID`));
    assert.doesNotMatch(
      checkout,
      new RegExp(`retail-checkout:\\$\\{payment\\.id\\}:${oldTenant.toLowerCase()}`)
    );
  });

  it("moves settlements due on shipment and review or void on exception paths", () => {
    assert.match(financials, /export async function markRetailOrderSettlementDue/);
    assert.match(customerOrders, /markRetailOrderSettlementDue/);
    assert.match(customerOrders, /input\.action === "mark_shipped"[\s\S]*markRetailOrderSettlementDue/);
    assert.match(customerOrders, /voidPendingRetailOrderSettlement/);
    assert.match(customerOrders, /markRetailOrderSettlementNeedsReview/);
    assert.doesNotMatch(stock, /markRetailOrderSettlementDue/);
  });

  it("records BPM, audit, and useful organisation notifications for settlement changes", () => {
    assert.match(financials, /eventName: "retail_settlement_pending_created"/);
    assert.match(financials, /action: "admin\.retail_settlement_pending_created"/);
    assert.match(financials, /eventName: "retail_settlement_due"/);
    assert.match(financials, /action: "admin\.retail_settlement_due"/);
    assert.match(financials, /platform_retailer_payout_due/);
    assert.match(financials, /eventName: "retail_settlement_payout_paid"/);
    assert.match(financials, /action: "admin\.retail_settlement_payout_paid"/);
    assert.match(financials, /retail_settlement_payout_paid/);
    assert.match(financials, /eventName: "retail_settlement_payout_confirmed"/);
    assert.match(financials, /action: "admin\.retail_settlement_payout_confirmed"/);
    assert.match(financials, /eventName: "retail_settlement_needs_review"/);
    assert.match(financials, /action: "admin\.retail_settlement_needs_review"/);
    assert.match(financials, /platform_retailer_settlement_needs_review/);
    assert.match(financials, /retail_settlement_needs_review/);
    assert.match(financials, /eventName: "retail_settlement_voided"/);
    assert.match(financials, /action: "admin\.retail_settlement_voided"/);
    assert.doesNotMatch(financials, /retail_settlement_pending_created[\s\S]*queueAdminOrganisationCommunication/);
    assert.doesNotMatch(financials, /retail_settlement_voided[\s\S]*queueAdminOrganisationCommunication/);
  });

  it("keeps platform payout and retailer confirmation as separate actions", () => {
    assert.match(financials, /export async function markRetailSettlementPaid/);
    assert.match(financials, /context\.effectiveOrganisation\.type !== "platform"/);
    assert.match(financials, /entryType: "actual"/);
    assert.match(financials, /export async function confirmRetailSettlementReceived/);
    assert.match(financials, /context\.effectiveOrganisation\.type !== "tenant"/);
    assert.doesNotMatch(financials, /confirmRetailSettlementReceived[\s\S]*recordFinanceTransaction[\s\S]*retail_settlement_payout_confirmed/);
  });

  it("adds retailer financials without exposing platform financials to tenants", () => {
    assert.match(dashboardContent, /name: "Settlements", view: "settlements"/);
    assert.match(dashboardContent, /"retail-financials"/);
    assert.match(dashboardContent, /name: "Financials", view: "retail-financials"/);
    assert.match(rbac, /view !== "financials" && view !== "panya" && view !== "settlements"/);
    assert.match(rbac, /view === "financials"[\s\S]*view === "retail-financials"[\s\S]*view === "settlements"/);
    assert.doesNotMatch(financialsView, /Retailer settlement balances/);
    assert.doesNotMatch(financialsView, /retailFinancialsData/);
    assert.match(retailFinancialsLabels, /retailerBalances: "Retailer balances"/);
    assert.match(retailFinancialsLabels, /settlementRollup: "Settlement rollup"/);
    assert.match(retailFinancialsLabels, /totalReceivable: "Total receivable"/);
    assert.doesNotMatch(retailFinancialsLabels, /grossMargin/);
    assert.match(retailFinancialsLabels, /all: "All"/);
    assert.match(retailFinancialsLabels, /voided: "Voided"/);
    assert.match(retailFinancialsLabels, /nominalPayouts: "Nominal payouts"/);
    assert.match(retailFinancialsLabels, /actualPayouts: "Actual payouts"/);
    assert.match(retailFinancialsLabels, /confirmed: "Confirmed"/);
    assert.match(retailFinancialsLabels, /awaitingConfirmation: "Awaiting confirmation"/);
    assert.doesNotMatch(retailFinancialsLabels, new RegExp(["Confirmed", " paid"].join("")));
    assert.doesNotMatch(retailFinancialsLabels, new RegExp(["Paid", " awaiting", " confirmation"].join("")));
    assert.doesNotMatch(retailFinancialsLabels, new RegExp(["paid", "Awaiting", "Confirmation"].join("")));
  });

  it("keeps retailer statements free of platform margin while preserving platform settlement columns", () => {
    assert.match(retailFinancialsView, /scope: "platform" \| "retail"/);
    assert.match(retailFinancialsView, /const showPlatformColumns = scope === "platform" && data\.isPlatformScope/);
    assert.match(retailFinancialsView, /function currencyHeader\(label: string, currency: string\)/);
    assert.match(retailFinancialsView, /function statementHeading\(label: string, currency: string\)/);
    assert.match(retailFinancialsView, /function settlementStatusText/);
    assert.match(retailFinancialsView, /status === "paid"[\s\S]*retailFinancialsLabels\(locale\)\.received/);
    assert.match(retailFinancialsView, /const \[settlementFilter, setSettlementFilter\] = useState<SettlementFilter>\("all"\)/);
    assert.match(retailFinancialsView, /statementHeading\(text\.settlementStatement, data\.currency\)/);
    assert.doesNotMatch(retailFinancialsView, /label: amountHeader/);
    assert.match(retailFinancialsView, /const settlementStatusCounts = data\.rows\.reduce<Record<RetailSettlementStatus, number>>/);
    assert.match(retailFinancialsView, /const settlementAllCount = data\.rows\.filter\(\(row\) => row\.status !== "confirmed"\)\.length/);
    assert.match(retailFinancialsView, /const statusMetrics = \(paidLabel: string\): BusinessMetric\[] => \[[\s\S]*id: "all"[\s\S]*value: formatNumber\(settlementAllCount, locale\)[\s\S]*id: "pending"[\s\S]*value: formatNumber\(settlementStatusCounts\.pending, locale\)[\s\S]*id: "due"[\s\S]*id: "paid"[\s\S]*label: paidLabel[\s\S]*id: "needs_review"[\s\S]*id: "voided"[\s\S]*id: "confirmed"/);
    assert.match(retailFinancialsView, /const metrics = statusMetrics\(showPlatformColumns \? text\.paid : text\.awaitingConfirmation\)/);
    assert.doesNotMatch(retailFinancialsView, /const statusMetrics[\s\S]*format: "currency"[\s\S]*\];/);
    assert.match(retailFinancialsView, /const filteredRows = data\.rows\.filter\(\(row\) =>[\s\S]*settlementFilter === "all" \? row\.status !== "confirmed" : row\.status === settlementFilter/);
    assert.match(retailFinancialsView, /onMetricSelect=\{\(id\) => setSettlementFilter\(id as SettlementFilter\)\}[\s\S]*selectedMetricId=\{settlementFilter\}/);
    assert.match(retailFinancialsView, /const retailerTotalReceivable =[\s\S]*data\.summary\.pendingAmount[\s\S]*data\.summary\.dueAmount[\s\S]*data\.summary\.paidAmount[\s\S]*data\.summary\.confirmedAmount[\s\S]*data\.summary\.needsReviewAmount/);
    assert.match(retailFinancialsView, /const retailRollupItems = \[[\s\S]*text\.totalReceivable[\s\S]*text\.pending[\s\S]*text\.due[\s\S]*text\.awaitingConfirmation[\s\S]*text\.confirmed[\s\S]*text\.needsReview[\s\S]*text\.outstanding/);
    const rollupStart = retailFinancialsView.indexOf("const retailRollupItems");
    const statusMetricsStart = retailFinancialsView.indexOf("const statusMetrics");
    assert.notEqual(rollupStart, -1);
    assert.notEqual(statusMetricsStart, -1);
    assert.doesNotMatch(
      retailFinancialsView.slice(rollupStart, statusMetricsStart),
      /text\.settlements/
    );
    assert.match(retailFinancialsView, /!showPlatformColumns \? \([\s\S]*<section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">[\s\S]*border-b border-gray-200 px-5 py-4[\s\S]*statementHeading\(text\.settlementRollup, data\.currency\)[\s\S]*<table className="min-w-full divide-y divide-gray-200">[\s\S]*retailRollupItems\.map/);
    assert.doesNotMatch(retailFinancialsView, /lg:grid-cols-\[minmax\(0,1\.1fr\)_minmax\(0,2fr\)\]/);
    assert.doesNotMatch(retailFinancialsView, /const statusMetrics[\s\S]*id: "gross"[\s\S]*\];/);
    assert.doesNotMatch(retailFinancialsView, /const statusMetrics[\s\S]*id: "nominal"[\s\S]*\];/);
    assert.doesNotMatch(retailFinancialsView, /const statusMetrics[\s\S]*id: "actual"[\s\S]*\];/);
    assert.match(retailFinancialsView, /const statementHeadings = showPlatformColumns/);
    assert.match(retailFinancialsView, /statementHeading\(text\.retailerBalances, data\.currency\)/);
    assert.doesNotMatch(retailFinancialsView, /currencyHeader\(text\.pending, data\.currency\)/);
    assert.doesNotMatch(retailFinancialsView, /const statementHeadings[\s\S]*text\.nominal[\s\S]*const csvHref/);
    assert.doesNotMatch(retailFinancialsView, /const statementHeadings[\s\S]*text\.actual[\s\S]*const csvHref/);
    assert.match(retailFinancialsView, /: \[\s*text\.order,\s*text\.status,\s*text\.customer,\s*text\.receivable,\s*text\.received,\s*text\.action\s*\]/);
    assert.doesNotMatch(retailFinancialsView, /: \[\s*text\.order,\s*text\.status,\s*text\.customer,\s*text\.gross/);
    assert.doesNotMatch(retailFinancialsView, /currencyHeader\(text\.nominal, data\.currency\)/);
    assert.doesNotMatch(retailFinancialsView, /currencyHeader\(text\.actual, data\.currency\)/);
    assert.match(retailFinancialsView, /showPlatformColumns \? \(\s*<td[\s\S]*row\.organisationName/);
    assert.match(retailFinancialsView, /text\.retailer,\s*text\.gross,\s*text\.margin,\s*text\.pending,\s*text\.due,\s*text\.paid,\s*text\.confirmed,\s*text\.needsReview,\s*text\.outstanding/);
    assert.match(retailFinancialsView, /index === 3 && "border-l border-gray-200"/);
    assert.match(retailFinancialsView, /formatMoneyNumber\(summary\.grossCustomerAmount, locale\)/);
    assert.match(retailFinancialsView, /formatMoneyNumber\(summary\.mattanutraMarginAmount, locale\)/);
    assert.match(retailFinancialsView, /border-l border-gray-200 px-5 py-4 text-sm text-gray-600[\s\S]*formatMoneyNumber\(summary\.pendingAmount, locale\)/);
    assert.match(retailFinancialsView, /filteredRows\.length > 0/);
    assert.match(retailFinancialsView, /filteredRows\.map\(\(row\) =>/);
    assert.match(dashboardContent, /view: "settlements"/);
    assert.match(dashboard, /scope=\{view === "settlements" \? "platform" : "retail"\}/);
    assert.match(financials, /const header = data\.isPlatformScope[\s\S]*labels\.mattanutraMarginAmount[\s\S]*amountHeader\(labels\.paidAmount\)[\s\S]*: \[[\s\S]*labels\.orderNumber[\s\S]*amountHeader\(labels\.receivable\)[\s\S]*amountHeader\(labels\.received\)/);
    assert.doesNotMatch(financials, /: \[\s*labels\.orderNumber,[\s\S]*labels\.grossCustomerAmount/);
    assert.doesNotMatch(financials, /: \[\s*labels\.orderNumber,[\s\S]*labels\.retailerPayableAmount/);
    assert.doesNotMatch(financials, /: \[\s*labels\.orderNumber,[\s\S]*labels\.paidAmount/);
    assert.doesNotMatch(financials, /labels\.nominalPayouts/);
    assert.doesNotMatch(financials, /labels\.actualPayouts/);
    assert.match(financials, /const amountHeader = \(label: string\) => `\$\{label\} \(\$\{data\.currency\}\)`/);
    assert.doesNotMatch(financials, /labels\.currency,[\s\S]*labels\.grossCustomerAmount/);
    assert.match(financials, /return data\.isPlatformScope[\s\S]*row\.mattanutraMarginAmount[\s\S]*: \[\.\.\.base, \.\.\.financial, \.\.\.payment\]/);
    assert.match(retailFinancialsApi, /isLocale\(requestedLocale\)/);
    assert.match(retailFinancialsApi, /retailFinancialsCsv\(data, locale\)/);
  });

  it("ships an idempotent settlement backfill for pre-existing checkout orders", () => {
    assert.match(backfillScript, /retail_order_settlements\.id is null/);
    assert.match(backfillScript, /retail_customer_orders\.source = 'checkout'/);
    assert.match(backfillScript, /createPendingRetailOrderSettlement/);
    assert.match(backfillScript, /markRetailOrderSettlementDue/);
    assert.match(backfillScript, /markRetailOrderSettlementNeedsReview/);
    assert.match(backfillScript, /voidPendingRetailOrderSettlement/);
    assert.match(backfillScript, /retailerPayableAmount/);
    assert.match(backfillScript, /wholesale_price/);
    assert.match(backfillScript, /missing_retailer_payable_price/);
    assert.match(backfillScript, /paid_amount > retailer_payable_amount/);
    assert.match(backfillScript, /paidAmountRepairedAt/);
    assert.match(backfillScript, /retailer_settlement_paid_amount_repaired/);
  });

  it("rejects tenant-specific settlement metadata names in committed code", () => {
    const searchableSources = [
      checkout,
      financials,
      backfillScript,
      retailFinancialsApi,
      retailFinancialsView
    ].join("\n");

    assert.doesNotMatch(searchableSources, new RegExp(["dr", "eam", "Settlement", "Amount"].join("")));
    assert.doesNotMatch(searchableSources, new RegExp(["deli", "ght", "Settlement", "Amount"].join("")));
    assert.doesNotMatch(searchableSources, new RegExp(["retailer", "Settlement", "Amount"].join("")));
  });
});
