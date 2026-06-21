import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { productMatchesSearch } from "@/lib/admin-product-search";
import type { AdminProductRow } from "@/lib/admin-products";

function product(input: Readonly<{
  aliasKeys?: string[];
  brandName?: string | null;
  factName: string;
  normalizedName?: string;
  sourceText?: string | null;
  title?: string;
}>): AdminProductRow {
  return {
    brandName: input.brandName ?? "Blackmores",
    category: "Supplement",
    facts: [
      {
        aliasKeys: input.aliasKeys ?? [],
        confidence: "high",
        itemType: "supplement",
        name: input.factName,
        normalizedName: input.normalizedName ?? input.factName.toLowerCase(),
        source: "test",
        sourceText: input.sourceText ?? null
      }
    ],
    labelStatus: "parsed",
    platform: "manual",
    productAudience: "both",
    productKind: "supplement",
    region: "TH",
    regulatoryApprovals: [
      {
        agencyCode: "TH_FDA",
        agencyName: "Thai FDA",
        approvalNumber: "TEST-123",
        approvalType: "product_registration",
        createdAt: null,
        evidenceUrl: null,
        id: "approval-1",
        metadata: {},
        productId: null,
        scopeCode: "TH",
        scopeType: "country",
        source: "test",
        status: "verified",
        updatedAt: null
      }
    ],
    status: "approved",
    title: input.title ?? "Test Product",
    translations: {},
    validationLabel: "Approved"
  } as unknown as AdminProductRow;
}

describe("admin product search", () => {
  it("matches supplement ingredient aliases", () => {
    const row = product({
      aliasKeys: ["ashwagandha", "withania_somnifera"],
      factName: "Ashwagandha Root Extract"
    });

    assert.equal(productMatchesSearch(row, "ashwagandha"), true);
    assert.equal(productMatchesSearch(row, "withania"), true);
  });

  it("matches curcumin and turmeric-style aliases", () => {
    const row = product({
      aliasKeys: ["curcumin", "turmeric_extract", "curcuma_longa"],
      factName: "Curcumin"
    });

    assert.equal(productMatchesSearch(row, "curcumin"), true);
    assert.equal(productMatchesSearch(row, "turmeric"), true);
  });

  it("treats punctuation, spaces, hyphens, and underscores as equivalent", () => {
    const theanine = product({
      aliasKeys: ["theanine", "l_theanine"],
      factName: "Theanine"
    });
    const glutamine = product({
      aliasKeys: ["l_glutamine", "glutamine"],
      factName: "Glutamine"
    });
    const magnesium = product({
      aliasKeys: ["magnesium_glycinate"],
      factName: "Magnesium Glycinate"
    });

    assert.equal(productMatchesSearch(theanine, "L-Theanine"), true);
    assert.equal(productMatchesSearch(theanine, "l theanine"), true);
    assert.equal(productMatchesSearch(theanine, "theanine"), true);
    assert.equal(productMatchesSearch(glutamine, "L-Glutamine"), true);
    assert.equal(productMatchesSearch(glutamine, "l glutamine"), true);
    assert.equal(productMatchesSearch(glutamine, "glutamine"), true);
    assert.equal(productMatchesSearch(magnesium, "magnesium glycinate"), true);
    assert.equal(productMatchesSearch(magnesium, "magnesium_glycinate"), true);
  });

  it("keeps product and brand search working across fields", () => {
    const row = product({
      aliasKeys: ["omega_3", "fish_oil"],
      brandName: "Swisse",
      factName: "Fish Oil",
      title: "Swisse Ultiboost Fish Oil"
    });

    assert.equal(productMatchesSearch(row, "swisse omega 3"), true);
    assert.equal(productMatchesSearch(row, "approved manual"), true);
    assert.equal(productMatchesSearch(row, "Thai FDA TEST-123"), true);
    assert.equal(productMatchesSearch(row, "centrum omega"), false);
  });
});
