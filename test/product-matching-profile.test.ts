import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildProductMatchingProfile } from "../lib/product-matching-profile.ts";

type MatchingProfileInput = Parameters<typeof buildProductMatchingProfile>[0];
type MatchingProfileFact = MatchingProfileInput["facts"][number];

function productFact(
  overrides: Partial<MatchingProfileFact>,
): MatchingProfileFact {
  return {
    aliasKeys: [],
    amount: null,
    comparableAmount: null,
    confidence: "high",
    id: crypto.randomUUID(),
    itemType: "supplement",
    maxAmount: null,
    maxUnit: null,
    name: "",
    normalizedName: "",
    safetyFlags: [],
    source: "admin",
    sourceText: null,
    sourceUrl: null,
    supplementId: null,
    supplementStatus: null,
    unit: null,
    ...overrides,
  };
}

function productRow(facts: MatchingProfileFact[]): MatchingProfileInput {
  return { facts } as MatchingProfileInput;
}

describe("product matching profile", () => {
  it("groups EPA and DHA into an omega-3 matcher row", () => {
    const rows = buildProductMatchingProfile(
      productRow([
        productFact({
          aliasKeys: [
            "omega_3",
            "epa",
            "dha",
            "eicosapentaenoic_acid",
            "docosahexaenoic_acid",
          ],
          amount: 80,
          id: "epa",
          name: "EPA",
          normalizedName: "epa",
          unit: "mg",
        }),
        productFact({
          aliasKeys: [
            "omega_3",
            "epa",
            "dha",
            "eicosapentaenoic_acid",
            "docosahexaenoic_acid",
          ],
          amount: 100,
          id: "dha",
          name: "DHA",
          normalizedName: "dha",
          unit: "mg",
        }),
      ]),
    );
    const omega = rows.find((row) => row.id === "aggregate:omega_3");

    assert.ok(omega);
    assert.equal(omega.displayName, "Omega-3");
    assert.equal(omega.normalizedKey, "omega_3");
    assert.equal(omega.amountLabel, "180 mg");
    assert.equal(omega.comparableAmount, 180_000);
    assert.deepEqual(omega.sourceNames, ["DHA", "EPA"]);
    assert.equal(omega.status, "aggregate");
  });

  it("marks concentration-only and undosed facts as not matchable", () => {
    const rows = buildProductMatchingProfile(
      productRow([
        productFact({
          amount: 100,
          id: "concentration",
          name: "Magnesium 100 mg/g extract",
          normalizedName: "magnesium 100 mg/g extract",
          unit: "mg",
        }),
        productFact({
          id: "undosed",
          name: "Zinc",
          normalizedName: "zinc",
        }),
      ]),
    );
    const concentration = rows.find((row) => row.id === "concentration");
    const undosed = rows.find((row) => row.id === "undosed");

    assert.equal(concentration?.status, "not_matchable");
    assert.equal(concentration?.statusLabel, "Concentration-only");
    assert.equal(undosed?.status, "not_matchable");
    assert.equal(undosed?.statusLabel, "Missing dose");
  });

  it("includes supplement identity for canonical supplement matches", () => {
    const rows = buildProductMatchingProfile(
      productRow([
        productFact({
          amount: 10,
          id: "probiotics",
          name: "Probiotics",
          normalizedName: "probiotics",
          supplementId: "supplement-probiotics",
          supplementStatus: "active",
          unit: "billion CFU",
        }),
      ]),
    );
    const probiotics = rows.find((row) => row.id === "probiotics");

    assert.equal(probiotics?.displayName, "Probiotics");
    assert.equal(probiotics?.normalizedKey, "probiotics");
    assert.equal(probiotics?.supplementId, "supplement-probiotics");
    assert.equal(probiotics?.supplementStatus, "active");
    assert.equal(probiotics?.status, "matchable");
  });
});
