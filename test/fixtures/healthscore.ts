import { computeHealthScore } from "../../lib/health-score.ts";
import type { Locale } from "../../lib/i18n.ts";
export function completeHealthScoreFixture(locale: Locale = "en") {
  const score = computeHealthScore({ sex: "male", age: "36-45", goals: ["energy"] }, locale);
  const text = { [locale]: "Fixture advice" };
  const card = { headline: text, body: text };
  return { ...score, pageContent: { ...score.pageContent, aiCopy: {
    bandLine: text, findings: [card], findingsHeadline: text, findingsSub: text,
    gapTrio: [card, card, card], heroBody: text, heroTitle: text, highestLeverageBody: text,
    methodCards: [card, card, card], methodHeadline: text, pillarHeadline: text,
    relativityHeadline: text, relativitySub: text, strengthNote: text, subtractionBody: text
  } } };
}
