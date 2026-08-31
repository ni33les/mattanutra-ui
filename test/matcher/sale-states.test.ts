import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { match } from "../../lib/matcher/index.ts";
import { scaleAmount } from "../../lib/matcher/dose.ts";
import { productRejectionReason } from "../../lib/matcher/eligibility.ts";
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
    throw new Error("dose scale failed");
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
  facts: ReadonlyArray<{
    amount: number;
    name: string;
    subjectId: string;
    unit: string;
  }>;
  id: string;
  orderable?: boolean;
  pills?: number;
  price: number;
  status?: MatcherProduct["status"];
  title?: string;
}): MatcherProduct {
  return {
    availableCountryCodes: ["TH"],
    contributionSubjectIds: [...new Set(input.facts.map((item) => item.subjectId))],
    currency: "THB",
    dailyPillsPerServing: input.pills ?? 1,
    dietarySource: "any",
    form: "tablet",
    imageUrl: null,
    incompleteCommercialFacts: false,
    labelledContributions: input.facts.map((item) => ({
      amount: item.amount,
      name: item.name,
      subjectId: item.subjectId,
      unit: item.unit
    })),
    omegaSource: "none",
    orderable: input.orderable ?? input.status !== "pending_review",
    prenatalOrFertility: false,
    productAudience: "both",
    productId: input.id,
    retailerSku: input.id,
    sellerId: "seller_th",
    sellerName: "TH",
    source: "fixture",
    status: input.status ?? "approved",
    stockStatus: "in_stock",
    title: input.title ?? input.id,
    unknownSafetyAmount: false,
    unitPriceMinor: input.price
  };
}

const d3 = target("Vitamin D3", "sup_d3", 1000, "IU");

function request(): CanonicalRequest {
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
    targets: [d3]
  };
}

const dedicated = sku({
  facts: [{ amount: 1000, name: "Vitamin D3", subjectId: "sup_d3", unit: "IU" }],
  id: "prd_d3_1000",
  pills: 1,
  price: 44100,
  title: "Blackmores Vitamin D3 1000 IU"
});
const joint = sku({
  facts: [
    { amount: 10, name: "Vitamin D3", subjectId: "sup_d3", unit: "mcg" },
    { amount: 50, name: "Vitamin C", subjectId: "sup_c", unit: "mg" }
  ],
  id: "prd_joint",
  pills: 3,
  price: 145500,
  title: "Blackmores Joint Mobility Plus"
});
const leftover = sku({
  facts: [{ amount: 1000, name: "Vitamin D3", subjectId: "sup_d3", unit: "IU" }],
  id: "prd_pending_d3",
  orderable: true,
  price: 10000,
  status: "pending_review",
  title: "Leftover pending D3"
});

describe("matcher sale states", () => {
  it("rejects a pending leftover even when it is priced and in stock", () => {
    assert.equal(productRejectionReason(leftover, request()), "not_approved");
    const result = match(request(), {
      availabilityAsOf: "2026-01-01T00:00:00.000Z",
      catalogueVersion: "sale-states",
      products: [leftover, dedicated]
    });
    assert.deepEqual(
      result.rejected.filter((item) => item.productId === leftover.productId).map((item) => item.reason),
      ["not_approved"]
    );
    assert.equal(result.selected?.productIds.includes(dedicated.productId), true);
    assert.equal(result.selected?.productIds.includes(leftover.productId), false);
  });

  it("picks dedicated approved D3 over Joint Mobility", () => {
    const result = match(request(), {
      availabilityAsOf: "2026-01-01T00:00:00.000Z",
      catalogueVersion: "sale-states",
      products: [dedicated, joint]
    });
    assert.equal(result.selected?.productIds.includes(dedicated.productId), true);
    assert.equal(result.selected?.productIds.includes(joint.productId), false);
  });
});
