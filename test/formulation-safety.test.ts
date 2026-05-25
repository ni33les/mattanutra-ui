import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyFormulationSafety,
  formulationSafetyContextReview
} from "../lib/formulation-safety.ts";
import type { FormulationBlueprint } from "../lib/formulation-types.ts";

function fakeSafetySql(supplementRows: unknown[]) {
  const sql = (async (strings: TemplateStringsArray) => {
    const query = strings.join(" ");

    if (query.includes("from public.supplements")) {
      return supplementRows;
    }

    throw new Error(`Unexpected safety SQL in unit test: ${query}`);
  }) as unknown as ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {
    json: (value: unknown) => unknown;
  };

  sql.json = (value: unknown) => value;

  return sql;
}

describe("formulation safety policy", () => {
  it("flags ashwagandha for review in trying-to-conceive context", () => {
    const review = formulationSafetyContextReview({
      answers: {
        reproStatus: "ttc",
        sex: "female"
      },
      safetyFlags: ["hormone_caution"]
    });

    assert.equal(review?.ruleCode, "client_reproductive_context");
    assert.equal(review?.reviewType, "pregnancy_breastfeeding");
    assert.match(review?.reason ?? "", /trying-to-conceive/i);
  });

  it("does not hard-review broad caution flags without matching active risk", () => {
    assert.equal(
      formulationSafetyContextReview({
        answers: {
          antibiotics: "yes",
          digCondition: "none",
          kidney: "normal",
          liver: "normal",
          meds: "none",
          medTypes: ["statin"],
          surgery: "yes"
        },
        safetyFlags: ["condition_caution", "kidney_caution", "medication_interaction"]
      }),
      null
    );
  });

  it("flags blood-thinner interaction context using assessment option values", () => {
    const review = formulationSafetyContextReview({
      answers: {
        meds: "yes",
        medTypes: ["bloodthinner"]
      },
      safetyFlags: ["medication_interaction"]
    });

    assert.equal(review?.ruleCode, "client_medication_context");
    assert.equal(review?.reviewType, "medication_interaction");
  });

  it("does not let AI review status override a whitelisted in-limit supplement", async () => {
    const formulation: FormulationBlueprint = {
      supplementBreakdown: [
        {
          category: "Targeted",
          dailyDose: {
            en: "300 mg/day",
            th: "300 mg/day"
          },
          effectivenessRank: 1,
          id: "ashwagandha",
          rationale: {
            en: "Stress support.",
            th: "Stress support."
          },
          status: "review",
          supplement: {
            en: "Ashwagandha",
            th: "Ashwagandha"
          }
        }
      ]
    };
    const afterCommitEffects: Array<() => Promise<void>> = [];
    const auditEvents: string[] = [];
    const result = await applyFormulationSafety(
      fakeSafetySql([
        {
          aliases: [],
          confidence: "moderate",
          id: "75f265a4-d650-5636-8b9e-985152228887",
          is_active: true,
          list_status: "whitelisted",
          max_amount: 600,
          max_unit: "mg/day",
          name: "Ashwagandha",
          normalized_name: "ashwagandha",
          safety_flags: ["hormone_caution"],
          safety_notes: "Use configured guardrails."
        }
      ]) as never,
      {
        afterCommit: (effect) => {
          afterCommitEffects.push(effect);
        },
        audit: async (event) => {
          auditEvents.push(event.eventType);
        },
        formulation,
        locale: "en",
        plan: "precision",
        planId: "2f8316df-99cd-4f96-b92a-d5cf2d5a1a7a",
        taskId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"
      }
    );
    const [ingredient] = result.supplementBreakdown;

    assert.equal(result.safetySummary?.reviewCount, 0);
    assert.equal(result.safetySummary?.hiddenCount, 0);
    assert.equal(ingredient?.status, "add");
    assert.equal(ingredient?.safety, undefined);
    assert.deepEqual(auditEvents, ["formulation_safety_completed"]);
    assert.equal(afterCommitEffects.length, 1);
  });
});
