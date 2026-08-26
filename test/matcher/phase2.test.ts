import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIXTURE_SUPPLEMENTS } from "../../lib/agentic/catalogue/fixtures.ts";
import {
  impliedOmegaPreference,
  targetImpliesAlgaeOmega
} from "../../lib/matcher/canonicalizer.ts";
import { match } from "../../lib/matcher/index.ts";
import { scaleAmount } from "../../lib/matcher/dose.ts";
import { publicCoveragePercent } from "../../lib/matcher/explainer.ts";
import { productEligible } from "../../lib/matcher/eligibility.ts";
import { compareBaskets, selectOptions } from "../../lib/matcher/selector.ts";
import { productKeysMatch } from "../../lib/product-key-matching.ts";
import type {
  CanonicalRequest,
  CanonicalTarget,
  MatcherProduct,
  MatcherUnit,
  ScoredBasket
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
    throw new Error("reason" in requested ? requested.message : "dose");
  }
  return {
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
  status?: MatcherProduct["status"];
  facts: ReadonlyArray<{
    amount: number;
    name: string;
    subjectId: string;
    unit: string;
  }>;
  price: number;
}): MatcherProduct {
  return {
    availableCountryCodes: ["TH"],
    contributionSubjectIds: [...new Set(input.facts.map((item) => item.subjectId))],
    currency: "THB",
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
    orderable: true,
    prenatalOrFertility: input.prenatal ?? false,
    productAudience: input.audience ?? "both",
    productId: input.id,
    retailerSku: input.id,
    sellerId: "seller_th",
    sellerName: "TH",
    source: "fixture",
    status: input.status ?? "approved",
    stockStatus: "in_stock",
    title: input.id,
    unknownSafetyAmount: false,
    unitPriceMinor: input.price
  };
}

const d3 = target("Vitamin D3", "sup_d3", 2000, "IU");
const omega = target("Omega-3", "sup_omega", 1000, "mg");
const mag = target("Magnesium", "sup_mag", 200, "mg");
const b12 = target("Vitamin B12", "sup_b12", 250, "mcg");
const vitC = target("Vitamin C", "sup_c", 500, "mg");

const G_D3_2000 = sku({
  id: "G-D3-2000",
  facts: [{ amount: 2000, name: "Vitamin D3", subjectId: "sup_d3", unit: "IU" }],
  price: 16000
});
const G_O3_FISH_1000 = sku({
  id: "G-O3-FISH-1000",
  pills: 2,
  form: "softgel",
  omega: "fish",
  dietary: "fish",
  facts: [{ amount: 1000, name: "Omega-3", subjectId: "sup_omega", unit: "mg" }],
  price: 30000
});
const G_O3_ALGAE_500 = sku({
  id: "G-O3-ALGAE-500",
  form: "softgel",
  omega: "algae",
  dietary: "algae",
  facts: [{ amount: 500, name: "Algae omega-3", subjectId: "sup_omega", unit: "mg" }],
  price: 26000
});
const G_MAG_200 = sku({
  id: "G-MAG-200",
  form: "capsule",
  facts: [{ amount: 200, name: "Magnesium", subjectId: "sup_mag", unit: "mg" }],
  price: 12000
});
const G_B12_250 = sku({
  id: "G-B12-250",
  facts: [{ amount: 250, name: "Vitamin B12", subjectId: "sup_b12", unit: "mcg" }],
  price: 9000
});
const G_C_500 = sku({
  id: "G-C-500",
  facts: [{ amount: 500, name: "Vitamin C", subjectId: "sup_c", unit: "mg" }],
  price: 10000
});
const G_BASE_COMBO = sku({
  id: "G-BASE-COMBO",
  pills: 2,
  form: "capsule",
  facts: [
    { amount: 2000, name: "Vitamin D3", subjectId: "sup_d3", unit: "IU" },
    { amount: 200, name: "Magnesium", subjectId: "sup_mag", unit: "mg" },
    { amount: 250, name: "Vitamin B12", subjectId: "sup_b12", unit: "mcg" },
    { amount: 500, name: "Vitamin C", subjectId: "sup_c", unit: "mg" }
  ],
  price: 35000
});
const G_HIGH_TRAP = sku({
  id: "G-HIGH-TRAP",
  facts: [
    { amount: 5000, name: "Vitamin D3", subjectId: "sup_d3", unit: "IU" },
    { amount: 600, name: "Magnesium", subjectId: "sup_mag", unit: "mg" },
    { amount: 1000, name: "Vitamin B12", subjectId: "sup_b12", unit: "mcg" },
    { amount: 1500, name: "Vitamin C", subjectId: "sup_c", unit: "mg" }
  ],
  price: 5000
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
const G_PRECARE = sku({
  id: "G-PRECARE",
  pills: 2,
  prenatal: true,
  audience: "female",
  facts: [
    { amount: 400, name: "Folate", subjectId: "sup_folate", unit: "mcg" },
    { amount: 18, name: "Iron", subjectId: "sup_iron", unit: "mg" },
    { amount: 150, name: "Iodine", subjectId: "sup_iodine", unit: "mcg" },
    { amount: 600, name: "Vitamin D3", subjectId: "sup_d3", unit: "IU" }
  ],
  price: 25000
});

const GOLD_PRODUCTS = [
  G_D3_2000,
  G_O3_FISH_1000,
  G_O3_ALGAE_500,
  G_MAG_200,
  G_B12_250,
  G_C_500,
  G_BASE_COMBO,
  G_HIGH_TRAP,
  G_INCIDENTAL_C,
  G_PRECARE
];

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
    optimization: "fewest_pills",
    profile: { ageYears: 52, lifeStage: "adult", sex: "male" },
    retainProductIds: [],
    retainSubjectIds: [],
    selectorMode: "agentic",
    targets: [d3, omega, mag, b12, vitC],
    ...overrides
  };
}

function catalog(products: readonly MatcherProduct[] = GOLD_PRODUCTS) {
  return {
    availabilityAsOf: "2026-01-01T00:00:00.000Z",
    catalogueVersion: "qa-gold-phase2",
    products
  };
}

function emptySafety() {
  return { findings: [], hardBlocked: false, requiresAck: false };
}

function scored(overrides: Partial<ScoredBasket> & { productIds: readonly string[] }): ScoredBasket {
  return {
    aggregateCoverage: 10_000,
    coverageBySubject: new Map(),
    coveredCount: 5,
    dailyPills: 4,
    dedicatedPartialCount: 0,
    exposure: { provenance: [], totals: new Map() },
    incidentalCount: 0,
    oversupplyScore: 0,
    priceMinor: 65000,
    productCount: overrides.productIds.length,
    reason: "",
    requestedLabelCount: 0,
    titleExactCount: 0,
    safety: emptySafety(),
    sellerId: "seller_th",
    variantIds: [],
    ...overrides
  };
}

describe("matcher phase 2 oversupply, source, and ontology", () => {
  it("M-01 fewest_pills selects G-BASE-COMBO + G-O3-FISH-1000", () => {
    const result = match(request({ optimization: "fewest_pills" }), catalog());
    assert.ok(result.selected);
    assert.deepEqual(result.selected?.productIds, ["G-BASE-COMBO", "G-O3-FISH-1000"]);
    assert.equal(result.selected?.productCount, 2);
    assert.equal(result.selected?.dailyPills, 4);
    assert.equal(publicCoveragePercent(result.selected), 100);
    assert.equal(result.selected?.productIds.includes("G-HIGH-TRAP"), false);
    assert.equal(result.selected?.incidentalCount, 0);
  });

  it("M-02 lowest_cost does not select G-HIGH-TRAP", () => {
    const result = match(request({ optimization: "lowest_cost" }), catalog());
    assert.ok(result.selected);
    assert.equal(result.selected?.productIds.includes("G-HIGH-TRAP"), false);
    assert.equal(publicCoveragePercent(result.selected) >= 90, true);
  });

  it("M-20 prefers G-C-500 over incidental collagen+C", () => {
    const result = match(
      request({
        optimization: "lowest_cost",
        targets: [vitC]
      }),
      catalog([G_C_500, G_INCIDENTAL_C])
    );
    assert.ok(result.selected);
    assert.deepEqual(result.selected?.productIds, ["G-C-500"]);
    assert.equal(result.selected?.productIds.includes("G-INCIDENTAL-C"), false);
  });

  it("fewest_pills ranks 4-pill combo ahead of an 8-SKU pile at the same coverage", () => {
    const combo = scored({
      productIds: ["G-BASE-COMBO", "G-O3-FISH-1000"],
      dailyPills: 4,
      priceMinor: 65000
    });
    const pile = scored({
      productIds: [
        "A",
        "B",
        "C",
        "D",
        "E",
        "F",
        "G",
        "H"
      ],
      dailyPills: 8,
      priceMinor: 40000,
      incidentalCount: 6,
      oversupplyScore: 40_000
    });
    const picked = selectOptions({
      baskets: [pile, combo],
      request: request({ optimization: "fewest_pills" })
    });
    assert.deepEqual(picked.selected?.productIds, combo.productIds);
    assert.equal(
      compareBaskets(combo, pile, request({ optimization: "fewest_pills" })) < 0,
      true
    );
  });

  it("E-02 algae-named omega-3 does not select fish oil", () => {
    const algaeTarget = target("Algae omega-3", "sup_omega", 500, "mg");
    const result = match(
      request({
        optimization: "best_coverage",
        omega3SourcePreference: impliedOmegaPreference("any", "any", [algaeTarget.name]),
        targets: [algaeTarget]
      }),
      catalog([G_O3_FISH_1000, G_O3_ALGAE_500])
    );
    assert.ok(result.selected);
    assert.deepEqual(result.selected?.productIds, ["G-O3-ALGAE-500"]);
    assert.equal(result.selected?.productIds.includes("G-O3-FISH-1000"), false);
  });

  it("algae-named targets imply algae_only unless vegan already did", () => {
    assert.equal(targetImpliesAlgaeOmega("Algae omega-3"), true);
    assert.equal(targetImpliesAlgaeOmega("Algal DHA"), true);
    assert.equal(targetImpliesAlgaeOmega("Omega-3"), false);
    assert.equal(impliedOmegaPreference("any", "any", ["Algae omega-3"]), "algae_only");
    assert.equal(impliedOmegaPreference("any", "fish_allowed", ["Algae omega-3"]), "algae_only");
    assert.equal(impliedOmegaPreference("any", "any", ["Omega-3"]), "any");
    assert.equal(impliedOmegaPreference("vegan", "any", ["Omega-3"]), "algae_only");
    assert.equal(impliedOmegaPreference("any", "algae_only", ["Omega-3"]), "algae_only");
  });

  it("K2 / MK-7 / menaquinone-7 map to one canonical supplement", () => {
    const k2 = FIXTURE_SUPPLEMENTS.find((item) => item.name === "Vitamin K2");
    assert.ok(k2);
    assert.ok(k2.aliases.some((alias) => /mk-?7/i.test(alias)));
    assert.ok(k2.aliases.some((alias) => /menaquinone/i.test(alias)));
    assert.equal(productKeysMatch("Vitamin K2", "MK-7"), true);
    assert.equal(productKeysMatch("Vitamin K2", "Menaquinone-7"), true);
    assert.equal(productKeysMatch("MK7", "menaquinone-7"), true);
  });

  it("male adult request excludes G-PRECARE", () => {
    const male = request({
      optimization: "best_coverage",
      targets: [d3]
    });
    assert.equal(productEligible(G_PRECARE, male), false);
    const result = match(male, catalog([G_D3_2000, G_PRECARE]));
    assert.ok(result.selected);
    assert.deepEqual(result.selected?.productIds, ["G-D3-2000"]);
    assert.equal(result.selected?.productIds.includes("G-PRECARE"), false);
  });
});
