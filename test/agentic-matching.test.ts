import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixtureSnapshot } from "../lib/agentic/catalogue/fixtures.ts";
import type { CatalogueProduct } from "../lib/agentic/catalogue/types.ts";
import {
  inferOmegaSource,
  isNonAlgaeOmegaStandin,
  isPrenatalOrFertilitySku,
  supplementNameMatchesFact
} from "../lib/agentic/catalogue/product-fit.ts";
import { matchPlan } from "../lib/agentic/plan/matching.ts";
import type { CanonicalPlanState } from "../lib/agentic/plan/types.ts";

function withTitle(product: CatalogueProduct, title: string, audience?: "both" | "female" | "male") {
  return {
    ...product,
    candidate: {
      ...product.candidate,
      productAudience: audience ?? product.candidate.productAudience,
      title
    },
    productId: `prd_${title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24)}`
  };
}

function stateFor(product: CatalogueProduct, overrides: Partial<CanonicalPlanState> = {}): CanonicalPlanState {
  return {
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
    profile: { ageYears: 52, lifeStage: "adult", sex: "male" },
    requirements: {},
    safetyAcknowledgement: null,
    targets: [
      {
        amount: 400,
        name: "Folate",
        supplementId: product.contributionSupplementIds[0]!,
        unit: "mcg"
      }
    ],
    ...overrides
  };
}

describe("agentic live-catalogue matching constraints", () => {
  it("classifies Conceive Well as prenatal and Super Omega 3-6-9 as a non-algae omega stand-in", () => {
    assert.equal(
      isPrenatalOrFertilitySku({ title: "Blackmores Conceive Well Gold", facts: [] }),
      true
    );
    assert.equal(
      isNonAlgaeOmegaStandin({ title: "Super Omega 3-6-9", facts: [] }),
      true
    );
    assert.equal(
      inferOmegaSource({
        automatedSafetyPassed: true,
        availabilityStatus: "in_stock",
        currency: "THB",
        facts: [],
        id: "dha",
        labelStatus: "parsed",
        platform: "manual",
        productUrl: "https://example.test/dha",
        region: "TH",
        title: "Blackmores Omega DHA"
      }),
      "fish"
    );
    assert.equal(inferOmegaSource({
      automatedSafetyPassed: true,
      availabilityStatus: "in_stock",
      currency: "THB",
      facts: [{ amount: 80, comparableAmount: 80, confidence: "high", itemType: "supplement", name: "Omega 3-6-9", normalizedName: "omega_3_6_9", unit: "mg" }],
      id: "x",
      labelStatus: "parsed",
      platform: "manual",
      productUrl: "https://example.test/x",
      region: "TH",
      title: "Super Omega 3-6-9"
    }), "fish");
    assert.equal(
      supplementNameMatchesFact("omega 3", "omega 3 6 9", {
        automatedSafetyPassed: true,
        availabilityStatus: "in_stock",
        currency: "THB",
        facts: [],
        id: "x",
        labelStatus: "parsed",
        platform: "manual",
        productUrl: "https://example.test/x",
        region: "TH",
        title: "Super Omega 3-6-9"
      }),
      false
    );
  });

  it("does not select a prenatal SKU for a 52-year-old man", () => {
    const snapshot = fixtureSnapshot();
    const donor =
      snapshot.products.find((item) => /folate|folic/i.test(item.candidate.title)) ??
      snapshot.products[0]!;
    const prenatal = withTitle(donor, "Blackmores Conceive Well Gold", "female");
    const matched = matchPlan({
      snapshot: {
        ...snapshot,
        products: [...snapshot.products, prenatal]
      },
      state: stateFor(prenatal)
    });
    const names = (matched.selected?.basket ?? []).map((item) => item.productName);
    assert.equal(names.some((name) => /conceive|prenatal|fertility/i.test(name)), false);
  });

  it("does not select Super Omega 3-6-9 or lecithin under algae_only", () => {
    const snapshot = fixtureSnapshot();
    const algae = snapshot.products.find((item) => item.omegaSource === "algae");
    assert.ok(algae);
    const mixed = {
      ...withTitle(algae, "Super Omega 3-6-9"),
      omegaSource: "none" as const,
      unitPriceMinor: 100
    };
    const lecithin = {
      ...withTitle(algae, "Soy Lecithin 1200 mg"),
      omegaSource: "none" as const,
      unitPriceMinor: 200
    };
    const fishDha = {
      ...withTitle(algae, "Blackmores Omega DHA"),
      omegaSource: "none" as const,
      unitPriceMinor: 150
    };
    const matched = matchPlan({
      snapshot: {
        ...snapshot,
        products: [...snapshot.products, mixed, lecithin, fishDha]
      },
      state: {
        ...stateFor(algae, {
          requirements: { omega3SourcePreference: "algae_only" },
          targets: [
            {
              amount: 1000,
              name: "Omega-3",
              supplementId: algae.contributionSupplementIds[0]!,
              unit: "mg"
            }
          ]
        })
      }
    });
    const names = (matched.selected?.basket ?? []).map((item) => item.productName);
    assert.ok(names.some((name) => /algae/i.test(name)));
    assert.equal(names.some((name) => /3-6-9|lecithin|fish oil|omega dha/i.test(name)), false);
  });

  it("matches each retailer separately and keeps one seller in the basket", () => {
    const snapshot = fixtureSnapshot();
    const folate =
      snapshot.products.find((item) => /folate|folic/i.test(item.candidate.title)) ??
      snapshot.products[0]!;
    const zinc =
      snapshot.products.find((item) => /zinc/i.test(item.candidate.title)) ??
      snapshot.products[1]!;
    const retailerA = "org_a";
    const retailerB = "org_b";
    const aFolate = {
      ...folate,
      sellerId: retailerA,
      sellerName: "Retailer A",
      unitPriceMinor: 90000,
      candidate: {
        ...folate.candidate,
        selectedRetailerOrganisationId: retailerA,
        selectedRetailerName: "Retailer A"
      }
    };
    const aZinc = {
      ...zinc,
      sellerId: retailerA,
      sellerName: "Retailer A",
      candidate: {
        ...zinc.candidate,
        selectedRetailerOrganisationId: retailerA,
        selectedRetailerName: "Retailer A"
      }
    };
    const bFolate = {
      ...folate,
      sellerId: retailerB,
      sellerName: "Retailer B",
      unitPriceMinor: 20000,
      candidate: {
        ...folate.candidate,
        id: `${folate.candidate.id}-b`,
        selectedRetailerOrganisationId: retailerB,
        selectedRetailerName: "Retailer B",
        unitPriceAmount: 200
      }
    };
    const folateOnly = matchPlan({
      snapshot: { ...snapshot, products: [aFolate, aZinc, bFolate] },
      state: stateFor(folate)
    });
    const folateSellers = new Set(
      (folateOnly.selected?.basket ?? []).map((item) => item.sellerId)
    );
    assert.equal(folateSellers.size, 1);
    assert.equal([...folateSellers][0], retailerB);

    const both = matchPlan({
      snapshot: { ...snapshot, products: [aFolate, aZinc, bFolate] },
      state: stateFor(folate, {
        targets: [
          {
            amount: 400,
            name: "Folate",
            supplementId: folate.contributionSupplementIds[0]!,
            unit: "mcg"
          },
          {
            amount: 25,
            name: "Zinc",
            supplementId: zinc.contributionSupplementIds[0]!,
            unit: "mg"
          }
        ]
      })
    });
    const bothSellers = new Set((both.selected?.basket ?? []).map((item) => item.sellerId));
    assert.equal(bothSellers.size, 1);
    assert.equal([...bothSellers][0], retailerA);
  });
});
