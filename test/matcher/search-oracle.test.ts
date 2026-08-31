import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { match } from "../../lib/matcher/index.ts";
import { scaleAmount } from "../../lib/matcher/dose.ts";
import { publicCoveragePercent } from "../../lib/matcher/explainer.ts";
import type {
  CanonicalRequest,
  CanonicalTarget,
  MatcherProduct
} from "../../lib/matcher/types.ts";

function target(
  name: string,
  subjectId: string,
  amount: number,
  unit: "IU" | "mg"
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
  name: string;
  subjectId: string;
  amount: number;
  unit: string;
  price: number;
  status?: MatcherProduct["status"];
}): MatcherProduct {
  return {
    availableCountryCodes: ["TH"],
    contributionSubjectIds: [input.subjectId],
    currency: "THB",
    dailyPillsPerServing: 1,
    dietarySource: "any",
    form: "capsule",
    imageUrl: null,
    incompleteCommercialFacts: false,
    labelledContributions: [
      {
        amount: input.amount,
        name: input.name,
        subjectId: input.subjectId,
        unit: input.unit
      }
    ],
    omegaSource: "none",
    orderable: input.status !== "pending_review",
    prenatalOrFertility: false,
    productAudience: "both",
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

describe("matcher search oracle", () => {
  it("design §13: pending-review E is excluded and B+D dominates A+B+C", () => {
    const d3 = target("Vitamin D3", "sup_d3", 2000, "IU");
    const omega = target("Omega-3", "sup_omega", 1000, "mg");
    const mag = target("Magnesium", "sup_mag", 200, "mg");
    const request: CanonicalRequest = {
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
      profile: { ageYears: 38, lifeStage: "adult", sex: "female" },
      retainProductIds: [],
      retainSubjectIds: [],
      selectorMode: "agentic",
      targets: [d3, omega, mag]
    };
    const catalog = {
      availabilityAsOf: "2026-01-01T00:00:00.000Z",
      catalogueVersion: "oracle-1",
      products: [
        sku({ id: "A", name: "Vitamin D3", subjectId: "sup_d3", amount: 2000, unit: "IU", price: 39000 }),
        sku({ id: "B", name: "Omega-3", subjectId: "sup_omega", amount: 1000, unit: "mg", price: 89000 }),
        sku({ id: "C", name: "Magnesium", subjectId: "sup_mag", amount: 300, unit: "mg", price: 49000 }),
        {
          ...sku({
            id: "D",
            name: "Vitamin D3",
            subjectId: "sup_d3",
            amount: 2000,
            unit: "IU",
            price: 82000
          }),
          labelledContributions: [
            { amount: 2000, name: "Vitamin D3", subjectId: "sup_d3", unit: "IU" },
            { amount: 300, name: "Magnesium", subjectId: "sup_mag", unit: "mg" }
          ],
          contributionSubjectIds: ["sup_d3", "sup_mag"]
        },
        sku({
          id: "E",
          name: "Omega-3",
          subjectId: "sup_omega",
          amount: 1000,
          unit: "mg",
          price: 50000,
          status: "pending_review"
        })
      ]
    };
    const result = match(request, catalog);
    assert.ok(result.selected);
    assert.equal(result.selected?.productIds.includes("E"), false);
    assert.equal(publicCoveragePercent(result.selected), 100);
    assert.deepEqual(result.selected?.productIds, ["B", "D"]);
    assert.equal(result.selected?.priceMinor, 171000);
  });

  it("nets current D3 intake before selecting another product", () => {
    const d3 = target("Vitamin D3", "sup_d3", 2000, "IU");
    const current = scaleAmount({
      amount: 1000,
      subjectId: "sup_d3",
      subjectName: "Vitamin D3",
      unit: "IU"
    });
    assert.equal("reason" in current, false);
    if ("reason" in current) {
      throw new Error(current.message);
    }
    const request: CanonicalRequest = {
      acceptedGapSubjectIds: [],
      allowedForms: null,
      conditionCodes: [],
      currency: "THB",
      currentSupplements: [
        {
          daily: current,
          dailyAmount: 1000,
          name: "Vitamin D3",
          sourceId: "current-d3",
          subjectId: "sup_d3",
          unit: "IU"
        }
      ],
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
      targets: [d3]
    };
    const catalog = {
      availabilityAsOf: "2026-01-01T00:00:00.000Z",
      catalogueVersion: "netting-1",
      products: [
        sku({
          id: "G-D3-1000",
          name: "Vitamin D3",
          subjectId: "sup_d3",
          amount: 1000,
          unit: "IU",
          price: 10000
        }),
        sku({
          id: "G-D3-1800",
          name: "Vitamin D3",
          subjectId: "sup_d3",
          amount: 1800,
          unit: "IU",
          price: 12000
        })
      ]
    };
    const result = match(request, catalog);
    assert.ok(result.selected);
    assert.deepEqual(result.selected?.productIds, ["G-D3-1000"]);
    assert.equal(publicCoveragePercent(result.selected), 100);
  });

  it("does not count powder servings as pills", () => {
    const creatine = target("Creatine", "sup_creatine", 5, "mg");
    const request: CanonicalRequest = {
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
      profile: { ageYears: 30, lifeStage: "adult", sex: "male" },
      retainProductIds: [],
      retainSubjectIds: [],
      selectorMode: "agentic",
      targets: [creatine]
    };
    const powder = sku({
      id: "G-CREATINE-5G",
      name: "Creatine",
      subjectId: "sup_creatine",
      amount: 5,
      unit: "mg",
      price: 15000
    });
    const result = match(request, {
      availabilityAsOf: "2026-01-01T00:00:00.000Z",
      catalogueVersion: "powder-1",
      products: [{ ...powder, form: "powder", dailyPillsPerServing: 1 }]
    });
    assert.ok(result.selected);
    assert.equal(result.selected?.dailyPills, 0);
  });
});
