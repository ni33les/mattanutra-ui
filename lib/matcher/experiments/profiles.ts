import { createHash } from "node:crypto";
import { compare, fromDecimal, ONE, rational, toDecimal, ZERO, type Decimal, type Rational } from "@/lib/matcher/experiments/rational";

export type PreferenceCurve = "off" | "linear" | "quadratic";
export type PreferenceMetric = "productCount" | "dailyPills" | "priceMinor";
export type ProfileDefinition = Readonly<{
  id: string;
  nutrientAlpha: Decimal;
  preferenceCurve: PreferenceCurve;
  preferenceWeights: Readonly<Record<PreferenceMetric, Decimal>>;
  zeroPreferenceScales: Readonly<Record<PreferenceMetric, Decimal> & { currency: string }>;
}>;
export type ScoringProfile = Readonly<{
  id: string;
  version: "experiment-score-1";
  hash: string;
  nutrientCurve: "linear" | "mixed" | "quadratic" | "custom";
  nutrientAlpha: Rational;
  preferenceCurve: PreferenceCurve;
  preferenceWeights: Readonly<Record<PreferenceMetric, Rational>>;
  /** Convenience only; unequal per-metric weights have no shared value. */
  preferenceWeight: Rational | null;
  zeroPreferenceScales: Readonly<Record<PreferenceMetric, Rational> & { currency: string }>;
}>;
const VERSION = "experiment-score-1";
const metrics = ["productCount", "dailyPills", "priceMinor"] as const;
const issued = new WeakSet<object>();

function object(value: unknown, keys: readonly string[], field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join("|") !== [...keys].sort().join("|")) throw new Error(`${field} has missing or unknown fields`);
  return record;
}
function coefficient(value: unknown, field: string, positive = false): Rational {
  const result = fromDecimal(value);
  if (compare(result, ZERO) < 0 || positive && result.num === 0n) throw new Error(`${field} must be ${positive ? "positive" : "nonnegative"}`);
  return result;
}
export function profileDefinition(profile: ScoringProfile): ProfileDefinition {
  return Object.freeze({ id: profile.id, nutrientAlpha: toDecimal(profile.nutrientAlpha), preferenceCurve: profile.preferenceCurve,
    preferenceWeights: Object.freeze({ productCount: toDecimal(profile.preferenceWeights.productCount), dailyPills: toDecimal(profile.preferenceWeights.dailyPills), priceMinor: toDecimal(profile.preferenceWeights.priceMinor) }),
    zeroPreferenceScales: Object.freeze({ productCount: toDecimal(profile.zeroPreferenceScales.productCount), dailyPills: toDecimal(profile.zeroPreferenceScales.dailyPills), priceMinor: toDecimal(profile.zeroPreferenceScales.priceMinor), currency: profile.zeroPreferenceScales.currency }) });
}
function makeProfile(value: unknown): ScoringProfile {
  const input = object(value, ["id", "nutrientAlpha", "preferenceCurve", "preferenceWeights", "zeroPreferenceScales"], "profile");
  if (typeof input.id !== "string" || !/^[a-z][a-z0-9_-]{0,95}$/.test(input.id)) throw new Error("profile.id must be a stable lowercase identifier of at most 96 characters");
  if (typeof input.preferenceCurve !== "string" || !["off", "linear", "quadratic"].includes(input.preferenceCurve)) throw new Error("Invalid preferenceCurve");
  const nutrientAlpha = coefficient(input.nutrientAlpha, "nutrientAlpha");
  if (compare(nutrientAlpha, ONE) > 0) throw new Error("nutrientAlpha must be between 0 and 1");
  const weights = object(input.preferenceWeights, metrics, "preferenceWeights");
  const scales = object(input.zeroPreferenceScales, [...metrics, "currency"], "zeroPreferenceScales");
  if (typeof scales.currency !== "string" || !/^[A-Z]{3}$/.test(scales.currency)) throw new Error("zeroPreferenceScales.currency must be an uppercase ISO currency code");
  const preferenceWeights = Object.freeze(Object.fromEntries(metrics.map(key => [key, coefficient(weights[key], `preferenceWeights.${key}`)])) as Record<PreferenceMetric, Rational>);
  const zeroPreferenceScales = Object.freeze({ ...Object.fromEntries(metrics.map(key => [key, coefficient(scales[key], `zeroPreferenceScales.${key}`, true)])), currency: scales.currency }) as ScoringProfile["zeroPreferenceScales"];
  if (zeroPreferenceScales.priceMinor.den !== 1n || zeroPreferenceScales.priceMinor.num > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("zeroPreferenceScales.priceMinor must be a positive safe integer in the stated currency");
  const nutrientCurve = compare(nutrientAlpha, ZERO) === 0 ? "linear" : compare(nutrientAlpha, ONE) === 0 ? "quadratic" : compare(nutrientAlpha, rational(1n, 2n)) === 0 ? "mixed" : "custom";
  const preferenceWeight = metrics.every(key => compare(preferenceWeights[key], preferenceWeights.productCount) === 0) ? preferenceWeights.productCount : null;
  const partial = { id: input.id, version: VERSION, nutrientCurve, nutrientAlpha, preferenceCurve: input.preferenceCurve as PreferenceCurve, preferenceWeights, preferenceWeight, zeroPreferenceScales } as const;
  const definition = profileDefinition({ ...partial, hash: "" });
  const hash = createHash("sha256").update(JSON.stringify({ version: VERSION, ...definition })).digest("hex");
  const result = Object.freeze({ ...partial, hash });issued.add(result);return result;
}
const builtinProfiles = Object.freeze((["linear", "mixed", "quadratic"] as const).flatMap(nutrient => (["off", "linear", "quadratic"] as const).map(preferenceCurve => makeProfile({
  id: `nutrient-${nutrient}__preferences-${preferenceCurve}`, nutrientAlpha: nutrient === "linear" ? "0" : nutrient === "mixed" ? "0.5" : "1", preferenceCurve,
  preferenceWeights: { productCount: "0.25", dailyPills: "0.25", priceMinor: "0.25" }, zeroPreferenceScales: { productCount: "1", dailyPills: "1", priceMinor: "10000", currency: "THB" }
}))));

export function listProfiles(): readonly ScoringProfile[] { return builtinProfiles; }
export function resolveProfile(value: unknown): ScoringProfile {
  if (typeof value === "string") {
    const id = value === "baseline" ? "nutrient-linear__preferences-off" : value;
    const result = builtinProfiles.find(profile => profile.id === id);
    if (!result) throw new Error(`Unknown scoring profile: ${value}`);
    return result;
  }
  if (value && typeof value === "object" && issued.has(value)) return value as ScoringProfile;
  return makeProfile(value);
}
export function withPreferenceWeight(profile: ScoringProfile, value: unknown): ScoringProfile {
  const weight = coefficient(value, "preferenceWeight"), definition = profileDefinition(resolveProfile(profile));
  return makeProfile({ ...definition, preferenceWeights: Object.fromEntries(metrics.map(metric => [metric, toDecimal(weight)])) });
}
