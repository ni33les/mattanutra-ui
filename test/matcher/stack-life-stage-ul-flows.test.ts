import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { matchPlan } from "../../lib/agentic/plan/matching.ts";
import type { CatalogueProduct, CatalogueSnapshot } from "../../lib/agentic/catalogue/types.ts";
import { recommendWithMatcher } from "../../lib/matcher/adapters/web.ts";
import {
  DEFAULT_MATCHER_CONFIG,
  WEB_COMPACT_MATCHER_CONFIG,
  WEB_MATCHER_CONFIG
} from "../../lib/matcher/config.ts";
import { match } from "../../lib/matcher/index.ts";
import {
  QA_GOLD_CATALOG,
  qaCatalogSafetyCeilings,
  qaRequest,
  qaTarget
} from "../../lib/matcher/qa/index.ts";
import { qaProduct } from "../../lib/matcher/qa/product.ts";
import {
  resetMatcherSafetyCeilings,
  setMatcherSafetyCeilings
} from "../../lib/matcher/safety-ceilings.ts";
import type { MatcherConfig } from "../../lib/matcher/types.ts";
import {
  recommendProductStack,
  recommendProductStackFullBeam
} from "../../lib/product-recommendations.ts";
import type {
  ProductCandidate,
  ProductRecommendationNeed
} from "../../lib/product-recommendation-types.ts";

const MULTI_ID = "MULTI-ZN-30";
const D3_ID = "D3-ZN-20";

function zincStackProducts() {
  return [
    qaProduct({
      facts: [
        { amount: 200, key: "mag" },
        { amount: 30, key: "zinc" }
      ],
      id: MULTI_ID,
      priceThb: 180
    }),
    qaProduct({
      facts: [
        { amount: 2000, key: "d3" },
        { amount: 20, key: "zinc" }
      ],
      id: D3_ID,
      priceThb: 170
    })
  ];
}

function zincStackCatalog() {
  return {
    ...QA_GOLD_CATALOG,
    products: [...QA_GOLD_CATALOG.products, ...zincStackProducts()]
  };
}

function zincStackRequest() {
  return qaRequest({
    maxProductCount: 2,
    targets: [qaTarget("mag", 200), qaTarget("d3", 2000)]
  });
}

function selectedIds(value: readonly string[] | undefined) {
  return value ?? [];
}

function assertStackRespectsZincUl(ids: readonly string[], label: string) {
  assert.equal(
    ids.includes(MULTI_ID) && ids.includes(D3_ID),
    false,
    `${label} selected both ${MULTI_ID} and ${D3_ID}`
  );
}

function webCandidate(input: Readonly<{
  facts: ReadonlyArray<{ amount: number; name: string; normalizedName: string; unit: string }>;
  id: string;
  title: string;
}>): ProductCandidate {
  return {
    automatedSafetyPassed: true,
    availabilityStatus: "in_stock",
    availableCountryCodes: ["TH"],
    brandStatus: "approved",
    currency: "THB",
    facts: input.facts.map((fact) => ({
      amount: fact.amount,
      comparableAmount: fact.amount,
      confidence: "high" as const,
      itemType: "supplement" as const,
      name: fact.name,
      normalizedName: fact.normalizedName,
      unit: fact.unit
    })),
    id: input.id,
    labelStatus: "parsed",
    platform: "manual",
    priceAmount: 350,
    productAudience: "both",
    productUrl: `https://example.com/${input.id}`,
    region: "TH",
    retailAvailabilityStatus: "available_now",
    selectedRetailerName: "Delight Pharmacy",
    selectedRetailerOrganisationId: "delight",
    status: "approved",
    title: input.title,
    unitPriceAmount: 350
  };
}

function webNeed(input: Readonly<{
  amount: number;
  displayName: string;
  id: string;
  normalizedName: string;
  unit: string;
}>): ProductRecommendationNeed {
  return {
    aliasKeys: [input.normalizedName],
    category: "Foundation",
    displayName: input.displayName,
    id: input.id,
    itemType: "supplement",
    normalizedName: input.normalizedName,
    sourceId: input.id,
    targetComparableAmount: input.amount,
    targetDose: `${input.amount} ${input.unit}`,
    targetText: `${input.amount} ${input.unit}`,
    weight: 1
  };
}

function webZincStackInput() {
  return {
    candidates: [
      webCandidate({
        facts: [
          { amount: 200, name: "Magnesium", normalizedName: "magnesium", unit: "mg" },
          { amount: 30, name: "Zinc", normalizedName: "zinc", unit: "mg" }
        ],
        id: MULTI_ID,
        title: "Multi with 30 mg zinc"
      }),
      webCandidate({
        facts: [
          { amount: 2000, name: "Vitamin D3", normalizedName: "vitamin_d3", unit: "IU" },
          { amount: 20, name: "Zinc", normalizedName: "zinc", unit: "mg" }
        ],
        id: D3_ID,
        title: "D3 with 20 mg zinc"
      })
    ],
    clientContext: { ageYears: 40, lifestage: "adult" },
    clientSex: "female" as const,
    countryCode: "TH",
    maxProducts: 2,
    needs: [
      webNeed({
        amount: 200,
        displayName: "Magnesium",
        id: "supplement:magnesium",
        normalizedName: "magnesium",
        unit: "mg"
      }),
      webNeed({
        amount: 2000,
        displayName: "Vitamin D3",
        id: "supplement:vitamin-d3",
        normalizedName: "vitamin_d3",
        unit: "IU"
      })
    ]
  };
}

function catalogueProductFromCandidate(candidate: ProductCandidate): CatalogueProduct {
  const facts = candidate.facts.map((fact) => fact.normalizedName);
  return {
    audience: "adult",
    candidate,
    contributionSupplementIds: [...new Set(facts)],
    dailyPills: 1,
    dietarySource: "any",
    form: "capsule",
    incompleteCommercialFacts: false,
    omegaSource: "none",
    orderable: true,
    productId: candidate.id,
    retailerSku: candidate.id,
    sellerId: candidate.selectedRetailerOrganisationId ?? "delight",
    sellerName: candidate.selectedRetailerName ?? "Delight Pharmacy",
    source: "retail",
    stockStatus: "in_stock",
    unitPriceMinor: Math.round((candidate.unitPriceAmount ?? 350) * 100)
  };
}

function zincStackSnapshot(): CatalogueSnapshot {
  const products = webZincStackInput().candidates.map(catalogueProductFromCandidate);
  return {
    availabilityAsOf: new Date(0).toISOString(),
    catalogueVersion: "stack-ul-test",
    products,
    supplements: []
  };
}

describe("life-stage stack UL on every live matching flow", () => {
  it("refuses the over-UL zinc combo in exact, web, compact, and beam search", () => {
    const catalog = zincStackCatalog();
    const request = zincStackRequest();
    const beamConfig: MatcherConfig = {
      ...DEFAULT_MATCHER_CONFIG,
      exactGroupLimit: 0,
      exactVariantLimit: 0
    };

    for (const [label, config] of [
      ["default", DEFAULT_MATCHER_CONFIG],
      ["web", WEB_MATCHER_CONFIG],
      ["web-compact", WEB_COMPACT_MATCHER_CONFIG],
      ["forced-beam", beamConfig]
    ] as const) {
      assertStackRespectsZincUl(
        selectedIds(match(request, catalog, config).selected?.productIds),
        label
      );
    }
  });

  it("refuses the over-UL zinc combo on the quiz/web adapter and FullBeam", () => {
    setMatcherSafetyCeilings(qaCatalogSafetyCeilings());
    try {
      const input = webZincStackInput();
      for (const [label, result] of [
        ["recommendWithMatcher-balanced", recommendWithMatcher({ ...input, stackPreference: "balanced" })],
        ["recommendWithMatcher-compact", recommendWithMatcher({ ...input, stackPreference: "compact" })],
        ["recommendProductStackFullBeam", recommendProductStackFullBeam(input)],
        ["recommendProductStack", recommendProductStack(input)]
      ] as const) {
        assertStackRespectsZincUl(
          result.recommendations.map((row) => row.product.id),
          label
        );
      }
    } finally {
      resetMatcherSafetyCeilings();
    }
  });

  it("refuses the over-UL zinc combo on the agentic matchPlan rail", () => {
    setMatcherSafetyCeilings(qaCatalogSafetyCeilings());
    try {
      const matched = matchPlan({
        snapshot: zincStackSnapshot(),
        state: {
          acceptedGaps: [],
          conditionCodes: [],
          currency: "THB",
          currentSupplements: [],
          destinationCountry: "TH",
          leftovers: [],
          locale: "en",
          medicationCodes: [],
          optimization: "balanced",
          pinnedOptionId: null,
          profile: { ageYears: 40, lifeStage: "adult", sex: "female" },
          requirements: { maxProductCount: 2 },
          safetyAcknowledgement: null,
          targets: [
            { amount: 200, name: "Magnesium", supplementId: "magnesium", unit: "mg" },
            { amount: 2000, name: "Vitamin D3", supplementId: "vitamin_d3", unit: "IU" }
          ]
        }
      });
      assertStackRespectsZincUl(
        (matched.selected?.basket ?? []).map((item) => item.productId),
        "matchPlan"
      );
    } finally {
      resetMatcherSafetyCeilings();
    }
  });

  it("wires every live caller through tryAddVariant stack UL", () => {
    const search = readFileSync(new URL("../../lib/matcher/search.ts", import.meta.url), "utf8");
    const index = readFileSync(new URL("../../lib/matcher/index.ts", import.meta.url), "utf8");
    const selector = readFileSync(new URL("../../lib/matcher/selector.ts", import.meta.url), "utf8");
    const web = readFileSync(new URL("../../lib/matcher/adapters/web.ts", import.meta.url), "utf8");
    const plan = readFileSync(new URL("../../lib/agentic/plan/matching.ts", import.meta.url), "utf8");
    const recs = readFileSync(new URL("../../lib/product-recommendations.ts", import.meta.url), "utf8");
    const execution = readFileSync(new URL("../../lib/task-execution.ts", import.meta.url), "utf8");
    const coverage = readFileSync(
      new URL("../../lib/admin-product-coverage-simulation.ts", import.meta.url),
      "utf8"
    );

    assert.match(search, /stackUnitsViolateCeiling/);
    assert.match(search, /labelledSafetyExposure/);
    assert.match(search, /for \(const variant of group\.variants\) \{\s*const next = tryAddVariant/);
    assert.match(index, /tryAddVariant/);
    assert.match(selector, /tryAddVariant/);
    assert.match(web, /const result = match\(/);
    assert.match(plan, /const result = match\(request/);
    assert.match(recs, /return recommendWithMatcher\(input\)/);
    assert.match(recs, /export function recommendProductStack\(/);
    assert.match(recs, /return recommendProductStackFullBeam\(input\)/);
    assert.match(execution, /recommendProductStackFullBeam\(/);
    assert.doesNotMatch(execution, /recommendProductStackV2\(/);
    assert.match(coverage, /recommendProductStackFullBeam\(/);
    assert.doesNotMatch(coverage, /recommendProductStackV2\(/);
  });
});
