/**
 * Central Grok model + reasoning defaults for MattaNutra AI tasks.
 *
 * Model: use the highest general chat model available on the xAI account
 * (verified via GET /v1/models). Override per env with GROK_MODEL or task-specific
 * *_MODEL vars.
 *
 * Reasoning effort (xAI `reasoning_effort`):
 * - none   — fixed/template-ish copy, non-generative bookkeeping, high volume
 * - low    — translation, light extraction, short rewrites
 * - medium — clinical/commercial advice, multi-step personalization, customer chat
 *
 * Platform task rows only accept none | low | medium (see task-worker).
 */

export const DEFAULT_GROK_MODEL = "grok-4.5";

export type GrokReasoningEffort = "none" | "low" | "medium";

export type GrokTaskReasoningKey =
  | "customerInsights"
  | "foodGuidance"
  | "foodReview"
  | "formulation"
  | "healthScoreCopy"
  | "nutritionAdvisor"
  | "panyaChat"
  | "panyaWelcome"
  | "productCopyTranslation"
  | "productCoverageDemand"
  | "productFactCorrection"
  | "supplementDose";

/**
 * Canonical defaults. Env overrides win (see resolvers in each module).
 * Keep this table and .env.example in sync.
 */
export const GROK_TASK_REASONING_DEFAULTS = {
  /** Marketing segment language — privacy-sensitive, not deep clinical. */
  customerInsights: "low",
  /** Meal/food plan narrative from deterministic gaps. */
  foodGuidance: "medium",
  /** Short food-review suggestion chips. */
  foodReview: "low",
  /** Supplement stack design — highest clinical leverage among generative paths. */
  formulation: "medium",
  /** Stage-6 style page polish; locked numbers validated server-side. */
  healthScoreCopy: "medium",
  /** Plan refinement / advisor replies. */
  nutritionAdvisor: "medium",
  /** Ongoing customer chat (Nong Mata). */
  panyaChat: "medium",
  /** One-shot welcome message. */
  panyaWelcome: "none",
  /** Locale product copy translation. */
  productCopyTranslation: "low",
  /** Coverage / demand generation helpers. */
  productCoverageDemand: "low",
  /** Structured product fact cleanup. */
  productFactCorrection: "low",
  /** Dose suggestion within formulation context. */
  supplementDose: "low"
} as const satisfies Record<GrokTaskReasoningKey, GrokReasoningEffort>;

export function grokTaskReasoningDefault(
  key: GrokTaskReasoningKey
): GrokReasoningEffort {
  return GROK_TASK_REASONING_DEFAULTS[key];
}
