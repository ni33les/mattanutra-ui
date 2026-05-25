import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyFoodGuidanceSafety,
  deriveConditionFlags
} from "../lib/food-guidance-safety.ts";
import type { FoodGuidanceBlueprint } from "../lib/formulation-types.ts";

function fakeFoodSafetySql(foodRows: unknown[]) {
  const sql = (async (strings: TemplateStringsArray) => {
    const query = strings.join(" ");

    if (query.includes("from public.foods")) {
      return foodRows;
    }

    throw new Error(`Unexpected food safety SQL in unit test: ${query}`);
  }) as unknown as ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {
    json: (value: unknown) => unknown;
  };

  sql.json = (value: unknown) => value;

  return sql;
}

describe("food guidance safety policy", () => {
  it("does not infer conditions from inactive or stale answer fields", () => {
    assert.deepEqual(
      deriveConditionFlags({
        antibiotics: "yes",
        digCondition: "none",
        family: ["diabetes"],
        kidney: "normal",
        labs: {
          hba1c: "5.3"
        },
        meds: "none",
        medTypes: ["statin"],
        reproStatus: "ttc",
        surgery: "yes"
      }),
      []
    );
  });

  it("derives food interaction flags from explicit active risks", () => {
    assert.deepEqual(
      deriveConditionFlags({
        digCondition: "ibs",
        kidney: "reduced",
        meds: "yes",
        medTypes: ["bloodthinner"],
        reproStatus: "pregnant"
      }).sort(),
      ["digestive", "kidney", "medication_interaction", "pregnancy"].sort()
    );
  });

  it("removes disclosed allergens and avoided foods before storage", async () => {
    const guidance: FoodGuidanceBlueprint = {
      foodGuidance: [
        {
          category: "Fish",
          effectivenessRank: 1,
          food: { en: "Salmon", th: "Salmon" },
          frequency: { en: "Twice weekly", th: "Twice weekly" },
          id: "salmon",
          rationale: { en: "Omega-3 support.", th: "Omega-3 support." },
          serving: { en: "100 g", th: "100 g" },
          status: "add"
        },
        {
          category: "Fermented foods",
          effectivenessRank: 2,
          food: { en: "Kimchi", th: "Kimchi" },
          frequency: { en: "Several times weekly", th: "Several times weekly" },
          id: "kimchi",
          rationale: { en: "Fermented food variety.", th: "Fermented food variety." },
          serving: { en: "Small side", th: "Small side" },
          status: "add"
        },
        {
          category: "Seeds",
          effectivenessRank: 3,
          food: { en: "Chia seeds", th: "Chia seeds" },
          frequency: { en: "Most days", th: "Most days" },
          id: "chia",
          rationale: { en: "Fibre support.", th: "Fibre support." },
          serving: { en: "1 tbsp", th: "1 tbsp" },
          status: "review"
        }
      ]
    };
    const afterCommitEffects: Array<() => Promise<void>> = [];
    const auditEvents: string[] = [];
    const result = await applyFoodGuidanceSafety(
      fakeFoodSafetySql([
        {
          aliases: ["salmon"],
          allergen_flags: ["fish"],
          benefit_tags: ["heart_health"],
          category: "Fish",
          condition_flags: [],
          confidence: "high",
          default_serving: null,
          id: "11111111-1111-4111-8111-111111111111",
          is_active: true,
          list_status: "whitelisted",
          name: "Salmon",
          nutrient_profile: [],
          nutrient_tags: ["omega_3"],
          normalized_name: "salmon",
          safety_notes: null
        },
        {
          aliases: ["kimchi"],
          allergen_flags: [],
          benefit_tags: ["gut_health"],
          category: "Fermented foods",
          condition_flags: [],
          confidence: "moderate",
          default_serving: null,
          id: "22222222-2222-4222-8222-222222222222",
          is_active: true,
          list_status: "whitelisted",
          name: "Kimchi",
          nutrient_profile: [],
          nutrient_tags: ["probiotics"],
          normalized_name: "kimchi",
          safety_notes: null
        },
        {
          aliases: ["chia"],
          allergen_flags: [],
          benefit_tags: ["gut_health", "heart_health"],
          category: "Seeds",
          condition_flags: [],
          confidence: "high",
          default_serving: {
            grams: 12,
            isDefault: true,
            label: "1 tbsp",
            source: "test"
          },
          id: "33333333-3333-4333-8333-333333333333",
          is_active: true,
          list_status: "whitelisted",
          name: "Chia seeds",
          nutrient_profile: [
            {
              amountPer100g: 34.4,
              category: "Macronutrients",
              confidence: "moderate",
              label: "Fiber",
              nutrientId: "fiber_g",
              source: "test",
              unit: "g"
            },
            {
              amountPer100g: 17.8,
              category: "Macronutrients",
              confidence: "moderate",
              label: "Omega-3",
              nutrientId: "omega_3_g",
              source: "test",
              unit: "g"
            }
          ],
          nutrient_tags: ["fiber", "omega_3"],
          normalized_name: "chia_seeds",
          safety_notes: null
        }
      ]) as never,
      {
        afterCommit: (effect) => {
          afterCommitEffects.push(effect);
        },
        answers: {
          foodAllergens: ["fish"],
          foodAvoidances: "kimchi",
          foodSafetyAcknowledged: true
        },
        audit: async (event) => {
          auditEvents.push(event.eventType);
        },
        foodGuidance: guidance,
        locale: "en",
        planId: "2f8316df-99cd-4f96-b92a-d5cf2d5a1a7a",
        taskId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"
      }
    );

    assert.equal(result.foodSafetySummary?.removedCount, 2);
    assert.equal(result.foodSafetySummary?.reviewCount, 0);
    assert.deepEqual(result.foodGuidance.map((item) => item.id), ["chia"]);
    assert.equal(result.foodGuidance[0]?.status, "add");
    assert.deepEqual(result.foodGuidance[0]?.benefitTags, [
      "gut_health",
      "heart_health"
    ]);
    assert.deepEqual(result.foodGuidance[0]?.nutrientTags, ["fiber", "omega_3"]);
    assert.deepEqual(
      result.foodGuidance[0]?.nutrientFacts?.map((fact) => [
        fact.nutrientId,
        fact.amountPerServing
      ]),
      [
        ["fiber_g", 4.13],
        ["omega_3_g", 2.14]
      ]
    );
    assert.deepEqual(auditEvents, [
      "food_guidance_safety_item_removed",
      "food_guidance_safety_item_removed",
      "food_guidance_safety_completed"
    ]);
    assert.equal(afterCommitEffects.length, 3);
  });
});
