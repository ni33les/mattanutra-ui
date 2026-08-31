import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { match } from "../../lib/matcher/index.ts";
import { scaleAmount } from "../../lib/matcher/dose.ts";
import {
  PUBLIC_REJECTED_SAMPLE_LIMIT,
  summarizeRejections
} from "../../lib/matcher/explainer.ts";
import { productRejectionReason } from "../../lib/matcher/eligibility.ts";
import { publicPlanFields } from "../../lib/agentic/public-mapper.ts";
import { qaCatalogSafetyCeilings } from "../../lib/matcher/qa/safety-ceilings.ts";
import type {
  CanonicalRequest,
  CanonicalTarget,
  MatcherProduct,
  MatcherUnit
} from "../../lib/matcher/types.ts";

function target(
  name: string,
  subjectId: string,
  amount: number,
  unit: MatcherUnit
): CanonicalTarget {
  const requested = scaleAmount({
    amount,
    subjectId,
    subjectName: name,
    unit
  });
  assert.equal("reason" in requested, false);
  if ("reason" in requested) {
    throw new Error(requested.message);
  }
  return {
    importance: "required",
    name,
    requested,
    requestedAmount: amount,
    requestedUnit: unit,
    subjectId
  };
}

function sku(input: {
  id: string;
  pills?: number;
  form?: string;
  omega?: MatcherProduct["omegaSource"];
  dietary?: MatcherProduct["dietarySource"];
  prenatal?: boolean;
  audience?: MatcherProduct["productAudience"];
  orderable?: boolean;
  status?: MatcherProduct["status"];
  stock?: MatcherProduct["stockStatus"];
  currency?: string;
  countries?: readonly string[] | null;
  facts: ReadonlyArray<{
    amount: number;
    name: string;
    subjectId: string;
    unit: string;
  }>;
  price: number;
}): MatcherProduct {
  return {
    availableCountryCodes: input.countries === undefined ? ["TH"] : input.countries,
    contributionSubjectIds: [...new Set(input.facts.map((item) => item.subjectId))],
    currency: input.currency ?? "THB",
    dailyPillsPerServing: input.pills ?? 1,
    dietarySource: input.dietary ?? "any",
    form: input.form ?? "tablet",
    imageUrl: null,
    incompleteCommercialFacts: false,
    labelledContributions: input.facts.map((item) => ({
      amount: item.amount,
      name: item.name,
      subjectId: item.subjectId,
      unit: item.unit
    })),
    omegaSource: input.omega ?? "none",
    orderable: input.orderable ?? input.status !== "pending_review",
    prenatalOrFertility: input.prenatal ?? false,
    productAudience: input.audience ?? "both",
    productId: input.id,
    retailerSku: input.id,
    sellerId: "seller_th",
    sellerName: "TH",
    source: "fixture",
    status: input.status ?? "approved",
    stockStatus: input.stock ?? "in_stock",
    title: input.id,
    unknownSafetyAmount: false,
    unitPriceMinor: input.price
  };
}

const d3 = target("Vitamin D3", "sup_d3", 2000, "IU");
const omega = target("Omega-3", "sup_omega", 1000, "mg");

const G_D3_2000 = sku({
  id: "G-D3-2000",
  facts: [{ amount: 2000, name: "Vitamin D3", subjectId: "sup_d3", unit: "IU" }],
  price: 16000
});
const G_O3_FISH = sku({
  id: "G-O3-FISH-1000",
  pills: 2,
  form: "softgel",
  omega: "fish",
  dietary: "fish",
  facts: [{ amount: 1000, name: "Omega-3", subjectId: "sup_omega", unit: "mg" }],
  price: 30000
});
const G_HIGH_TRAP = sku({
  id: "G-HIGH-TRAP",
  facts: [
    { amount: 5000, name: "Vitamin D3", subjectId: "sup_d3", unit: "IU" },
    { amount: 600, name: "Magnesium", subjectId: "sup_mag", unit: "mg" }
  ],
  price: 5000
});
const G_PRECARE = sku({
  id: "G-PRECARE",
  pills: 2,
  prenatal: true,
  audience: "female",
  facts: [
    { amount: 400, name: "Folate", subjectId: "sup_folate", unit: "mcg" },
    { amount: 600, name: "Vitamin D3", subjectId: "sup_d3", unit: "IU" }
  ],
  price: 25000
});
const G_INCIDENTAL_C = sku({
  id: "G-INCIDENTAL-C",
  form: "capsule",
  facts: [
    { amount: 1, name: "Collagen", subjectId: "sup_collagen", unit: "g" },
    { amount: 250, name: "Vitamin C", subjectId: "sup_c", unit: "mg" }
  ],
  price: 7000
});
const G_COLLAGEN = sku({
  id: "G-COLLAGEN-5G",
  form: "powder",
  dietary: "any",
  facts: [{ amount: 5, name: "Collagen", subjectId: "sup_collagen", unit: "g" }],
  price: 18000
});
const G_OOS = sku({
  id: "G-OOS-D3-2000",
  stock: "unavailable",
  facts: [{ amount: 2000, name: "Vitamin D3", subjectId: "sup_d3", unit: "IU" }],
  price: 1000
});
const G_FOREIGN = sku({
  id: "G-FOREIGN-D3",
  currency: "USD",
  countries: ["US"],
  facts: [{ amount: 2000, name: "Vitamin D3", subjectId: "sup_d3", unit: "IU" }],
  price: 100
});
const G_CAPSULE = sku({
  id: "G-MAG-CAP",
  form: "capsule",
  facts: [{ amount: 200, name: "Magnesium", subjectId: "sup_mag", unit: "mg" }],
  price: 12000
});

function request(overrides: Partial<CanonicalRequest> = {}): CanonicalRequest {
  return {
    acceptedGapSubjectIds: [],
    allowedForms: null,
    conditionCodes: [],
    currency: "THB",
    currentSupplements: [],
    destinationCountry: "TH",
    dietaryPreference: "any",
    excludeSubjectIds: [],
    leftovers: [],
    maxDailyPills: null,
    maxPriceMinor: null,
    maxProductCount: 8,
    medicationCodes: [],
    omega3SourcePreference: "any",
    optimization: "best_coverage",
    profile: { ageYears: 52, lifeStage: "adult", sex: "male" },
    retainProductIds: [],
    retainSubjectIds: [],
    selectorMode: "agentic",
    targets: [d3],
    ...overrides
  };
}

function catalog(products: readonly MatcherProduct[]) {
  return {
    availabilityAsOf: "2026-01-01T00:00:00.000Z",
    catalogueVersion: "qa-phase3",
    products
  };
}

function reasonsFor(id: string, result: ReturnType<typeof match>) {
  return result.rejected.filter((item) => item.productId === id).map((item) => item.reason);
}

describe("matcher phase 3 rejected-candidate reasons", () => {
  it("records oos, foreign_retailer, and not_approved", () => {
    const pending = sku({
      id: "G-PENDING-D3",
      orderable: true,
      status: "pending_review",
      facts: [{ amount: 2000, name: "Vitamin D3", subjectId: "sup_d3", unit: "IU" }],
      price: 1000
    });
    const result = match(
      request(),
      catalog([G_D3_2000, G_OOS, G_FOREIGN, pending])
    );
    assert.deepEqual(reasonsFor("G-OOS-D3-2000", result), ["oos"]);
    assert.deepEqual(reasonsFor("G-FOREIGN-D3", result), ["foreign_retailer"]);
    assert.deepEqual(reasonsFor("G-PENDING-D3", result), ["not_approved"]);
    assert.deepEqual(result.selected?.productIds, ["G-D3-2000"]);
  });

  it("records ul_exceeded for G-HIGH-TRAP", () => {
    const result = match(
      request({ safetyCeilings: qaCatalogSafetyCeilings() }),
      catalog([G_D3_2000, G_HIGH_TRAP])
    );
    assert.deepEqual(reasonsFor("G-HIGH-TRAP", result), ["ul_exceeded"]);
    assert.equal(result.selected?.productIds.includes("G-HIGH-TRAP"), false);
  });

  it("records life_stage for G-PRECARE on a male adult", () => {
    assert.equal(productRejectionReason(G_PRECARE, request()), "life_stage");
    const result = match(request(), catalog([G_D3_2000, G_PRECARE]));
    assert.deepEqual(reasonsFor("G-PRECARE", result), ["life_stage"]);
  });

  it("records wrong_source for fish oil under algae_only", () => {
    const result = match(
      request({
        omega3SourcePreference: "algae_only",
        targets: [omega]
      }),
      catalog([G_O3_FISH])
    );
    assert.deepEqual(reasonsFor("G-O3-FISH-1000", result), ["wrong_source"]);
  });

  it("records vegan for animal collagen", () => {
    const result = match(
      request({
        dietaryPreference: "vegan",
        targets: [target("Collagen", "sup_collagen", 5, "g")]
      }),
      catalog([G_COLLAGEN])
    );
    assert.deepEqual(reasonsFor("G-COLLAGEN-5G", result), ["vegan"]);
  });

  it("records form when the allowed form does not match", () => {
    const result = match(
      request({
        allowedForms: ["tablet"],
        targets: [target("Magnesium", "sup_mag", 200, "mg")]
      }),
      catalog([G_CAPSULE])
    );
    assert.deepEqual(reasonsFor("G-MAG-CAP", result), ["form"]);
  });

  it("records incidental_only when a SKU does not contribute to the target", () => {
    const result = match(request({ targets: [d3] }), catalog([G_D3_2000, G_INCIDENTAL_C]));
    assert.deepEqual(reasonsFor("G-INCIDENTAL-C", result), ["incidental_only"]);
  });

  it("records budget when the SKU alone exceeds maxPriceMinor", () => {
    const result = match(
      request({ maxPriceMinor: 1000, targets: [d3] }),
      catalog([G_D3_2000])
    );
    assert.deepEqual(reasonsFor("G-D3-2000", result), ["budget"]);
    assert.equal(result.selected, null);
  });

  it("records max_pills when one serving exceeds maxDailyPills", () => {
    const heavy = sku({
      id: "G-HEAVY-D3",
      pills: 8,
      facts: [{ amount: 2000, name: "Vitamin D3", subjectId: "sup_d3", unit: "IU" }],
      price: 16000
    });
    const result = match(
      request({ maxDailyPills: 2, targets: [d3] }),
      catalog([heavy])
    );
    assert.deepEqual(reasonsFor("G-HEAVY-D3", result), ["max_pills"]);
  });

  it("bounds the public sample and keeps the full dump off the MCP payload", () => {
    const products = Array.from({ length: 20 }, (_, index) =>
      sku({
        id: `G-OOS-${String(index).padStart(2, "0")}`,
        stock: "unavailable",
        facts: [{ amount: 2000, name: "Vitamin D3", subjectId: "sup_d3", unit: "IU" }],
        price: 1000
      })
    );
    const result = match(request(), catalog([...products, G_D3_2000]));
    const summary = summarizeRejections(result.rejected);
    assert.equal(summary.total >= 20, true);
    assert.equal(summary.sample.length <= PUBLIC_REJECTED_SAMPLE_LIMIT, true);
    assert.equal(summary.counts.oos, 20);

    const plan = publicPlanFields({
      alternatives: [],
      basket: [],
      changeSummary: [],
      coverage: [],
      leftovers: [],
      matcherTelemetry: {
        constraints: { conditionCodes: [], medicationCodes: [] },
        coveragePercent: 100,
        leftovers: [],
        matcherVersion: "pareto-hybrid-1",
        productIds: ["G-D3-2000"],
        productSkus: ["G-D3-2000"],
        rejected: summary,
        rejectedAll: result.rejected,
        requestedDoses: [],
        requestedNames: ["Vitamin D3"],
        selectedOptionId: "opt_test"
      },
      questions: [],
      safetyGuidance: [],
      selected: null,
      status: "needs_input",
      summary: "test",
      unmetRequirements: []
    });
    const encoded = JSON.stringify(plan);
    assert.equal(encoded.includes("rejectedAll"), false);
    const telemetry = (
      plan as { matcherTelemetry?: { rejected?: { sample: unknown[]; total: number } } }
    ).matcherTelemetry;
    assert.ok(telemetry?.rejected);
    assert.equal(telemetry.rejected.total, summary.total);
    assert.equal(telemetry.rejected.sample.length <= PUBLIC_REJECTED_SAMPLE_LIMIT, true);
  });
});
