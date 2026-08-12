import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  financialDirection,
  formatLedgerMoney,
  normalizeFinancialEntryBasis,
  normalizeFinancialPage,
  normalizeFinancialPageSize,
  signedUsdForRow
} from "../lib/admin-financials.ts";

const stripePayments = readFileSync(
  new URL("../lib/stripe-payments.ts", import.meta.url),
  "utf8"
);
const retailCheckout = readFileSync(
  new URL("../lib/retail-product-checkout.ts", import.meta.url),
  "utf8"
);
const retailFinancials = readFileSync(
  new URL("../lib/admin-retail-financials.ts", import.meta.url),
  "utf8"
);
const adminFinancials = readFileSync(
  new URL("../lib/admin-financials.ts", import.meta.url),
  "utf8"
);
const financialsView = readFileSync(
  new URL("../components/admin/financials-view.tsx", import.meta.url),
  "utf8"
);

describe("admin financials money-flow rules", () => {
  it("does not book plan revenue on checkout create", () => {
    assert.doesNotMatch(
      stripePayments,
      /payment_created[\s\S]{0,200}recordStripePaymentCompletedRevenue|recordStripePaymentCompletedRevenue[\s\S]{0,80}payment_created/
    );
    assert.match(stripePayments, /Revenue is booked only after checkout completes/);
  });

  it("books completed plan sales as nominal revenue and voids abandoned ones", () => {
    assert.match(stripePayments, /recordStripePaymentCompletedRevenue/);
    assert.match(
      stripePayments,
      /async function recordStripePaymentCompletedRevenue[\s\S]*?entryType: "nominal"/
    );
    assert.match(stripePayments, /voidStripePaymentRevenue/);
    assert.match(stripePayments, /"payment_expired"/);
    assert.match(
      stripePayments,
      /async function voidStripePaymentRevenue[\s\S]*?category: "other"/
    );
  });

  it("does not treat Stripe bank transfers as customer revenue", () => {
    assert.match(stripePayments, /Internal Stripe clearing → bank transfer/);
    assert.match(stripePayments, /accountingBasis: "stripe_payout"/);
    assert.match(
      stripePayments,
      /async function recordStripePayoutAccounting[\s\S]*?category: "other"[\s\S]*?stripe:payout:\$\{payout\.id\}:net/
    );
    assert.doesNotMatch(
      stripePayments,
      /async function recordStripePayoutAccounting[\s\S]*?category: "revenue"/
    );
  });

  it("books retail product checkout revenue as nominal", () => {
    assert.match(
      retailCheckout,
      /description: "Retail product checkout customer payment"[\s\S]{0,80}entryType: "nominal"/
    );
    assert.doesNotMatch(
      retailCheckout,
      /stripe_mode === "mock" \? "nominal" : "actual"/
    );
  });

  it("uses a single settlement payout source_ref for nominal→actual transition", () => {
    assert.match(
      retailFinancials,
      /sourceRef: `retail-settlement:\$\{settlement\.id\}:payout`/
    );
    assert.doesNotMatch(
      retailFinancials,
      /retail-settlement:\$\{settlement\.id\}:nominal-payout/
    );
    assert.doesNotMatch(
      retailFinancials,
      /retail-settlement:\$\{settlement\.id\}:actual-payout/
    );
  });

  it("still posts nominal retailer payout when some lines need review", () => {
    assert.match(
      retailFinancials,
      /missingPayableLineCount[\s\S]{0,300}Continue: still post nominal payout/
    );
  });

  it("supports entry basis switch, net, paging, and signed outflows", () => {
    assert.match(adminFinancials, /entryBasis/);
    assert.match(adminFinancials, /netUsd/);
    assert.match(adminFinancials, /pageSize/);
    assert.match(adminFinancials, /totalCount/);
    assert.match(adminFinancials, /formatLedgerMoney/);
    assert.match(adminFinancials, /kpiDisabled/);
    assert.match(financialsView, /basisNominal/);
    assert.match(financialsView, /previousPage/);
    assert.match(financialsView, /formatSignedMoney|formatLedgerMoney/);
  });
});

describe("admin financials helpers", () => {
  it("normalizes entry basis and paging", () => {
    assert.equal(normalizeFinancialEntryBasis(undefined), "nominal");
    assert.equal(normalizeFinancialEntryBasis("actual"), "actual");
    assert.equal(normalizeFinancialEntryBasis("all"), "all");
    assert.equal(normalizeFinancialEntryBasis("bogus"), "nominal");
    assert.equal(normalizeFinancialPage("0"), 1);
    assert.equal(normalizeFinancialPage("3"), 3);
    assert.equal(normalizeFinancialPageSize("10"), 10);
    assert.equal(normalizeFinancialPageSize("9999"), 200);
  });

  it("classifies inflows and outflows and signs amounts", () => {
    assert.equal(financialDirection("revenue"), "in");
    assert.equal(financialDirection("payout"), "out");
    assert.equal(financialDirection("payment_fee"), "out");
    assert.equal(financialDirection("ai"), "out");
    assert.equal(
      financialDirection("other", { accountingBasis: "stripe_payout" }),
      "neutral"
    );
    assert.equal(signedUsdForRow(12.5, "in"), 12.5);
    assert.equal(signedUsdForRow(12.5, "out"), -12.5);
    assert.equal(signedUsdForRow(12.5, "neutral"), 0);
  });

  it("formats outflows in parentheses", () => {
    const inflow = formatLedgerMoney(12.5, "in", "en-GB");
    const outflow = formatLedgerMoney(12.5, "out", "en-GB");
    assert.match(inflow, /12\.50|US\$12\.50|\$12\.50/);
    assert.equal(outflow.startsWith("(") && outflow.endsWith(")"), true);
    assert.match(outflow, /12\.50/);
  });
});
