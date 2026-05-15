import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isExampleFormulationModelVersion,
  toFreePreviewFormulationResult
} from "../lib/formulation-preview.ts";
import type { FormulationResult } from "../lib/formulation-types.ts";

const baseResult: FormulationResult = {
  access: "full",
  assessmentSummary: {
    constraints: [],
    goals: ["Energy"],
    plan: "Precision Plan",
    profile: "Adult",
    region: "Thailand"
  },
  generatedAt: "2026-05-14T00:00:00.000Z",
  foodGuidance: [
    {
      category: "Seeds",
      effectivenessRank: 2,
      food: "Chia seeds",
      frequency: "4 times weekly",
      id: "chia",
      rationale: "Supports fibre intake",
      serving: "1 tbsp",
      status: "add"
    },
    {
      category: "Pulses",
      effectivenessRank: 1,
      food: "Lentils",
      frequency: "3 times weekly",
      id: "lentils",
      rationale: "Supports steady energy",
      serving: "1/2 cup cooked",
      status: "add"
    },
    {
      category: "Tea",
      effectivenessRank: 3,
      food: "Green tea",
      frequency: "Most days",
      id: "green-tea",
      rationale: "Supports antioxidants",
      serving: "1 cup",
      status: "add"
    },
    {
      category: "Fruit",
      effectivenessRank: 4,
      food: "Papaya",
      frequency: "2 times weekly",
      id: "papaya",
      rationale: "Supports micronutrients",
      serving: "1 small bowl",
      status: "add"
    }
  ],
  planId: "320d09b2-128f-4a83-b937-7345f4bc3280",
  recommendations: [
    {
      covers: ["magnesium", "ashwagandha", "omega3"],
      description: "Bundle",
      id: "bundle",
      marketplace: "Lazada Thailand",
      name: "Starter bundle",
      priority: 1,
      tag: "Best match",
      url: "https://example.com/bundle"
    },
    {
      covers: ["locked"],
      description: "Locked item",
      id: "locked-product",
      marketplace: "Shopee Thailand",
      name: "Locked product",
      priority: 2,
      tag: "Later",
      url: "https://example.com/locked"
    }
  ],
  schemaVersion: 1,
  supplementBreakdown: [
    {
      category: "Mineral",
      dailyDose: "200 mg/day",
      effectivenessRank: 2,
      id: "magnesium",
      rationale: "Supports sleep",
      status: "add",
      supplement: "Magnesium"
    },
    {
      category: "Botanical",
      dailyDose: "300 mg/day",
      effectivenessRank: 1,
      id: "ashwagandha",
      rationale: "Supports stress",
      status: "add",
      supplement: "Ashwagandha"
    },
    {
      category: "Fatty acid",
      dailyDose: "1000 mg/day",
      effectivenessRank: 3,
      id: "omega3",
      rationale: "Supports inflammation",
      status: "add",
      supplement: "Omega-3"
    },
    {
      category: "Vitamin",
      dailyDose: "1000 IU/day",
      effectivenessRank: 4,
      id: "locked",
      rationale: "Locked rationale",
      status: "add",
      supplement: "Vitamin D"
    },
    {
      category: "Review",
      dailyDose: "100 mg/day",
      effectivenessRank: 5,
      id: "hidden",
      rationale: "Hidden rationale",
      safety: {
        action: "human_review",
        message: "Needs review",
        visibility: "hidden"
      },
      status: "review",
      supplement: "Hidden"
    }
  ]
};

describe("free formulation preview", () => {
  it("recognizes example formulation model versions", () => {
    assert.equal(isExampleFormulationModelVersion("grok-4.3:example"), true);
    assert.equal(isExampleFormulationModelVersion("grok-4.3"), false);
    assert.equal(isExampleFormulationModelVersion(null), false);
  });

  it("keeps the top three supplements and filters products", () => {
    const preview = toFreePreviewFormulationResult(baseResult);

    assert.equal(preview.access, "preview");
    assert.equal(preview.previewLimit, 3);
    assert.equal(preview.totalSupplementCount, 5);
    assert.equal(preview.lockedSupplementCount, 2);
    assert.equal(preview.totalFoodCount, 4);
    assert.equal(preview.lockedFoodCount, 1);
    assert.deepEqual(
      preview.supplementBreakdown.map((ingredient) => ingredient.id).sort(),
      ["ashwagandha", "magnesium", "omega3"]
    );
    assert.deepEqual(
      preview.foodGuidance.map((food) => food.id).sort(),
      ["chia", "green-tea", "lentils"]
    );
    assert.deepEqual(preview.recommendations, [
      {
        ...baseResult.recommendations[0],
        covers: ["magnesium", "ashwagandha", "omega3"]
      }
    ]);
  });
});
