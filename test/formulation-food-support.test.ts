import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  localizedSupplementName,
  selectedFoodSupport,
  visibleSupplementRecommendationCount,
} from "../components/formulation-support-helpers.ts";
import type {
  FoodGapSupportItem,
  FormulationResult,
  ProductNeedCoverage,
  RecommendedProduct,
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

function product(id: string): RecommendedProduct {
  return {
    covers: [id],
    description: `Product for ${id}`,
    id: `product-${id}`,
    marketplace: "Imported product",
    name: `Product ${id}`,
    priority: 1,
    tag: "Matched",
    url: "https://example.com/product",
  };
}

function supplement(
  id: string,
  hidden = false,
): FormulationResult["supplementBreakdown"][number] {
  return {
    category: "Targeted",
    dailyDose: "100 mg/day",
    effectivenessRank: Number(id.replace(/\D/g, "")) || 1,
    id,
    rationale: `Supports ${id}.`,
    ...(hidden
      ? {
          safety: {
            action: "human_review" as const,
            message: "Needs review",
            visibility: "hidden" as const,
          },
        }
      : {}),
    status: hidden ? "review" : "add",
    supplement: `Supplement ${id}`,
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
  it("counts visible supplement rows instead of product rows or locked totals", () => {
    const payload = result({
      lockedSupplementCount: 3,
      recommendations: ["s1", "s2", "s3", "s4", "s5"].map(product),
      supplementBreakdown: [
        supplement("s1"),
        supplement("s2"),
        supplement("s3"),
        supplement("s4"),
        supplement("s5"),
        supplement("s6"),
        supplement("s7-hidden", true),
      ],
      totalSupplementCount: 7,
    });

    assert.equal(visibleSupplementRecommendationCount(payload), 6);
  });

  it("falls back to English when Thai supplement names are missing or numbered placeholders", () => {
    assert.equal(
      localizedSupplementName({ en: "Magnesium glycinate", th: "" }, "sup-1", "th"),
      "Magnesium glycinate",
    );
    assert.equal(
      localizedSupplementName(
        { en: "Zinc", th: "ingredient number 9" },
        "sup-2",
        "th",
      ),
      "Zinc",
    );
    assert.equal(
      localizedSupplementName({ en: "Omega-3", th: "ส่วนผสมที่ 9" }, "sup-3", "th"),
      "Omega-3",
    );
  });

  it("lets formulation AI choose a supplement count within the intended range", async () => {
    const source = await readFile("lib/formulation-analysis.ts", "utf8");

    assert.match(source, /rank every supplement that is clearly effective and needed/);
    assert.match(source, /complete ranked set of assessment-justified items, usually 6 to 12/);
    assert.match(source, /return the top 12 by expected impact and safety fit/);
    assert.match(source, /Eight is acceptable only when exactly eight/);
    assert.doesNotMatch(source, /targetSupplementCount/);
    assert.doesNotMatch(source, /supplementBreakdown must contain 6 to 18 items/);
  });

  it("does not expose implementation fallback copy in the reveal empty state", async () => {
    const [reveal, copy] = await Promise.all([
      readFile("components/reveal-final-results.tsx", "utf8"),
      readFile("components/formulation-reveal-copy.ts", "utf8"),
    ]);

    assert.doesNotMatch(
      `${reveal}\n${copy}`,
      /Food cards are shown only when the selected stack leaves a supportable formula gap/,
    );
    assert.doesNotMatch(reveal, /foodSupportEmpty/);
    assert.match(reveal, /finalCopy\.foodEmptyTitle/);
    assert.match(reveal, /finalCopy\.foodEmptyBody/);
    assert.match(reveal, /\{foodCards\.length > 0 \? \(/);
    assert.doesNotMatch(reveal, /copy\.foodSupportPendingHeadline/);
    assert.doesNotMatch(
      reveal,
      /items\.length < 1 \? \([\s\S]*copy\.foodSupportNoGapsHeadline[\s\S]*copy\.foodSupportNoGapsBody[\s\S]*\) : \(/,
    );
  });

  it("uses active formula requirements instead of stale stored food cards", () => {
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
      need("supplement:vitamin_d3", "Vitamin D3", 100),
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
