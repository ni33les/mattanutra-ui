import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixtureSnapshot, FIXTURE_SUPPLEMENTS } from "../lib/agentic/catalogue/fixtures.ts";
import { matchPlan } from "../lib/agentic/plan/matching.ts";
import { evaluateSafety } from "../lib/agentic/plan/safety.ts";
import { ceilingsForSubjects } from "../lib/agentic/catalogue/supplemental-ul-reference.ts";
import { safetyCeilingFor, setMatcherSafetyCeilings } from "../lib/matcher/safety-ceilings.ts";
import {
  productRejectionReason,
  titleImpliesChildAgeBand,
  titleImpliesSeniorAgeBand
} from "../lib/matcher/eligibility.ts";
import { match } from "../lib/matcher/index.ts";
import { QA_GOLD_CATALOG, qaProduct, qaRequest, qaTarget } from "../lib/matcher/qa/index.ts";

function catalog(products: ReturnType<typeof qaProduct>[]) {
  return {
    availabilityAsOf: "2026-08-25T00:00:00.000Z",
    catalogueVersion: "phase5-demographic",
    products
  };
}

describe("Phase 5 demographic eligibility", () => {
  it("detects 50+ and children's titles without matching 50 mcg doses", () => {
    assert.equal(titleImpliesSeniorAgeBand("Blackmores Multivitamins for 50+"), true);
    assert.equal(titleImpliesSeniorAgeBand("Senior formula 70-plus"), true);
    assert.equal(titleImpliesSeniorAgeBand("Vitamin D3 50 mcg"), false);
    assert.equal(titleImpliesChildAgeBand("Children's chewable D3"), true);
    assert.equal(titleImpliesChildAgeBand("Magnesium glycinate"), false);
  });

  it("does not select a 50+ multi for a 30-year-old pregnant profile", () => {
    const result = match(
      qaRequest({
        optimization: "fewest_pills",
        profile: { ageYears: 30, lifeStage: "pregnant", sex: "female" },
        targets: [
          qaTarget("folate", 400),
          qaTarget("iron", 18),
          qaTarget("iodine", 150),
          qaTarget("d3", 600)
        ]
      }),
      catalog([
        qaProduct({
          facts: [
            { amount: 400, key: "folate" },
            { amount: 18, key: "iron" },
            { amount: 150, key: "iodine" },
            { amount: 600, key: "d3" }
          ],
          id: "G-MULTI-50PLUS",
          pills: 1,
          priceThb: 50,
          title: "Blackmores Multivitamins for 50+"
        }),
        qaProduct({
          audience: "female",
          facts: [
            { amount: 400, key: "folate" },
            { amount: 18, key: "iron" },
            { amount: 150, key: "iodine" },
            { amount: 600, key: "d3" }
          ],
          id: "G-PRECARE",
          pills: 2,
          prenatal: true,
          priceThb: 250,
          title: "G-PRECARE Prenatal"
        })
      ])
    );
    assert.ok(result.selected);
    assert.equal(result.selected.productIds.includes("G-MULTI-50PLUS"), false);
    assert.equal(result.selected.productIds.includes("G-PRECARE"), true);
    assert.ok(
      result.rejected.some(
        (item) => item.reason === "life_stage" && /50\+/.test(item.title)
      )
    );
  });

  it("does not select a 50+ multi for a child", () => {
    const result = match(
      qaRequest({
        profile: { ageYears: 8, lifeStage: "child", sex: "male" },
        targets: [qaTarget("d3", 600)]
      }),
      catalog([
        qaProduct({
          facts: [{ amount: 600, key: "d3" }],
          id: "G-MULTI-50PLUS",
          priceThb: 50,
          title: "Multivitamins for 50+"
        }),
        qaProduct({
          facts: [{ amount: 600, key: "d3" }],
          id: "G-D3-CHILD",
          priceThb: 80,
          title: "Children's Vitamin D3"
        })
      ])
    );
    assert.equal(result.selected?.productIds.includes("G-MULTI-50PLUS"), false);
    assert.ok(result.rejected.some((item) => item.reason === "life_stage"));
  });

  it("still allows a 50+ multi for a 52-year-old adult", () => {
    const product = qaProduct({
      facts: [{ amount: 2000, key: "d3" }],
      id: "G-MULTI-50PLUS",
      priceThb: 220,
      title: "Blackmores Multivitamins for 50+"
    });
    const request = qaRequest({
      profile: { ageYears: 52, lifeStage: "adult", sex: "male" },
      targets: [qaTarget("d3", 2000)]
    });
    assert.equal(productRejectionReason(product, request), null);
  });

  it("persists incidental nutrient amounts and blocks over-UL vitamin A", () => {
    setMatcherSafetyCeilings(
      ceilingsForSubjects([
        ...FIXTURE_SUPPLEMENTS.flatMap((item) => [
          { aliases: item.aliases, id: item.supplementId, name: item.name },
          { aliases: item.aliases, id: item.uuid, name: item.name }
        ]),
        { id: "Vitamin A", name: "Vitamin A" }
      ])
    );
    const snapshot = fixtureSnapshot();
    const d3 = FIXTURE_SUPPLEMENTS.find((item) => item.name === "Vitamin D3");
    assert.ok(d3);
    const withVitaminA = {
      ...snapshot.products.find((item) => /vitamin d3/i.test(item.candidate.title))!,
      candidate: {
        ...snapshot.products.find((item) => /vitamin d3/i.test(item.candidate.title))!.candidate,
        facts: [
          ...(snapshot.products.find((item) => /vitamin d3/i.test(item.candidate.title))!.candidate.facts ?? []),
          {
            amount: 4000,
            comparableAmount: 4000,
            confidence: "high" as const,
            itemType: "supplement" as const,
            name: "Vitamin A",
            normalizedName: "vitamin_a",
            unit: "mcg"
          }
        ]
      }
    };
    const matched = matchPlan({
      snapshot: { ...snapshot, products: [withVitaminA] },
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
        profile: { ageYears: 30, lifeStage: "pregnant", sex: "female" },
        requirements: {},
        safetyAcknowledgement: null,
        targets: [
          {
            amount: 2000,
            name: d3.name,
            supplementId: d3.supplementId,
            unit: "IU"
          }
        ]
      }
    });
    const line = matched.selected?.basket[0];
    const guidance = evaluateSafety({
      locale: "en",
      selected: matched.selected,
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
        profile: { ageYears: 30, lifeStage: "pregnant", sex: "female" },
        requirements: {},
        safetyAcknowledgement: null,
        targets: [
          {
            amount: 2000,
            name: d3.name,
            supplementId: d3.supplementId,
            unit: "IU"
          }
        ]
      }
    });
    const blocked = guidance.some(
      (item) => item.code === "dose_review_required" && item.action === "block"
    );
    assert.equal(matched.selected == null || blocked, true);
    if (line) {
      const vitaminA = line.incidentalNutrients.find((item) => /vitamin a/i.test(item.name));
      assert.ok(vitaminA);
      assert.equal(vitaminA.amount >= 4000, true);
      assert.equal(vitaminA.unit, "mcg");
      assert.equal(blocked, true);
    }
    assert.equal(
      safetyCeilingFor(
        ceilingsForSubjects([{ id: "vitamin-a", name: "Vitamin A" }]),
        {
          name: "Vitamin A",
          profile: { ageYears: 30, lifeStage: "pregnant" },
          subjectId: "vitamin-a"
        }
      )?.maxAmount,
      3000
    );
  });

  it("keeps prenatal G-PRECARE for a pregnant profile on QA-GOLD", () => {
    const result = match(
      qaRequest({
        optimization: "fewest_pills",
        profile: { ageYears: 32, lifeStage: "pregnant", sex: "female" },
        targets: [
          qaTarget("folate", 400),
          qaTarget("iron", 18),
          qaTarget("iodine", 150),
          qaTarget("d3", 600)
        ]
      }),
      QA_GOLD_CATALOG
    );
    assert.ok(result.selected?.productIds.includes("G-PRECARE"));
  });
});
