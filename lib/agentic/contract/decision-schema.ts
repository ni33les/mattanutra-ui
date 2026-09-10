import { Type, type Static } from "@sinclair/typebox";
import { object as o, optional as p, nullable as n, enumeration as e } from "@/lib/agentic/contract/schemas";
const str = Type.String(), num = Type.Number(), money = Type.Number({ minimum: 0, description: "Major currency units; exact minor-unit money is rounded only for presentation." });
const id = Type.String({ minLength: 1 }), list = <T extends import("@sinclair/typebox").TSchema>(row: T) => Type.Array(row);
export const INGREDIENT_ADVICE_SCHEMA = o({ kind: e(["dose_review", "interaction", "overlap", "incomplete_information", "product_data", "other"] as const),
  severity: e(["low", "medium", "high"] as const), message: Type.String({ maxLength: 240 }),
  exposure: p(n(num)), reference: p(n(num)), referenceScope: p(e(["total", "supplemental"] as const)),
  source: p(str), uncertainty: p(str), relatedIngredientIds: p(list(id)) });
const intake = Type.Union([num, Type.Null(), o({ minimum: num, maximum: num, certainty: Type.Literal("estimated") })]);
export const DECISION_INGREDIENT_SCHEMA = o({ ingredientId: id, name: str, unit: n(str), requested: n(num), supplied: n(num), suppliedAtLeast: p(num),
  productIds: list(id), targetBasis: p(e(["total_daily", "supplemental"] as const)), existing: p(intake), gap: p(n(num)), excess: p(n(num)), advice: p(list(INGREDIENT_ADVICE_SCHEMA)) });
const product = o({ productId: id, name: str, imageUrl: n(str), productUrl: n(str), quantity: num, unitPrice: n(money), lineTotal: n(money),
  servingsPerDay: num, dailyQuantity: n(o({ amount: num, unit: str })), supplyDays: n(num) });
const choice = o({ optionId: id, roles: list(str), summary: o({ text: str, pillCount: n(num), pillCountAtLeast: p(num), productCount: Type.Integer({ minimum: 0 }),
  goodsPrice: n(money), goodsPriceAtLeast: p(money), coveragePercent: n(num), coverageAtLeastPercent: p(num), ingredientDataComplete: Type.Boolean(), deliveryPrice: p(n(money)) }),
  ingredients: list(DECISION_INGREDIENT_SCHEMA), products: list(product) });
const base = { ok: Type.Literal(true), planHandle: id, revision: Type.Integer({ minimum: 1 }), summary: str };
export const PROCESSING_DECISION_SCHEMA = o({ ...base, status: Type.Literal("processing"), nextAction: Type.Literal("poll_plan"), pollAfterSeconds: Type.Number({ exclusiveMinimum: 0 }) });
export const FAILED_DECISION_SCHEMA = o({ ...base, status: Type.Literal("failed"), nextAction: Type.Literal("change_request") });
export const READY_DECISION_SCHEMA = o({ ...base, status: e(["ready", "needs_input", "no_purchase"] as const), currency: p(str), scoring: o({ profile: e(["balanced", "best_coverage", "fewest_pills", "lowest_cost"] as const), weights: o({ pills: p(Type.Number({ minimum: 0, maximum: 2 })), products: p(Type.Number({ minimum: 0, maximum: 2 })), price: p(Type.Number({ minimum: 0, maximum: 2 })), servings: p(Type.Number({ minimum: 0, maximum: 2 })), nutrients: p(Type.Record(Type.String(), Type.Number({ minimum: 0, maximum: 2 }))) }) }),
  recommendedOptionId: n(id), selectedOptionId: n(id), choices: list(choice), nextAction: e(["confirm_with_user", "execute", "review_options", "answer_questions", "change_request", "no_purchase", "replenish_later"] as const),
  questions: p(list(o({ questionId: id, prompt: str, choices: list(o({ choice: str, label: str })) }))), refreshRequired: p(Type.Boolean()), nextReplenishmentDay: p(num) });
export const SIMPLE_PLAN_SUCCESS_SCHEMA = Type.Union([PROCESSING_DECISION_SCHEMA, FAILED_DECISION_SCHEMA, READY_DECISION_SCHEMA]);
export type SimplePlanDecision = Static<typeof SIMPLE_PLAN_SUCCESS_SCHEMA>;
