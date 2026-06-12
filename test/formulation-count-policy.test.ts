import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeFormulationSupplementCount,
  normalizeVisibleFormulationSupplementCount,
  targetSupplementBreakdownCount,
  visibleSupplementBreakdownCount
} from "../lib/formulation-count-policy.ts";
import type {
  FormulationBlueprint,
  FormulationIngredient
} from "../lib/formulation-types.ts";

function ingredient(index: number, hidden = false): FormulationIngredient {
  return {
    category: "Targeted",
    dailyDose: "100 mg/day",
    effectivenessRank: index,
    id: `supplement-${index}`,
    rationale: `Supports priority ${index}.`,
    ...(hidden
      ? {
          safety: {
            action: "human_review" as const,
            message: "Needs review",
            visibility: "hidden" as const
          }
        }
      : {}),
    status: hidden ? "review" : "add",
    supplement: `Supplement ${index}`
  };
}

function formulation(count: number, hiddenIndexes: number[] = []): FormulationBlueprint {
  const hidden = new Set(hiddenIndexes);

  return {
    supplementBreakdown: Array.from({ length: count }, (_, index) =>
      ingredient(index + 1, hidden.has(index + 1))
    )
  };
}

describe("formulation count policy", () => {
  it("varies the target count by assessment complexity without returning the static eight-count shape", () => {
    const simple = {
      budget: "1000-2500",
      energy: "good",
      foodFrequency: {
        dairy: "3+",
        eggs: "3+",
        fish: "3+",
        fruitveg: "3+",
        legumes: "3+",
        redmeat: "3+"
      },
      goals: ["sleep"],
      labs: {},
      maxPills: "4-6",
      sleepHrs: "7-8",
      stress: "low",
      symptoms: ["great"]
    };
    const broad = {
      activity: "sitting",
      budget: "5000+",
      energy: "low",
      family: ["heart", "diabetes"],
      foodFrequency: {
        dairy: "never",
        eggs: "1-2",
        fish: "never",
        fruitveg: "1-2",
        legumes: "never",
        redmeat: "1-2"
      },
      goals: ["energy", "sleep", "fitness"],
      hrv: "35",
      labs: {
        b12: "360",
        ferritin: "35",
        hba1c: "5.8",
        homo: "12",
        o3: "4.1",
        vitd: "24"
      },
      maxPills: "nolimit",
      sleepHrs: "5-6",
      stress: "high",
      symptoms: ["fatigue", "brainfog", "sleep", "stress", "joints"],
      tracker: "garmin",
      vo2: "32"
    };
    const constrained = {
      ...broad,
      antibiotics: "yes",
      budget: "1000-2500",
      maxPills: "4-6",
      meds: "yes",
      medTypes: ["statin"],
      surgery: "yes"
    };

    const simpleCount = targetSupplementBreakdownCount(simple);
    const broadCount = targetSupplementBreakdownCount(broad);
    const constrainedCount = targetSupplementBreakdownCount(constrained);

    assert.notEqual(simpleCount, 8);
    assert.notEqual(broadCount, 8);
    assert.notEqual(constrainedCount, 8);
    assert.ok(simpleCount < broadCount);
    assert.ok(constrainedCount < broadCount);
  });

  it("prunes an eight-item model default to the assessment target and renumbers ranks", () => {
    const result = normalizeFormulationSupplementCount(formulation(8), 7);

    assert.equal(result.supplementBreakdown.length, 7);
    assert.deepEqual(
      result.supplementBreakdown.map((item) => item.effectivenessRank),
      [1, 2, 3, 4, 5, 6, 7]
    );
  });

  it("keeps post-safety visible rows from collapsing back to eight", () => {
    const result = normalizeVisibleFormulationSupplementCount(
      formulation(9, [9]),
      9
    );

    assert.equal(visibleSupplementBreakdownCount(result.supplementBreakdown), 7);
    assert.equal(
      result.supplementBreakdown.some(
        (item) => item.safety?.visibility === "hidden"
      ),
      true
    );
  });
});
