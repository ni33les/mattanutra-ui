import type { HealthScoreResult } from "@/lib/health-score";

// Provider shape constraints supplement (never replace) the existing semantic
// validators. Cached/historical results continue through their existing readers.
type Schema = Readonly<Record<string, unknown>>;
const text = { type: "string", minLength: 1 };
const object = (properties: Record<string, Schema>) => ({
  type: "object", properties, required: Object.keys(properties), additionalProperties: false
});
const array = (items: Schema, bounds: Schema = {}) => ({ type: "array", items, ...bounds });
const textFields = (names: readonly string[]) => Object.fromEntries(names.map(name => [name, text]));
const id = { ...text, pattern: "^[a-z0-9][a-z0-9-]{1,63}$" };
const caution = object({
  id, severity: { type: "string", enum: ["caution", "info", "review"] },
  title: text, body: text, relatedAnswerKeys: array(text)
});

export const FORMULATION_RESPONSE_SCHEMA = {
  name: "formulation", strict: true,
  schema: object({
    supplementBreakdown: array(object({
      id, ...textFields(["category", "supplement", "dailyDose", "decision", "rationale", "whyThisIsForYou"]),
      effectivenessRank: { type: "integer", minimum: 1 },
      status: { type: "string", enum: ["covered", "add", "review"] }, cautions: array(caution)
    }), { minItems: 1, maxItems: 30 }),
    marketingPoints: array(object({ id, title: text, body: text }), { minItems: 3, maxItems: 3 }),
    cautions: array(caution)
  })
};

export function healthScoreResponseSchema(healthScore: HealthScoreResult) {
  const seeds = healthScore.pageContent?.copySeeds;
  const cards = (key: "headline" | "title", count: number | undefined) => array(
    object({ [key]: text, body: text }), count === undefined ? {} : { minItems: count, maxItems: count }
  );
  return {
    name: "healthscore_copy", strict: true,
    schema: object({ pageCopy: object({
      ...textFields([
        "bandLine", "heroBody", "heroTitle", "findingsHeadline", "findingsSub", "highestLeverageBody",
        "methodHeadline", "pillarHeadline", "relativityHeadline", "relativitySub", "strengthNote", "subtractionBody"
      ]),
      findings: cards("headline", seeds?.findings.length),
      gapTrio: cards("headline", seeds?.gapTrio.length),
      methodCards: cards("title", 3)
    }) })
  };
}
