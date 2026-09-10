import { Type, type Static, type TSchema, type TProperties } from "@sinclair/typebox";
import { visibleOperationVariants } from "@/lib/agentic/contract/operation-variants";

export type JsonSchema = Readonly<Record<string, unknown>>;
export const object = <T extends TProperties>(properties: T, description?: string) => Type.Object(properties, { additionalProperties: false, ...(description ? { description } : {}) });
export const enumeration = <const T extends readonly string[]>(values: T) => Type.Unsafe<T[number]>({ type: "string", enum: [...values] });
export const optional = Type.Optional;
export const nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
export const text = (maxLength = 1000) => Type.String({ minLength: 1, maxLength });
export const strings = (maxItems = 50) => Type.Array(text(128), { maxItems, uniqueItems: true });
export const UNIT_SCHEMA = enumeration(["mcg", "mg", "g", "IU", "CFU", "ml", "serving"] as const);
const productId = Type.String({ pattern: "^prd_[A-Za-z0-9_-]+$", maxLength: 128 });
const supplementId = Type.String({ pattern: "^sup_[A-Za-z0-9_-]+$", maxLength: 128 });
const productIds = Type.Array(productId, { maxItems: 100, uniqueItems: true });
const supplementIds = Type.Array(supplementId, { maxItems: 100, uniqueItems: true });
const amount = Type.Number({ minimum: 0, maximum: 1e15, description: "Daily amount in the accompanying unit; zero must be explicitly reported." });
const positiveAmount = Type.Number({ exclusiveMinimum: 0, maximum: 1e15, description: "Positive quantity in this field’s stated units. Nutrient quantities also use the documented dose precision." });
export const PLAN_ANSWERS = Type.Array(object({ choice: text(240), questionId: text(128) }), { maxItems: 50, uniqueItems: true });
export const PLAN_SAFETY_ACK = object({ confirmed: Type.Literal(true), guidanceIds: strings(), revision: Type.Integer({ minimum: 1 }) }, "Deprecated compatibility input. Health advice never requires acknowledgement.");
export const PROFILE_SCHEMA = object({
  ageYears: optional(Type.Integer({ minimum: 0, maximum: 120, description: "Reported age. Omit when unknown; scoring defaults are not health evidence." })),
  goals: optional(Type.Array(text(80), { maxItems: 30, uniqueItems: true })),
  lifeStage: optional(enumeration(["adult", "child", "pregnant", "breastfeeding", "trying_to_conceive"] as const)),
  sex: optional(enumeration(["female", "male"] as const))
});
export const DEFAULT_MAX_PRODUCT_COUNT = null;
export const SEARCH_EFFORT_SCHEMA = { ...enumeration(["standard", "expanded"] as const), default: "standard", description: "Deterministic search budget: standard 8000 expansion attempts; expanded 64000. Expanded includes the standard incumbent. A revise omission preserves prior effort. Repeating identical inputs reuses work; after expanded exhaustion refine the request." };
export const REQUIREMENTS_SCHEMA = Type.Object({
  preferenceImportance: optional(object({
    maxDailyPills: optional({ ...enumeration(["flexible", "normal", "strong"] as const), default: "normal" }),
    maxProductCount: optional({ ...enumeration(["flexible", "normal", "strong"] as const), default: "normal" }),
    maxPriceMinor: optional({ ...enumeration(["flexible", "normal", "strong"] as const), default: "normal" })
  }, "Preference penalty multipliers: flexible=0.25, normal=1, strong=4. Insistence increases a penalty, never an eligibility or purchase limit. Create/replacement omission means normal; patch omission preserves; normal resets. Clearing the numerical preference disables its overrun term.")),
  allowedForms: optional(Type.Array(enumeration(["capsule", "softgel", "tablet", "powder", "liquid", "gummy", "sachet", "other"] as const), { uniqueItems: true, maxItems: 8 })),
  dietaryPreference: optional(enumeration(["any", "plant_based", "vegan"] as const)),
  excludeProductIds: optional({ ...productIds, description: "Exclude only these products. Does not remove requested nutrients. [] clears this exclusion." }),
  excludeSupplementIds: optional({ ...supplementIds, description: "Exclude products containing these nutrient concepts, not particular product IDs. [] clears this exclusion." }),
  maxDailyPills: optional(nullable(Type.Number({ minimum: 0, maximum: 1000, description: "Preferred daily pill count; unknown counts remain unknown." }))),
  maxPriceMinor: optional(nullable(Type.Integer({ minimum: 0, maximum: 1e12, description: "Preferred first-order goods price in destination currency minor units; delivery quoted separately." }))),
  maxProductCount: optional({ ...nullable(Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })), default: null, description: "Preferred distinct new products; there is no system minimum or maximum basket count." }),
  productDoses: optional(Type.Array(object({ productId, servingsPerDay: positiveAmount }), { maxItems: 100, uniqueItems: true, description: "Fix returned products at these daily labelled servings; other products remain optimisable. Use administration metadata for measurable quantities. [] clears proposals. Revision evaluates, never purchases. Exclusion/physical conflicts return field errors; numeric and health findings are advice." })),
  omega3SourcePreference: optional(enumeration(["any", "algae_only", "fish_allowed"] as const)),
  retainProductIds: optional(productIds), retainSupplementIds: optional(supplementIds)
}, { additionalProperties: false, description: "maxDailyPills, maxPriceMinor and maxProductCount are advisory, never purchase limits. Create/replacement omission or null means no preference; patch omission preserves, null clears. Zero permits purchase. Prominent advice: strictly over 20% above a positive preference, or any positive actual above zero. Unknown actuals stay unknown." });
export const DEFAULT_TARGET_BASIS = "total_daily" as const;
export const TARGET_BASIS_SCHEMA = enumeration(["total_daily", "supplemental"] as const);
export const TARGET_SCHEMA = object({
  basis: optional({ ...TARGET_BASIS_SCHEMA, default: DEFAULT_TARGET_BASIS, description: "total_daily covers known dietary intake, continued supplements and new products; supplemental covers continued supplements and new products only. Web food-gap recommendations explicitly use supplemental. Estimated intake affects dose-fit ranges, never guaranteed coverage." }),
  acceptableRange: optional(object({ maximum: positiveAmount, minimum: positiveAmount, unit: UNIT_SCHEMA })),
  amount: positiveAmount,
  importance: optional({ ...enumeration(["core", "optional", "conditional", "required"] as const), default: "required" }),
  name: text(240),
  prerequisite: optional(object({ nextAction: optional(text()), reasonCode: optional(text(128)), status: enumeration(["satisfied", "unsatisfied", "unknown"] as const) })),
  supplementId: optional(supplementId), unit: UNIT_SCHEMA
});
const observation = {
  daysRemaining: optional(Type.Number({ exclusiveMinimum: 0, maximum: 36500, description: "Current-supplement observations only: positive remaining days of retained stock. Omit unknown duration. Invalid for diet observations." })),
  source: enumeration(["diet", "current_supplement"] as const),
  name: optional(text(240)), supplementId: optional(supplementId), productId: optional(productId),
  description: optional(text(1000)), evidence: optional(text(1000))
};
export const INTAKE_OBSERVATION_SCHEMA = Type.Union([
  object({ ...observation, certainty: Type.Literal("known"), amount, unit: UNIT_SCHEMA }),
  object({ ...observation, certainty: Type.Literal("estimated"), amount: optional(amount), minimum: optional(amount), maximum: optional(amount), unit: optional(UNIT_SCHEMA) }),
  object({ ...observation, certainty: Type.Literal("unknown") })
], { description: "Reported daily intake. Missing quantities are unknown, never zero. Broad dietary descriptions are accepted without labels or portion sizes." });
export type IntakeObservation = Static<typeof INTAKE_OBSERVATION_SCHEMA>;
export const PLAN_REQUEST = object({
  answers: optional(PLAN_ANSWERS),
  conditionCodes: optional({ ...strings(), description: "Condition codes from info.conditionCodes; unrecognised reported context is preserved as unassessed advice." }), medicationCodes: optional({ ...strings(), description: "Medication codes from info.medicationCodes; omission means unknown, not confirmed none." }),
  currentSupplements: optional(Type.Array(object({ dailyAmount: amount, daysRemaining: optional(Type.Number({ exclusiveMinimum: 0, maximum: 36500, description: "Positive remaining days of retained inventory. Omit when unknown. If none remains, remove this retained inventory entry and revise the intended request." })), name: text(240), productId: optional(productId), supplementId: optional(supplementId), unit: UNIT_SCHEMA }), { maxItems: 50, description: "Quantified continued supplements. Omission means unknown; [] explicitly reports none. A (productId, nutrient) pair may occur only once across this field and current-source intake observations." })),
  intake: optional(Type.Array(INTAKE_OBSERVATION_SCHEMA, { maxItems: 100, description: "Reported observations. Omission or [] does not establish zero dietary intake. An explicitly reported known amount of 0 is required to establish zero for a nutrient." })),
  costHorizonsDays: optional(Type.Array(Type.Unsafe<30 | 90>({ type: "integer", enum: [30, 90] }), { minItems: 1, maxItems: 2, uniqueItems: true, default: [30, 90], description: "Supported comparison horizons in days. The response exposes the 30- and 90-day ledgers; other periods are unavailable." })),
  baseline: optional(object({ items: optional(Type.Array(object({ daysRemaining: optional(Type.Number({ minimum: 0, maximum: 36500 })), dailyServings: optional(Type.Number({ exclusiveMinimum: 0, maximum: 1000, description: "Actual catalogue servings per day for this comparison basket. Omission makes equivalent-coverage savings unavailable; quantity remains packs purchased." })), productId, quantity: positiveAmount }), { maxItems: 100 })), type: enumeration(["current_basket", "separate_direct_products"] as const) })),
  destinationCountry: Type.String({ pattern: "^[A-Z]{2}$", description: "Deliverable ISO country from info.supportedCountries." }),
  locale: Type.String({ minLength: 2, maxLength: 35, description: "BCP 47 locale; supported locales are advertised by info. Unsupported locales fall back to English." }),
  optimization: { ...enumeration(["balanced", "best_coverage", "lowest_cost", "fewest_pills"] as const), description: "Shared penalty profile: balanced balances dose, routine and price; best_coverage reduces practical weights to 0.25; lowest_cost multiplies price penalties by 4; fewest_pills multiplies pill/serving penalties by 4 and product penalties by 2. These are weighted trade-offs, not absolute extrema or purchase limits. The recommended best_match and closest_dose alternative may differ; agreed targets and eligibility remain unchanged." },
  profile: PROFILE_SCHEMA, requirements: REQUIREMENTS_SCHEMA,
  safetyAcknowledgement: optional(PLAN_SAFETY_ACK),
  targets: Type.Array(TARGET_SCHEMA, { minItems: 1, maxItems: 30, description: "Agreed targets: name, amount, and unit. Optional importance defaults to required." })
}, "Complete plan request. Replacement revisions reset omitted optional fields. Agreed targets are not diagnoses. Resolved nutrient amounts must represent at least one nanogram, one CFU, or 0.001 ml/serving; IU precision depends on nutrient form. Below-precision errors report the exact field and permitted minimum.");
export type PlanRequestWire = Static<typeof PLAN_REQUEST>;
const key = Type.String({ minLength: 16, maxLength: 128 });
const handle = Type.String({ minLength: 32, maxLength: 4096 });
const revision = Type.Integer({ minimum: 1 });
export const WEIGHT_SCHEMA = Type.Number({ minimum: 0, maximum: 2, description: "Effective intent weight: 0 softly minimises exposure/quantity, 1 is standard, 2 increases importance. Never an exclusion or dose change." });
const scoringWeights = object({
  pills: optional(nullable(WEIGHT_SCHEMA)), products: optional(nullable(WEIGHT_SCHEMA)), price: optional(nullable(WEIGHT_SCHEMA)), servings: optional(nullable(WEIGHT_SCHEMA)),
  nutrients: optional(Type.Record(Type.String({ pattern: "^[A-Za-z][A-Za-z0-9_-]{0,127}$" }), nullable(WEIGHT_SCHEMA), { description: "Returned or published ingredient IDs only. Omission preserves; individual null resets to the preset." }))
});
export const SCORING_SCHEMA = object({
  profile: optional(enumeration(["balanced", "best_coverage", "fewest_pills", "lowest_cost"] as const)),
  weights: optional(nullable(scoringWeights))
}, "profile is a scoring preset, not customer demographics. Omitted effective terms default to one. Changing preset resets old overrides, then applies supplied overrides. weights:null clears overrides; {} preserves them. Individual null resets. An empty scoring refinement can retry failed/stale work; otherwise unchanged input is a no-op.");
const ingredientId = Type.String({ minLength: 1, maxLength: 128, pattern: "^[A-Za-z][A-Za-z0-9_-]*$" });
const targetFields = { ingredientId: optional(ingredientId), name: optional(text(240)), amount: positiveAmount, unit: UNIT_SCHEMA,
  basis: TARGET_SCHEMA.properties.basis, acceptableRange: TARGET_SCHEMA.properties.acceptableRange };
const targetCreate = { ...object(targetFields), anyOf: [{ required: ["ingredientId"] }, { required: ["name"] }] };
const targetEdit = object({ ingredientId, amount: optional(nullable(positiveAmount)), unit: optional(UNIT_SCHEMA), basis: TARGET_SCHEMA.properties.basis,
  acceptableRange: TARGET_SCHEMA.properties.acceptableRange });
const conversationalRequirements = Type.Omit(REQUIREMENTS_SCHEMA, ["preferenceImportance"]);
const contextFields = { locale: PLAN_REQUEST.properties.locale, destinationCountry: PLAN_REQUEST.properties.destinationCountry,
  profile: optional(PROFILE_SCHEMA), requirements: optional(conversationalRequirements), scoring: optional(SCORING_SCHEMA), searchEffort: optional(SEARCH_EFFORT_SCHEMA),
  medicationCodes: PLAN_REQUEST.properties.medicationCodes, conditionCodes: PLAN_REQUEST.properties.conditionCodes,
  currentSupplements: PLAN_REQUEST.properties.currentSupplements, intake: PLAN_REQUEST.properties.intake,
  baseline: PLAN_REQUEST.properties.baseline, costHorizonsDays: PLAN_REQUEST.properties.costHorizonsDays };
const refinement = Type.Partial(object({ ...contextFields, targets: Type.Array(Type.Union([targetEdit, targetCreate]), { maxItems: 100 }) }));
export const PLAN_REFINEMENT_FIELDS = Object.keys(refinement.properties);
const controls = { planHandle: handle, expectedRevision: revision, idempotencyKey: key };
export const PLAN_BRANCH_SCHEMAS = {
  create: object({ ...contextFields, targets: Type.Array(targetCreate, { minItems: 1, maxItems: 30 }), idempotencyKey: key }),
  get: object({ planHandle: handle }),
  revise: { ...object({ ...refinement.properties, ...controls }), anyOf: PLAN_REFINEMENT_FIELDS.map(field => ({ required: [field] })) },
  answer: object({ ...controls, answers: { ...PLAN_ANSWERS, minItems: 1 } }),
  select: object({ ...controls, selectedOptionId: Type.String({ minLength: 8, maxLength: 128 }) })
} as const;
export const PLAN_INPUT_SCHEMA = visibleOperationVariants(Type.Union(Object.values(PLAN_BRANCH_SCHEMAS)));
export const PLAN_ADVERTISED_SCHEMA = PLAN_INPUT_SCHEMA;
export const INFO_INPUT_SCHEMA = object({ locale: optional(Type.String({ minLength: 2, maxLength: 35 })), view: optional({ ...enumeration(["overview", "client_guide", "plan_schema"] as const), default: "overview", description: "Concise essentials, the conversational client guide, or the unified flat plan schema. Resource access is optional." }) });
export const EVIDENCE_INPUT_SCHEMA = { ...object({ planHandle: handle, expectedRevision: revision, optionId: text(128), ingredientId: optional(text(128)), productId: optional(productId) }), oneOf: [{ required: ["ingredientId"] }, { required: ["productId"] }] };
export const EXECUTE_INPUT_SCHEMA = object({ planHandle: handle, expectedRevision: revision, idempotencyKey: key });
export const ORDER_INPUT_SCHEMA = object({ orderHandle: handle, locale: optional(text(35)) });
export const SUPPORT_INPUT_SCHEMA = object({ orderHandle: handle, supportHandle: optional(handle), idempotencyKey: key, message: text(4000) });
export const FEEDBACK_INPUT_SCHEMA = object({ planHandle: handle, expectedRevision: revision, idempotencyKey: key, consentConfirmed: Type.Literal(true), optionId: optional(Type.String({ minLength: 8, maxLength: 128 })), points: optional(Type.Array(text(240), { maxItems: 8, uniqueItems: true })), rating: optional(Type.Integer({ minimum: 1, maximum: 5 })), summary: optional(text(1000)) });
export const AGENTIC_INPUT_SCHEMAS = { info: INFO_INPUT_SCHEMA, plan: PLAN_INPUT_SCHEMA, execute: EXECUTE_INPUT_SCHEMA, order: ORDER_INPUT_SCHEMA, support: SUPPORT_INPUT_SCHEMA, feedback: FEEDBACK_INPUT_SCHEMA, evidence: EVIDENCE_INPUT_SCHEMA } as const;
export const AGENTIC_TOOL_SCHEMAS = AGENTIC_INPUT_SCHEMAS;
export const EVIDENCE_ADVERTISED_SCHEMA = EVIDENCE_INPUT_SCHEMA;
export const EXECUTE_ADVERTISED_SCHEMA = EXECUTE_INPUT_SCHEMA;
export const ORDER_ADVERTISED_SCHEMA = ORDER_INPUT_SCHEMA;
export const SUPPORT_ADVERTISED_SCHEMA = SUPPORT_INPUT_SCHEMA;
export const FEEDBACK_ADVERTISED_SCHEMA = FEEDBACK_INPUT_SCHEMA;
