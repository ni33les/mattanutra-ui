import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildExampleEmailHtml,
  buildExampleEmailSubject
} from "../lib/example-email.ts";
import {
  buildReassessmentEmailHtml,
  buildReassessmentEmailSubject
} from "../lib/reassessment-email.ts";
import type { FormulationBlueprint } from "../lib/formulation-types.ts";
import type { HealthScoreResult } from "../lib/health-score.ts";

const healthScore: HealthScoreResult = {
  band: "Good",
  domains: [
    {
      description: "Nutrition consistency",
      id: "nutrition",
      label: "Nutrition",
      score: 62
    }
  ],
  headline: "Good foundations",
  movers: [],
  score: 74,
  summary: "A steady wellness base."
};

const formulation: FormulationBlueprint = {
  marketingPoints: [
    {
      body: {
        en: "Your full plan explains why each suggestion belongs in your routine.",
        th: "แผนฉบับเต็มอธิบายว่าทำไมแต่ละคำแนะนำจึงเหมาะกับกิจวัตรของคุณ"
      },
      id: "routine-fit",
      title: {
        en: "Built around your routine",
        th: "ออกแบบตามกิจวัตรของคุณ"
      }
    }
  ],
  supplementBreakdown: [
    {
      category: "Targeted",
      dailyDose: { en: "200 mg/day", th: "200 mg/วัน" },
      effectivenessRank: 1,
      id: "magnesium",
      rationale: {
        en: "Supports calm evening routines.",
        th: "ช่วยสนับสนุนกิจวัตรช่วงเย็นที่สงบขึ้น"
      },
      status: "add",
      supplement: { en: "Magnesium", th: "แมกนีเซียม" }
    }
  ]
};

describe("example email", () => {
  it("renders formulation marketing points in the free preview email", () => {
    const html = buildExampleEmailHtml({
      formulation,
      healthScore,
      locale: "en",
      planId: "11111111-1111-4111-8111-111111111111"
    });

    assert.match(html, /Why open the full plan/);
    assert.match(html, /Built around your routine/);
    assert.match(html, /Your full plan explains why each suggestion belongs/);
  });

  it("renders the free preview email in Simplified Chinese without English fallback copy", () => {
    const html = buildExampleEmailHtml({
      formulation,
      healthScore: {
        ...healthScore,
        domains: [
          {
            description: "营养一致性",
            id: "nutrition",
            label: "营养",
            score: 62
          }
        ],
        summary: "稳定的健康基础。"
      },
      locale: "zh-CN",
      planId: "11111111-1111-4111-8111-111111111111"
    });

    assert.equal(buildExampleEmailSubject("zh-CN", healthScore), "您的 74/100 HealthScore 预览");
    assert.match(html, /为什么打开完整计划/);
    assert.match(html, /查看完整计划/);
    assert.match(html, /为您优先排序/);
    assert.match(html, /letter-spacing:0;text-transform:none/);
    assert.doesNotMatch(html, /Why open the full plan/);
    assert.doesNotMatch(html, /View the full plan/);
    assert.doesNotMatch(html, /Built around your routine/);
    assert.doesNotMatch(html, /[\u0E00-\u0E7F]/);
  });

  it("renders reassessment emails in Simplified Chinese", () => {
    const html = buildReassessmentEmailHtml({
      locale: "zh-CN",
      planId: "11111111-1111-4111-8111-111111111111",
      unsubscribeToken: "token"
    });

    assert.equal(buildReassessmentEmailSubject("zh-CN"), "复评您的 MattaNutra HealthScore");
    assert.match(html, /查看过去 60 天发生了什么变化/);
    assert.match(html, /重新评估/);
    assert.match(html, /letter-spacing:0;text-transform:none/);
    assert.doesNotMatch(html, /See what changed over the last 60 days/);
    assert.doesNotMatch(html, /Take the reassessment/);
    assert.doesNotMatch(html, /[\u0E00-\u0E7F]/);
  });
});
