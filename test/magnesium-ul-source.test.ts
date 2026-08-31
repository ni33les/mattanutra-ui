import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { coverageFor } from "../lib/agentic/plan/matching.ts";
import { publicCoverage } from "../lib/agentic/public-mapper.ts";
import { setMatcherSafetyCeilings } from "../lib/matcher/safety-ceilings.ts";
import type { CanonicalPlanState } from "../lib/agentic/plan/types.ts";

const MAG_NIH_URL =
  "https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/";

describe("magnesium supplemental UL source", () => {
  it("keeps the NIH ODS adult supplemental magnesium UL at 350 mg in the oracle file", () => {
    const oracle = JSON.parse(
      readFileSync("data/nih-ods-supplemental-ul.json", "utf8")
    ) as {
      nutrients: Array<{
        authorityUrl: string;
        bands: Array<{ lifeStage: string; maxAmount: number }>;
        name: string;
      }>;
    };
    const magnesium = oracle.nutrients.find((item) => item.name === "Magnesium");
    assert.ok(magnesium);
    assert.equal(magnesium.authorityUrl, MAG_NIH_URL);
    assert.equal(
      magnesium.bands.find((band) => band.lifeStage === "adult")?.maxAmount,
      350
    );
  });

  it("publishes 350 mg with a supplemental NIH source, not a bare 1100", () => {
    setMatcherSafetyCeilings([
      {
        authorityUrl: MAG_NIH_URL,
        lifeStage: "adult",
        maxAmount: 350,
        maxUnit: "mg",
        name: "Magnesium",
        sourceScope: "supplemental",
        subjectId: "sup_mag"
      }
    ]);
    const state: CanonicalPlanState = {
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
          amount: 150,
          name: "Magnesium",
          supplementId: "sup_mag",
          unit: "mg"
        }
      ]
    };
    const row = coverageFor(state, null)[0];
    assert.ok(row);
    assert.equal(row.upperLimitAmount, 350);
    assert.equal(row.sourceScope, "supplemental");
    assert.equal(row.authorityUrl, MAG_NIH_URL);
    const published = publicCoverage(row);
    assert.equal(published.upperLimitAmount, 350);
    assert.equal(published.sourceScope, "supplemental");
    assert.equal(published.authorityUrl, MAG_NIH_URL);
    assert.notEqual(published.upperLimitAmount, 1100);
  });
});
