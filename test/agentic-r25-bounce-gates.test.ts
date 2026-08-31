import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { AGENTIC_POLL_AFTER_SECONDS } from "../lib/agentic/config.ts";
import { DEFAULT_SHIPPING_MINOR, payableSnapshot } from "../lib/agentic/money.ts";
import { applyVerifiedPaymentEvent, orderPollView } from "../lib/agentic/commerce/state.ts";
import { mockEventForScenario } from "../lib/agentic/commerce/payment.ts";
import { publicPlanFields, publicSafetyGuidance } from "../lib/agentic/public-mapper.ts";
import { evaluateSafety } from "../lib/agentic/plan/safety.ts";
import { PLAN_MATCH_RETURN_BUDGET_MS } from "../lib/agentic/plan/service.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import type { OrderRecord } from "../lib/agentic/store/types.ts";
import type {
  BasketItem,
  CanonicalPlanState,
  CoverageRow,
  SafetyGuidance,
  StackOption
} from "../lib/agentic/plan/types.ts";
import {
  resetMatcherSafetyCeilings,
  setMatcherSafetyCeilings
} from "../lib/matcher/safety-ceilings.ts";

const MAG_ID = "sup_199df5c489215c37b85b6bcb14b443fa";
const MAG_BAND_ID = "3e13d7f5-3649-4e4b-b648-70f5470c2c89";
const MAG_SKU = "prd_ae75035d257051658a606e8d4c28b6d2";
const MAG_D3_SKU = "prd_202c5e0936e8575f9d95dcb35a8d2965";
const PACK_P95_MS = 2500;
const DEVELOPER_OFFICIAL_P95_MS = 506;

function packTimeToReady(matchMs: number, budgetMs: number, pollAfterSeconds: number) {
  if (matchMs <= budgetMs) {
    return matchMs;
  }

  return budgetMs + pollAfterSeconds * 1000;
}

function planState(overrides: Partial<CanonicalPlanState> = {}): CanonicalPlanState {
  return {
    acceptedGaps: [],
    conditionCodes: [],
    currency: "THB",
    currentSupplements: [],
    destinationCountry: "TH",
    leftovers: [],
    locale: "en",
    medicationCodes: [],
    optimization: "fewest_pills",
    pinnedOptionId: null,
    profile: { ageYears: 52, lifeStage: "adult", sex: "male" },
    requirements: {},
    safetyAcknowledgement: null,
    targets: [
      {
        amount: 200,
        name: "Magnesium",
        supplementId: MAG_ID,
        unit: "mg"
      }
    ],
    ...overrides
  };
}

function magItem(input: Readonly<{
  amount: number;
  productId: string;
  productName: string;
}>): BasketItem {
  return {
    availabilityAsOf: "2026-08-27T00:00:00.000Z",
    contributionSupplementIds: [MAG_ID],
    currency: "THB",
    dailyPills: 2,
    deliveryWindow: null,
    fixture: false,
    form: "capsule",
    imageUrl: null,
    incidentalNutrientNames: [],
    incidentalNutrients: [],
    incompleteCommercialFacts: false,
    lineTotalMinor: 89000,
    pillsPerServing: 1,
    productId: input.productId,
    productName: input.productName,
    quantity: 2,
    requestedNutrientNames: ["Magnesium"],
    requestedNutrients: [{ amount: input.amount, name: "Magnesium", unit: "mg" }],
    retailerSku: input.productName,
    sellerId: "delight",
    sellerName: "Delight",
    servingsPerDay: 2,
    source: "retail",
    stockStatus: "in_stock",
    unitPriceMinor: 44500
  };
}

function magCoverage(input: Readonly<{
  amount: number;
  productId: string;
  productName: string;
  requested: number;
}>): CoverageRow {
  return {
    contributors: [
      {
        amount: input.amount,
        productId: input.productId,
        productName: input.productName,
        source: "selected",
        unit: "mg"
      }
    ],
    coveragePercent: Math.min(100, Math.round((input.amount / input.requested) * 100)),
    currentAmount: 0,
    deliveredAmount: input.amount,
    name: "Magnesium",
    percentOfUpperLimit: null,
    remainingGap: Math.max(0, input.requested - input.amount),
    requestedAmount: input.requested,
    status: input.amount >= input.requested ? "covered" : "partial",
    supplementId: MAG_ID,
    totalExposureAmount: input.amount,
    unit: "mg",
    upperLimitAmount: null
  };
}

function magOption(coverage: CoverageRow, item: BasketItem): StackOption {
  return {
    basket: [item],
    coverage: [coverage],
    coveragePercent: coverage.coveragePercent,
    dailyPills: item.dailyPills,
    matcherVersion: "pareto-hybrid-1",
    optionId: "opt_test_mag",
    reason: "fewest_pills",
    snapshotId: "snap_test",
    totalPriceMinor: 618000
  };
}

function assertHardBlockComplete(block: SafetyGuidance | ReturnType<typeof publicSafetyGuidance>) {
  assert.equal(block.action, "block");
  assert.equal(typeof block.ruleId, "string");
  assert.ok(String(block.ruleId).length > 0, "hard block omitted catalog rule");
  assert.equal("exposure" in block, true, "hard block omitted exposure");
  assert.equal(block.exposure == null, false, "hard block omitted exposure");
  assert.ok(Array.isArray(block.contributors), "hard block omitted contributors");
}

function installCatalogMagBand() {
  setMatcherSafetyCeilings([
    {
      bandId: MAG_BAND_ID,
      bandVersion: 1,
      lifeStage: "adult",
      maxAmount: 350,
      maxUnit: "mg",
      name: "Magnesium",
      sourceScope: "supplemental",
      subjectId: MAG_ID
    }
  ]);
}

afterEach(() => {
  resetMatcherSafetyCeilings();
});

describe("R25 bounce gates — R24 crash class", () => {
  it("counts pollAfterSeconds in pack time-to-ready (400ms processing + 3s poll is a FAIL)", () => {
    const r24Crash = packTimeToReady(DEVELOPER_OFFICIAL_P95_MS, 400, 3);
    assert.equal(r24Crash, 3400);
    assert.ok(r24Crash > PACK_P95_MS);

    assert.notEqual(PLAN_MATCH_RETURN_BUDGET_MS, 400);
    assert.ok(PLAN_MATCH_RETURN_BUDGET_MS >= PACK_P95_MS);
    assert.equal(AGENTIC_POLL_AFTER_SECONDS, 3);

    const live = packTimeToReady(
      DEVELOPER_OFFICIAL_P95_MS,
      PLAN_MATCH_RETURN_BUDGET_MS,
      AGENTIC_POLL_AFTER_SECONDS
    );
    assert.equal(live, DEVELOPER_OFFICIAL_P95_MS);
    assert.ok(live <= PACK_P95_MS);

    const source = readFileSync(new URL("../lib/agentic/plan/service.ts", import.meta.url), "utf8");
    assert.match(source, /PLAN_MATCH_RETURN_BUDGET_MS = 3_000/);
    assert.equal(/PLAN_MATCH_RETURN_BUDGET_MS = 400/.test(source), false);
  });

  it("publishes catalog rule, real exposure, and contributors on every hard block", () => {
    installCatalogMagBand();
    const item = magItem({
      amount: 350,
      productId: MAG_SKU,
      productName: "MAGNESIUM"
    });
    const coverage = magCoverage({
      amount: 350,
      productId: MAG_SKU,
      productName: "MAGNESIUM",
      requested: 351
    });
    const selected = magOption(coverage, item);
    const guidance = evaluateSafety({
      locale: "en",
      selected,
      state: planState({
        targets: [{ amount: 351, name: "Magnesium", supplementId: MAG_ID, unit: "mg" }]
      })
    });
    const block = guidance.find((item) => item.action === "block");
    assert.ok(block, "expected a hard block");
    assertHardBlockComplete(block);
    assert.equal(block.ruleId, MAG_BAND_ID);
    assert.equal(block.exposure, 350);
    assert.ok(block.contributors.some((row) => row.productName === "MAGNESIUM"));

    const published = publicSafetyGuidance(block);
    assertHardBlockComplete(published);
    assert.equal(published.ruleId, MAG_BAND_ID);
    assert.equal(published.exposure, 350);
    assert.ok((published.contributors ?? []).length > 0);

    const omitted = publicSafetyGuidance({
      ...block,
      exposure: 0,
      contributors: []
    });
    assert.equal("exposure" in omitted, true);
    assert.equal(omitted.exposure, 0);
    assert.equal(omitted.contributors ?? undefined, undefined);
  });

  it("shows CKD Mag exposure > 0 when a Mag SKU is selected", () => {
    installCatalogMagBand();
    const item = magItem({
      amount: 301.5,
      productId: MAG_D3_SKU,
      productName: "BLACKMORE MAGNESIUM+D3 50'S"
    });
    const coverage = magCoverage({
      amount: 301.5,
      productId: MAG_D3_SKU,
      productName: "BLACKMORE MAGNESIUM+D3 50'S",
      requested: 200
    });
    const selected = magOption(coverage, item);
    const guidance = evaluateSafety({
      locale: "en",
      selected,
      state: planState({ conditionCodes: ["ckd"] })
    });
    const block = guidance.find(
      (item) => item.action === "block" && item.code === "dose_review_required"
    );
    assert.ok(block);
    assertHardBlockComplete(block);
    assert.ok(Number(block.exposure) > 0, "CKD Mag silent zero");
    assert.equal(block.exposure, 301.5);
    assert.equal(block.threshold, 0);
    assert.ok(
      block.contributors.some((row) => /magnesium/i.test(row.productName))
    );

    const published = publicSafetyGuidance(block);
    assert.ok(Number(published.exposure) > 0);
    assert.equal(published.threshold, 0);
    assert.equal("exposure" in published, true);
  });

  it("cancels fulfilment and moves retail off awaiting_stock on refund", async () => {
    const store = createMemoryStore();
    const now = "2026-08-27T03:00:00.000Z";
    const order: OrderRecord = {
      cancelledAt: null,
      checkoutAccessHash: "hash",
      checkoutExpiresAt: now,
      checkoutUrl: "https://dev.mattanutra.com/en/mcp/checkout/cap_test",
      completedAt: now,
      createdAt: now,
      currency: "THB",
      destinationCountry: "TH",
      environment: "dev",
      expiredAt: null,
      frozenPlan: { totalPriceMinor: 623000 },
      fulfilmentStatus: "processing",
      id: "11111111-1111-4111-8111-111111111111",
      latestPaymentAttempt: "succeeded",
      latestPaymentReason: null,
      orderStatus: "completed",
      paymentStatus: "paid",
      planId: "22222222-2222-4222-8222-222222222222",
      planRevision: 2,
      principalScope: "tester",
      providerSessionId: "mock_cs_refund_gate",
      reference: "MN-TEST-REFUND",
      stateVersion: 2,
      tenantScope: "mattanutra",
      totalPriceMinor: 623000,
      updatedAt: now
    };
    await store.insertOrder(order);

    const applied = await applyVerifiedPaymentEvent({
      event: mockEventForScenario({
        amountMinor: 623000,
        currency: "THB",
        orderId: order.id,
        providerSessionId: order.providerSessionId!,
        scenario: "refund"
      }),
      now,
      store
    });
    assert.ok(applied?.applied);
    assert.equal(applied.order.paymentStatus, "refunded");
    assert.equal(applied.order.fulfilmentStatus, "cancelled");
    assert.notEqual(applied.order.fulfilmentStatus, "processing");

    const stateSource = readFileSync(
      new URL("../lib/agentic/commerce/state.ts", import.meta.url),
      "utf8"
    );
    assert.match(stateSource, /fulfilmentStatus: "cancelled"/);
    assert.match(stateSource, /cancelRetailCustomerOrderForAgenticRefund/);
    const retailSource = readFileSync(
      new URL("../lib/retail-product-checkout.ts", import.meta.url),
      "utf8"
    );
    assert.match(retailSource, /status = 'cancelled'/);
    assert.match(retailSource, /export async function cancelRetailCustomerOrderForAgenticRefund/);

    const view = orderPollView({
      checkoutUrl: null,
      found: true,
      localeMessage: () => "refunded",
      order: applied.order,
      retail: {
        orderId: "retail-1",
        orderNumber: "SO-TEST",
        orderStatus: "cancelled",
        trackingUrl: "/en/order/track/SO-TEST"
      }
    });
    assert.equal((view as { paymentStatus?: string }).paymentStatus, "refunded");
    assert.equal((view as { fulfilment?: { status?: string } }).fulfilment?.status, "cancelled");
    assert.notEqual(
      (view as { retailCustomerOrder?: { orderStatus?: string } }).retailCustomerOrder
        ?.orderStatus,
      "awaiting_stock"
    );
  });

  it("stamps THB 50 shipping on the plan before execute", () => {
    assert.equal(DEFAULT_SHIPPING_MINOR, 5000);
    const payable = payableSnapshot({ subtotalMinor: 618000 });
    assert.equal(payable.shippingMinor, 5000);
    assert.equal(payable.subtotalMinor, 618000);
    assert.equal(payable.totalPriceMinor, 623000);

    const item = magItem({
      amount: 300,
      productId: MAG_SKU,
      productName: "MAGNESIUM"
    });
    const coverage = magCoverage({
      amount: 300,
      productId: MAG_SKU,
      productName: "MAGNESIUM",
      requested: 200
    });
    const selected = magOption(coverage, item);
    const plan = publicPlanFields({
      alternatives: [],
      basket: selected.basket,
      changeSummary: [],
      coverage: selected.coverage,
      questions: [],
      safetyGuidance: [],
      selected,
      status: "needs_input",
      summary: "needs_input",
      unmetRequirements: []
    });
    assert.equal(plan.shippingMinor, 5000);
    assert.equal((plan.stackSummary as { totalPriceMinor?: number }).totalPriceMinor, 618000);
    assert.equal(plan.estimatedOrderTotalMinor, 623000);
    assert.equal("subtotalMinor" in plan, false);
    assert.equal("totalPriceMinor" in plan, false);

    const mapper = readFileSync(
      new URL("../lib/agentic/public-mapper.ts", import.meta.url),
      "utf8"
    );
    assert.match(mapper, /payableSnapshot/);
    assert.match(mapper, /shippingMinor: payable\.shippingMinor/);
  });

  it("does not omit catalogueGaps when leftover rows exist", () => {
    const info = readFileSync(new URL("../lib/agentic/info.ts", import.meta.url), "utf8");
    const telemetry = readFileSync(
      new URL("../lib/agentic/plan/telemetry.ts", import.meta.url),
      "utf8"
    );
    const schema = readFileSync(
      new URL("../scripts/apply-agentic-commerce-schema.ts", import.meta.url),
      "utf8"
    );

    assert.match(info, /listCatalogueGaps/);
    assert.match(info, /catalogueGaps\.length > 0 \? \{ catalogueGaps \}/);
    assert.match(telemetry, /from public\.agentic_catalogue_gaps/);
    assert.match(telemetry, /sql\.json\(telemetry\.leftovers/);
    assert.equal(/JSON\.stringify\(value \?\? null\)/.test(telemetry), false);
    assert.match(schema, /when 'string' then/);
    assert.match(schema, /leftovers #>> '\{\}'/);
    assert.equal(
      /jsonb_array_elements\(events\.leftovers\)/.test(schema),
      false,
      "scalar leftover strings 22023 if array_elements runs on the column"
    );
  });
});
