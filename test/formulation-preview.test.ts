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

  it("keeps only the top three visible supplements and filters products", () => {
    const preview = toFreePreviewFormulationResult(baseResult);

    assert.equal(preview.access, "preview");
    assert.equal(preview.previewLimit, 3);
    assert.equal(preview.totalSupplementCount, 4);
    assert.equal(preview.lockedSupplementCount, 1);
    assert.deepEqual(
      preview.supplementBreakdown.map((ingredient) => ingredient.id).sort(),
      ["ashwagandha", "magnesium", "omega3"]
    );
    assert.deepEqual(preview.recommendations, [
      {
        ...baseResult.recommendations[0],
        covers: ["magnesium", "ashwagandha", "omega3"]
      }
    ]);
  });
});
