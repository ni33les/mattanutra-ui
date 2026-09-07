import { computeHealthScore, type HealthScoreResult } from "../../lib/health-score.ts";
import type { Locale } from "../../lib/i18n.ts";
export function completeHealthScoreFixture(locale: Locale = "en"): HealthScoreResult & { pageContent: NonNullable<HealthScoreResult["pageContent"]> } {
  const score = computeHealthScore({ sex: "male", age: "36-45", goals: ["energy"] }, locale);
  if (!score.pageContent) throw new Error("Complete HealthScore fixture requires page content");
  const text = { [locale]: "Fixture advice" };
  const card = { headline: text, body: text };
  return { ...score, pageContent: { ...score.pageContent, aiCopy: {
    bandLine: text, findings: [card], findingsHeadline: text, findingsSub: text,
    gapTrio: [card, card, card], heroBody: text, heroTitle: text, highestLeverageBody: text,
    methodCards: [card, card, card], methodHeadline: text, pillarHeadline: text,
    relativityHeadline: text, relativitySub: text, strengthNote: text, subtractionBody: text
  } } };
}
