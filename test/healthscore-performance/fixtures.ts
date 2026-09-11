import assert from "node:assert/strict";
import { computeHealthScore } from "../../lib/health-score.ts";
import type { Locale } from "../../lib/i18n.ts";

export const answers = {
  age: "36-45", sex: "male", country: "Thailand", goals: ["energy", "fitness"],
  diet: "balanced", activity: "light", sleepHrs: "6-7", stress: "high",
  energy: "low", sun: "15-30", sunscreen: "daily", meds: "yes", medTypes: ["statin"]
};

export const formulaInput = {
  answers, locale: "en" as const, plan: "precision" as const,
  planId: "00000000-0000-4000-8000-000000000001",
  canonicalSupplements: [{
    aliases: ["Cholecalciferol", "Vitamin D"], category: "Vitamins", id: "d3",
    listStatus: "active", maxAmount: 100, maxUnit: "mcg", name: "Vitamin D3",
    normalizedName: "vitamin-d3", safetyFlags: ["kidney_caution"],
    safetyNotes: "Account for existing intake."
  }]
};

export const formulaResponse = {
  supplementBreakdown: [{ id: "vitamin-d3", category: "Foundation", supplement: "Vitamin D3",
    dailyDose: "25 mcg/day", decision: "Review total intake.", effectivenessRank: 1,
    rationale: "Supports your stated goals.", whyThisIsForYou: "Your outdoor routine informs this proposal.",
    status: "add" as const, cautions: [] }],
  cautions: [],
  marketingPoints: ["Routine", "Context", "Clarity"].map((title, index) => ({
    id: `point-${index}`, title, body: "Your plan reflects the answers you supplied."
  }))
};

export function healthFixture(locale: Locale = "en") {
  const healthScore = computeHealthScore(answers, locale);
  const seeds = healthScore.pageContent?.copySeeds;
  assert.ok(seeds, "A complete deterministic page is required");
  return {
    input: { answers, healthScore, locale, cache: false },
    response: { pageCopy: {
      bandLine: seeds.bandLine, heroBody: seeds.heroBody,
      heroTitle: { en: "You came here for energy and fitness.", th: "คุณมาที่นี่เพื่อพลังงานและความแข็งแรง", "zh-CN": "您希望提升精力和体能。" }[locale],
      findingsHeadline: seeds.findingsHeadline, findingsSub: seeds.findingsSub,
      findings: seeds.findings.map(({ headline, body }) => ({ headline, body })),
      gapTrio: seeds.gapTrio.map(({ headline, body }) => ({ headline, body })),
      highestLeverageBody: seeds.highestLeverage?.text ?? seeds.pillarHeadline,
      methodCards: seeds.methodCards.map(({ title, body }) => ({ title, body })),
      methodHeadline: seeds.methodHeadline, pillarHeadline: seeds.pillarHeadline,
      relativityHeadline: seeds.relativity.headline, relativitySub: seeds.relativity.sub,
      strengthNote: seeds.strengthNote ?? seeds.pillarHeadline, subtractionBody: seeds.subtraction.body
    } }
  };
}
