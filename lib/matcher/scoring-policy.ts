import { fromDecimal } from "@/lib/matcher/rational";
import { sha256Hex } from "@/lib/sha256";

export const CONVERSATIONAL_POLICY_VERSION = "conversational-weights-1";
export const SCORING_PRESETS = Object.freeze({
  balanced: Object.freeze({ pills: 1, products: 1, price: 1, servings: 1, nutrients: 1 }),
  best_coverage: Object.freeze({ pills: 1, products: 1, price: 1, servings: 1, nutrients: 2 }),
  fewest_pills: Object.freeze({ pills: 2, products: 1.5, price: 1, servings: 2, nutrients: 1 }),
  lowest_cost: Object.freeze({ pills: 1, products: 1, price: 2, servings: 1, nutrients: 1 })
});
export type ScoringPreset = keyof typeof SCORING_PRESETS;
export type WeightAxis = "pills" | "products" | "price" | "servings";
export type ScoringSettings = Readonly<{ profile: ScoringPreset; weights: Readonly<Partial<Record<WeightAxis, number>> & { nutrients?: Readonly<Record<string, number>> }> }>;
export type ScoringPatch = Readonly<{ profile?: ScoringPreset; weights?: null | Readonly<Partial<Record<WeightAxis, number | null>> & { nutrients?: Readonly<Record<string, number | null>> }> }>;
export function validateWeight(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 2) throw new Error(`${field}: ${String(value)} must be a finite number in [0,2]`);
  try { fromDecimal(value); } catch { throw new Error(`${field}: value exceeds supported exact decimal precision`); }
  return value;
}
/** Returns canonical explicit overrides only; no implicit multipliers or mutable shared state. */
export function patchScoring(previous: ScoringSettings | undefined, patch: ScoringPatch = {}): ScoringSettings {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("scoring must be an object");
  for (const key of Object.keys(patch)) if (!["profile", "weights"].includes(key)) throw new Error(`scoring.${key} is unknown`);
  const profile = patch.profile ?? previous?.profile ?? "balanced";
  if (!Object.hasOwn(SCORING_PRESETS, profile) || patch.profile === null) throw new Error("scoring.profile must be a documented preset");
  const weights: Partial<Record<WeightAxis, number>> & { nutrients?: Record<string, number> } = patch.profile !== undefined || patch.weights === null ? {} : structuredClone(previous?.weights ?? {});
  if (patch.weights != null) {
    for (const [key, value] of Object.entries(patch.weights)) {
      if (key === "nutrients") {
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("scoring.weights.nutrients must be an object");
        const nutrients = { ...weights.nutrients };
        for (const [id, weight] of Object.entries(value)) { if (weight === null) delete nutrients[id]; else nutrients[id] = validateWeight(weight, `scoring.weights.nutrients.${id}`); }
        if (Object.keys(nutrients).length) weights.nutrients = Object.fromEntries(Object.entries(nutrients).sort(([a], [b]) => a.localeCompare(b))); else delete weights.nutrients;
      } else {
        if (!["pills", "products", "price", "servings"].includes(key)) throw new Error(`scoring.weights.${key} is unknown`);
        if (value === null) delete weights[key as WeightAxis]; else weights[key as WeightAxis] = validateWeight(value, `scoring.weights.${key}`);
      }
    }
  }
  if (weights.nutrients) Object.freeze(weights.nutrients);
  return Object.freeze({ profile, weights: Object.freeze(weights) });
}
const resolved = new WeakMap<ScoringSettings, ReturnType<typeof computeWeights>>();
function computeWeights(settings: ScoringSettings) {
  const preset = SCORING_PRESETS[settings.profile];
  const axes = Object.freeze(Object.fromEntries((["pills", "products", "price", "servings"] as const).map(axis => [axis, validateWeight(settings.weights[axis] ?? preset[axis], `scoring.weights.${axis}`)])) as Record<WeightAxis, number>);
  const nutrients = Object.freeze(Object.fromEntries(Object.entries(settings.weights.nutrients ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([id, weight]) => [id, validateWeight(weight, `scoring.weights.nutrients.${id}`)])));
  const effective = { axes, defaultNutrient: preset.nutrients, nutrients, version: CONVERSATIONAL_POLICY_VERSION, avoidanceScale: "positive-target_then-verified-continued_then-one-canonical-quantum" };
  return Object.freeze({ ...effective, hash: sha256Hex(JSON.stringify(effective)) });
}
export function effectiveWeights(settings: ScoringSettings) {
  let value = resolved.get(settings); if (!value) { value = computeWeights(settings); resolved.set(settings, value); } return value;
}
