import { Type, type Static, type TSchema, type TProperties } from "@sinclair/typebox";

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
  optimization: { ...enumeration(["balanced", "best_coverage", "lowest_cost", "fewest_pills"] as const), description: "Closest dose fit remains the default recommendation. This preference chooses commercial tie-breaks and disclosed trade-offs; it never changes agreed targets or eliminates above-preference options." },
  profile: PROFILE_SCHEMA, requirements: REQUIREMENTS_SCHEMA,
  safetyAcknowledgement: optional(PLAN_SAFETY_ACK),
  targets: Type.Array(TARGET_SCHEMA, { minItems: 1, maxItems: 30, description: "Agreed targets: name, amount, and unit. Optional importance defaults to required." })
}, "Complete plan request. Replacement revisions reset omitted optional fields. Agreed targets are not diagnoses. Resolved nutrient amounts must represent at least one nanogram, one CFU, or 0.001 ml/serving; IU precision depends on nutrient form. Below-precision errors report the exact field and permitted minimum.");
export const PLAN_REQUEST_PATCH = Type.Partial(Type.Object({ ...PLAN_REQUEST.properties, baseline: optional(Type.Partial(Type.Object(PLAN_REQUEST.properties.baseline.properties, { additionalProperties: false }))) }), { additionalProperties: false, description: "Merge supplied object fields; supplied arrays replace completely; [] clears arrays; null clears only the advisory preferences requirements.maxProductCount, maxDailyPills and maxPriceMinor; null elsewhere is invalid. {} explicitly refreshes contract/policy without changing inputs." });
export type PlanRequestWire = Static<typeof PLAN_REQUEST>;
export type PlanRequestPatchWire = Static<typeof PLAN_REQUEST_PATCH>;
const key = Type.String({ minLength: 16, maxLength: 128 });
const handle = Type.String({ minLength: 32, maxLength: 4096 });
const revision = Type.Integer({ minimum: 1 });
export const MUTATION_VIEW = optional({ ...enumeration(["conversation", "full"] as const), default: "full", description: "Presentation only; omitted means the compatible full response. Use conversation for routine dialogue. Does not change matching or idempotency." });
export const PLAN_MUTATION_VIEW = optional({ ...enumeration(["conversation", "full"] as const), default: "conversation", description: "Presentation only; full is opt-in. Temporary legacy header: see info(client_guide)." });
export const PLAN_DETAIL_SECTIONS = Type.Array(enumeration(["request", "products", "coverage", "advice", "score", "economics"] as const), { minItems: 1, uniqueItems: true, description: "Batch only the sections needed. Reads stored facts without rematching." });
const readVersion = optional(Type.String({ minLength: 1, maxLength: 128, description: "Previous returned resultVersion; unchanged is true only for the same visible state and representation identity." }));
export const PLAN_OPERATION_SCHEMAS = {
  create: object({ responseView: PLAN_MUTATION_VIEW, operation: Type.Literal("create"), idempotencyKey: key, searchEffort: optional(SEARCH_EFFORT_SCHEMA), request: PLAN_REQUEST }),
  get: Type.Union([
    object({ operation: Type.Literal("get"), planHandle: handle, responseView: PLAN_MUTATION_VIEW }),
    object({ operation: Type.Literal("get"), planHandle: handle, responseView: Type.Literal("status"), knownResultVersion: readVersion }),
    object({ operation: Type.Literal("get"), planHandle: handle, responseView: Type.Literal("details"), expectedRevision: revision, sections: PLAN_DETAIL_SECTIONS, optionIds: optional(Type.Array(Type.String({ minLength: 8, maxLength: 128 }), { minItems: 1, uniqueItems: true })) })
  ]),
  revise: Type.Union([
    object({ responseView: PLAN_MUTATION_VIEW, operation: Type.Literal("revise"), idempotencyKey: key, planHandle: handle, expectedRevision: revision, searchEffort: optional(SEARCH_EFFORT_SCHEMA), request: PLAN_REQUEST }),
    object({ responseView: PLAN_MUTATION_VIEW, operation: Type.Literal("revise"), idempotencyKey: key, planHandle: handle, expectedRevision: revision, searchEffort: optional(SEARCH_EFFORT_SCHEMA), requestPatch: PLAN_REQUEST_PATCH })
  ]),
  answer: object({ responseView: PLAN_MUTATION_VIEW, operation: Type.Literal("answer"), idempotencyKey: key, planHandle: handle, expectedRevision: revision, answers: { ...PLAN_ANSWERS, minItems: 1 }, safetyAcknowledgement: optional(PLAN_SAFETY_ACK) }),
  select: object({ responseView: PLAN_MUTATION_VIEW, operation: Type.Literal("select"), idempotencyKey: key, planHandle: handle, expectedRevision: revision, optionId: Type.String({ minLength: 8, maxLength: 128 }) })
} as const;
// MCP requires an object root; the discriminated branches specify each operation completely.
export const PLAN_INPUT_SCHEMA = { type: "object", anyOf: Object.values(PLAN_OPERATION_SCHEMAS) } as const;
export const PLAN_ADVERTISED_SCHEMA = PLAN_INPUT_SCHEMA;
export const INFO_INPUT_SCHEMA = object({ locale: optional(Type.String({ minLength: 2, maxLength: 35 })), view: optional({ ...enumeration(["overview", "client_guide", "plan_schema"] as const), default: "overview", description: "Ordinary info returns concise essentials and one create example. Request guide text or one plan-operation schema without resources/read." }), planOperation: optional(enumeration(["create", "get", "revise", "answer", "select"] as const)) });
export const EVIDENCE_INPUT_SCHEMA = object({ evidenceHandle: handle, claimIds: optional(strings()), locale: optional(text(35)), mode: optional({ ...enumeration(["summary", "sources"] as const), default: "summary" }) });
export const EXECUTE_INPUT_SCHEMA = object({ planHandle: handle, expectedRevision: revision, idempotencyKey: key });
export const ORDER_INPUT_SCHEMA = { type: "object", ...Type.Union([
  object({ orderHandle: handle, locale: optional(text(35)), responseView: MUTATION_VIEW }),
  object({ orderHandle: handle, locale: optional(text(35)), responseView: Type.Literal("status"), knownResultVersion: readVersion }),
  object({ orderHandle: handle, locale: optional(text(35)), responseView: Type.Literal("details"), sections: Type.Array(enumeration(["frozen_order", "events"] as const), { minItems: 1, uniqueItems: true }) })
]) };
export const SUPPORT_INPUT_SCHEMA = object({ orderHandle: handle, supportHandle: optional(handle), idempotencyKey: key, message: text(4000) });
export const FEEDBACK_INPUT_SCHEMA = object({ planHandle: handle, expectedRevision: revision, idempotencyKey: key, consentConfirmed: Type.Literal(true), optionId: optional(Type.String({ minLength: 8, maxLength: 128 })), points: optional(Type.Array(text(240), { maxItems: 8, uniqueItems: true })), rating: optional(Type.Integer({ minimum: 1, maximum: 5 })), summary: optional(text(1000)) });
export const AGENTIC_INPUT_SCHEMAS = { info: INFO_INPUT_SCHEMA, plan: PLAN_INPUT_SCHEMA, execute: EXECUTE_INPUT_SCHEMA, order: ORDER_INPUT_SCHEMA, support: SUPPORT_INPUT_SCHEMA, feedback: FEEDBACK_INPUT_SCHEMA, evidence: EVIDENCE_INPUT_SCHEMA } as const;
export const AGENTIC_TOOL_SCHEMAS = AGENTIC_INPUT_SCHEMAS;
export const EVIDENCE_ADVERTISED_SCHEMA = EVIDENCE_INPUT_SCHEMA;
export const EXECUTE_ADVERTISED_SCHEMA = EXECUTE_INPUT_SCHEMA;
export const ORDER_ADVERTISED_SCHEMA = ORDER_INPUT_SCHEMA;
export const SUPPORT_ADVERTISED_SCHEMA = SUPPORT_INPUT_SCHEMA;
export const FEEDBACK_ADVERTISED_SCHEMA = FEEDBACK_INPUT_SCHEMA;
