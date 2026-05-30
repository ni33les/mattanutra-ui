import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectedFoodSupport } from "../components/formulation-support-helpers.ts";
import type {
  FoodGapSupportItem,
  FormulationResult,
  ProductNeedCoverage,
} from "../lib/formulation-types.ts";

function need(
  id: string,
  displayName: string,
  coveragePercent: number,
): ProductNeedCoverage {
  return {
    bestRejectedProductId: null,
    bestRejectedReason: null,
    coveragePercent,
    displayName,
    id,
    itemType: "supplement",
  };
}

function foodItem(
  foodId: string,
  name: string,
  gapNeedIds: string[],
): FoodGapSupportItem {
  return {
    category: { en: "Food", th: "อาหาร", "zh-CN": "食物" },
    food: { en: name, th: name, "zh-CN": name },
    foodId,
    frequency: {
      en: "3-4 times/week",
      th: "3-4 ครั้งต่อสัปดาห์",
      "zh-CN": "每周 3-4 次",
    },
    gapNeedIds,
    imageAlt: { en: name, th: name, "zh-CN": name },
    imagePath: `/foods/${foodId}.webp`,
    position: 1,
    rationale: {
      en: `${name} supports another stack.`,
      th: `${name} supports another stack.`,
      "zh-CN": `${name} supports another stack.`,
    },
    serving: {
      en: "1 serving",
      th: "1 ส่วน",
      "zh-CN": "1 份",
    },
  };
}

function result(overrides: Partial<FormulationResult> = {}): FormulationResult {
  return {
    access: "full",
    assessmentSummary: {
      constraints: [],
      goals: [],
      plan: "Precision",
      profile: "Example",
      region: "Thailand",
    },
    foodGuidance: [],
    generatedAt: "2026-05-30T00:00:00.000Z",
    planId: "00000000-0000-4000-8000-000000000001",
    recommendations: [],
    schemaVersion: 1,
    sectionStatuses: {
      foods: "ready",
      supplements: "ready",
    },
    supplementBreakdown: [],
    ...overrides,
  };
}

describe("formulation food support", () => {
  it("uses the active product stack gaps instead of stale stored food cards", () => {
    const staleGreenTea = foodItem("green_tea", "Green tea", [
      "supplement:curcumin",
    ]);
    const payload = result({
      foodGapSupport: {
        version: "food-gap:v1",
        variants: {
          balanced: {
            body: { en: "Stored", th: "Stored", "zh-CN": "Stored" },
            headline: { en: "Stored", th: "Stored", "zh-CN": "Stored" },
            items: [staleGreenTea],
          },
          compact: {
            body: { en: "Stored", th: "Stored", "zh-CN": "Stored" },
            headline: { en: "Stored", th: "Stored", "zh-CN": "Stored" },
            items: [staleGreenTea],
          },
        },
      },
    });
    const balancedCoverage = [
      need("supplement:vitamin_d3", "Vitamin D3", 20),
    ];

    const support = selectedFoodSupport(
      payload,
      balancedCoverage,
      "balanced",
    );
    const foodIds = support.items.map((item) => item.foodId);

    assert.equal(support.variant?.items[0]?.foodId, "green_tea");
    assert.ok(foodIds.includes("salmon") || foodIds.includes("sardines"));
    assert.equal(foodIds.includes("green_tea"), false);
  });
});
