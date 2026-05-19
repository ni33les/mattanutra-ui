import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  productFactLooksDirtyForMatching,
  validateProductQuality
} from "../lib/product-quality.ts";

const supplementId = "11111111-1111-4111-8111-111111111111";

describe("product data quality", () => {
  it("passes only image-backed products with canonical dosed facts", () => {
    const quality = validateProductQuality({
      facts: [
        {
          amount: 25,
          itemType: "supplement",
          name: "Vitamin D3",
          supplementId,
          unit: "mcg"
        }
      ],
      imageUrl: "https://example.com/d3.jpg",
      labelStatus: "parsed",
      productUrl: "https://example.com/d3"
    });

    assert.equal(quality.status, "pass");
    assert.equal(quality.matchableFactCount, 1);
  });

  it("rejects concentration rows as matchable doses", () => {
    const quality = validateProductQuality({
      facts: [
        {
          amount: 100000,
          itemType: "supplement",
          name: "Vitamin D3 100000 IU/g",
          supplementId,
          unit: "IU"
        }
      ],
      imageUrl: "https://example.com/d3.jpg",
      labelStatus: "parsed",
      productUrl: "https://example.com/d3"
    });

    assert.equal(
      productFactLooksDirtyForMatching({
        amount: 100000,
        itemType: "supplement",
        name: "Vitamin D3 100000 IU/g",
        supplementId,
        unit: "IU"
      }),
      true
    );
    assert.equal(quality.status, "needs_review");
    assert.equal(quality.reasons.includes("concentration_only"), true);
    assert.equal(quality.matchableFactCount, 0);
  });

  it("keeps source extracts out of matching until they map to canonical actives", () => {
    const quality = validateProductQuality({
      facts: [
        {
          amount: 100,
          itemType: "supplement",
          name: "Curcuma longa extract dry conc",
          unit: "mg"
        }
      ],
      imageUrl: "https://example.com/curcumin.jpg",
      labelStatus: "parsed",
      productUrl: "https://example.com/curcumin"
    });

    assert.equal(quality.status, "needs_review");
    assert.equal(quality.reasons.includes("dirty_name"), true);
    assert.equal(quality.reasons.includes("no_canonical_match"), true);
  });

  it("requires product images before approval quality can pass", () => {
    const quality = validateProductQuality({
      facts: [
        {
          amount: 100,
          itemType: "supplement",
          name: "CoQ10",
          supplementId,
          unit: "mg"
        }
      ],
      imageUrl: null,
      labelStatus: "parsed",
      productUrl: "https://example.com/coq10"
    });

    assert.equal(quality.status, "needs_review");
    assert.equal(quality.reasons.includes("missing_image"), true);
  });

  it("treats canonical vitamin E IU as a usable dosed fact", () => {
    const quality = validateProductQuality({
      facts: [
        {
          amount: 250,
          itemType: "supplement",
          maxAmount: 1000,
          maxUnit: "mg alpha-tocopherol/day",
          name: "Vitamin E",
          normalizedName: "vitamin_e",
          supplementId,
          unit: "IU"
        }
      ],
      imageUrl: "https://example.com/vitamin-e.jpg",
      labelStatus: "failed",
      productUrl: "https://example.com/vitamin-e"
    });

    assert.equal(quality.status, "pass");
    assert.equal(quality.matchableFactCount, 1);
  });

  it("treats canonical probiotic billion CFU rows as usable dosed facts", () => {
    const quality = validateProductQuality({
      facts: [
        {
          amount: 2.3,
          itemType: "supplement",
          maxAmount: 10,
          maxUnit: "billion CFU/day",
          name: "Multi-strain probiotics",
          normalizedName: "probiotics",
          supplementId,
          unit: "billion CFU"
        }
      ],
      imageUrl: "https://example.com/probiotics.jpg",
      labelStatus: "failed",
      productUrl: "https://example.com/probiotics"
    });

    assert.equal(quality.status, "pass");
    assert.equal(quality.matchableFactCount, 1);
  });
});
