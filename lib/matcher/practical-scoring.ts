import { effectiveWeights, CONVERSATIONAL_POLICY_VERSION } from "@/lib/matcher/scoring-policy";
import { sha256Hex } from "@/lib/sha256";
import { verifiedAdministration } from "@/lib/product-administration";
import { numericalDoseFitScore, numericalWeightedDoseFitScore, exactDoseFit, shareDoseFitInputs } from "@/lib/matcher/dose-fit";
import { add, compare, compileLinearTerms, linearSum, divide, fromDecimal, multiply, positive, rational, serialize, subtract, sum, toNumber, ZERO, type Rational } from "@/lib/matcher/rational";
import type { CanonicalRequest, MatcherProduct, OptimizationMode, PreferenceImportance, SearchState } from "@/lib/matcher/types";

export const PRACTICAL_SCORING_VERSION = "practical-penalties-1";
const WEB_PRACTICAL_SCORING_VERSION = "web-practical-penalties-4";
const WEB_PRODUCT_PENALTY_MULTIPLIER = 5;
const PROFILES = Object.freeze({
  balanced: Object.freeze({ pills: 1, products: 1, price: 1, servings: 1 }),
  best_coverage: Object.freeze({ pills: 0.25, products: 0.25, price: 0.25, servings: 0.25 }),
  fewest_pills: Object.freeze({ pills: 4, products: 2, price: 1, servings: 4 }),
  lowest_cost: Object.freeze({ pills: 1, products: 1, price: 4, servings: 1 })
});
const IMPORTANCE = Object.freeze({ flexible: 0.25, normal: 1, strong: 4 });
const FIELDS = ["maxDailyPills", "maxProductCount", "maxPriceMinor"] as const;
type Field = typeof FIELDS[number];
type ProfileRequest = Pick<CanonicalRequest, "optimization" | "preferenceImportance" | "pricePreferenceBasis" | "scoring"> & Partial<Pick<CanonicalRequest, "selectorMode">>;
type Profile = Readonly<{ id: OptimizationMode; version: string; hash: string; multipliers: Readonly<Record<"pills" | "products" | "price" | "servings", number>>;
  importance: Readonly<Record<Field, PreferenceImportance>>; pricePreferenceBasis: "first_order" | "monthly_30_days" }>;
// Four fixed profiles and three importance values per field: bounded immutable configuration, no lock or I/O.
const profiles = new Map<string, Profile>();
const resolvedProfiles = new WeakMap<ProfileRequest, Profile>();
const requestsByProfile = new WeakMap<CanonicalRequest, Map<OptimizationMode, CanonicalRequest>>();
const doseRequest = new WeakMap<CanonicalRequest, CanonicalRequest>();
export const PRACTICAL_OBJECTIVES = Object.freeze(Object.keys(PROFILES) as OptimizationMode[]);
export function requestForProfile(request: CanonicalRequest, optimization: OptimizationMode): CanonicalRequest {
  if (request.optimization === optimization) return request;
  let variants = requestsByProfile.get(request); if (!variants) { variants = new Map(); requestsByProfile.set(request, variants); }
  let copy = variants.get(optimization);
  if (!copy) { copy = { ...request, optimization, ...(request.scoring ? { scoring: { profile: optimization, weights: {} } } : {}) }; variants.set(optimization, copy); doseRequest.set(copy, doseRequest.get(request) ?? request); shareDoseFitInputs(copy, request); }
  return copy;
}

export function resolvePracticalProfile(request: ProfileRequest): Profile {
  const cached = resolvedProfiles.get(request);
  if (cached) return cached;
  const profile = compilePracticalProfile(request);
  resolvedProfiles.set(request, profile);
  return profile;
}

function compilePracticalProfile(request: ProfileRequest): Profile {
  if (request.scoring) {
    const effective = effectiveWeights(request.scoring);
    return Object.freeze({ id: request.scoring.profile, version: CONVERSATIONAL_POLICY_VERSION, hash: effective.hash,
      multipliers: effective.axes, importance: Object.freeze({ maxDailyPills: "normal", maxProductCount: "normal", maxPriceMinor: "normal" }), pricePreferenceBasis: request.pricePreferenceBasis ?? "first_order" });
  }
  if (!Object.hasOwn(PROFILES, request.optimization)) throw new Error("optimization must be balanced, best_coverage, fewest_pills or lowest_cost");
  const importance = Object.fromEntries(FIELDS.map(field => {
    const value = request.preferenceImportance?.[field] ?? "normal";
    if (!Object.hasOwn(IMPORTANCE, value)) throw new Error(`requirements.preferenceImportance.${field} must be flexible, normal or strong`);
    return [field, value];
  })) as Record<Field, PreferenceImportance>;
  const pricePreferenceBasis = request.pricePreferenceBasis ?? "first_order";
  if (!["first_order", "monthly_30_days"].includes(pricePreferenceBasis)) throw new Error("pricePreferenceBasis is invalid");
  const web = request.selectorMode === "web_single";
  const baseMultipliers = PROFILES[request.optimization];
  const multipliers = web ? Object.freeze({ ...baseMultipliers, products: baseMultipliers.products * WEB_PRODUCT_PENALTY_MULTIPLIER }) : baseMultipliers;
  const config = { id: request.optimization, version: web ? WEB_PRACTICAL_SCORING_VERSION : PRACTICAL_SCORING_VERSION, multipliers, importance, pricePreferenceBasis,
    importanceFactors: IMPORTANCE, fallbackObjectives: web ? "absent_preference_or_unavailable_monthly_cost" : "only_when_corresponding_preference_is_absent",
    ...(web ? { quantityUncertainty: "quarter_times_max_one_pill_profile_importance" } : {}), coefficients: { preference: "0.25", routine: "0.05", uncertainty: "0.25", pillsScale: 3, priceScaleMinor: 100000, zeroPriceScaleMinor: 10000, currency: "THB" } };
  const key = JSON.stringify(config);
  let value = profiles.get(key);
  if (!value) { value = Object.freeze({ id: config.id, version: config.version, hash: sha256Hex(key), multipliers: config.multipliers,
    importance: Object.freeze(importance), pricePreferenceBasis }); profiles.set(key, value); }
  return value;
}

export type PracticalActuals = Readonly<{
  dailyPills: number | null; pillLowerBound: number; productCount: number;
  priceMinor: number | null; priceLowerBound?: number; currency: string;
  servings: readonly number[]; servingBurdenExact?: Rational; uncertainProductCount: number;
  monthlyPriceMinor?: number | null; monthlyPriceLowerBound?: number;
}>;
export type PreferencePenalty = Readonly<{
  active: boolean; actual: number | null; actualLowerBound: number; preferred: number | null;
  complete: boolean; scale: number | null; importance: PreferenceImportance; multiplier: number; penalty: number;
}>;
export type PracticalPenaltyScore = Readonly<{
  profile: Profile; total: number; exact: Readonly<{ numerator: string; denominator: string }>; complete: boolean;
  components: Readonly<{ pills: number; products: number; price: number; servings: number; uncertainty: number; preferences: number }>;
  preferences: Readonly<Record<Field, PreferencePenalty>>;
  missingComponents: readonly string[];
}>;
export type OverallMatchingScore = PracticalPenaltyScore & Readonly<{ dosePenalty: number; overallPenalty: number;
  overallExact: Readonly<{ numerator: string; denominator: string }> }>;

function measurement(value: number, field: string, integer = false): Rational {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER || (integer && !Number.isSafeInteger(value))) {
    throw new Error(`${field} must be a nonnegative ${integer ? "safe integer" : "finite number"}`);
  }
  return fromDecimal(value);
}
const square = (value: Rational) => multiply(value, value);
// Exact values stay native during search. Restored DTOs are decoded once;
// WeakMap ownership keeps this cache bounded by the live candidate objects.
const nativeExact = new WeakMap<PracticalPenaltyScore["exact"], Rational>();
function decoded(value: PracticalPenaltyScore["exact"]): Rational {
  let exact = nativeExact.get(value);
  if (!exact) { exact = rational(BigInt(value.numerator), BigInt(value.denominator)); nativeExact.set(value, exact); }
  return exact;
}
function encoded(value: Rational) {
  const normalized = rational(value.num, value.den);
  const dto = serialize(normalized); nativeExact.set(dto, normalized); return dto;
}
const QUARTER = fromDecimal(0.25), ONE = fromDecimal(1), THREE = fromDecimal(3), PRICE_SCALE = fromDecimal(100000);
const profileCoefficients = new WeakMap<Profile, { objectives: Record<"pills" | "products" | "price" | "servings", Rational>; preferences: Record<Field, Rational>; linear: ReturnType<typeof compileLinearTerms> }>();
function coefficients(profile: Profile) {
  let value = profileCoefficients.get(profile);
  if (!value) {
    const m = profile.multipliers;
    const objective = (weight: number) => profile.version === CONVERSATIONAL_POLICY_VERSION ? multiply(fromDecimal(0.05), fromDecimal(weight)) : fromDecimal(0.05 * weight);
    const objectives = { pills: objective(m.pills), products: objective(m.products), price: objective(m.price), servings: objective(m.servings) };
    const preferences = Object.fromEntries(FIELDS.map((field, index) => [field, multiply(multiply(QUARTER, fromDecimal([m.pills, m.products, m.price][index]!)), fromDecimal(IMPORTANCE[profile.importance[field]]))])) as Record<Field, Rational>;
    value = { objectives, preferences, linear: compileLinearTerms([objectives.pills, objectives.products, objectives.price, objectives.servings,
      ONE, fromDecimal(Math.max(1, m.pills * IMPORTANCE[profile.importance.maxDailyPills])), ...FIELDS.map(field => preferences[field])]) };
    profileCoefficients.set(profile, value);
  }
  return value;
}

type PracticalRequest = Pick<CanonicalRequest, "currency" | "maxDailyPills" | "maxProductCount" | "maxPriceMinor"> & ProfileRequest;
type PreferenceBases = readonly ({ target: Rational; scale: Rational } | null)[];
const measuredActuals = new WeakMap<PracticalRequest, { values: WeakMap<PracticalActuals, ReturnType<typeof compileMeasurements>>; bases: PreferenceBases }>();
function compileMeasurements(request: PracticalRequest, actual: PracticalActuals, profile: Profile, bases: PreferenceBases) {
  const pills = measurement(actual.pillLowerBound, "pillLowerBound"), products = measurement(actual.productCount, "productCount", true);
  if (actual.dailyPills !== null && actual.dailyPills !== actual.pillLowerBound) {
    measurement(actual.dailyPills, "dailyPills");
    throw new Error("pillLowerBound must equal a complete dailyPills measurement");
  }
  const priceValue = actual.priceMinor ?? actual.priceLowerBound ?? 0;
  const price = measurement(priceValue, "priceMinor", true);
  const uncertain = measurement(actual.uncertainProductCount, "uncertainProductCount", true);
  if (actual.uncertainProductCount > actual.productCount) throw new Error("uncertainProductCount cannot exceed productCount");
  const preferencePrice = profile.pricePreferenceBasis === "monthly_30_days" ? actual.monthlyPriceMinor ?? null : actual.priceMinor;
  const preferencePriceLower = preferencePrice ?? (profile.pricePreferenceBasis === "monthly_30_days" ? actual.monthlyPriceLowerBound ?? 0 : priceValue);
  const lowerBounds = [pills, products, profile.pricePreferenceBasis === "monthly_30_days" ? measurement(preferencePriceLower, "monthlyPriceMinor", true) : price];
  const overruns = bases.map((basis, index) => basis
    ? square(divide(positive(subtract(lowerBounds[index]!, basis.target)), basis.scale)) : ZERO);
  const servings = actual.servingBurdenExact ?? sum(actual.servings.map((n, i) => square(positive(subtract(measurement(n, `servings[${i}]`), ONE)))));
  const normalizedPills = divide(pills, THREE), normalizedPrice = divide(price, PRICE_SCALE), uncertainty = multiply(QUARTER, uncertain);
  const weightedUncertainty = profile.version === WEB_PRACTICAL_SCORING_VERSION && request.maxDailyPills != null;
  return { pills: normalizedPills, products, price: normalizedPrice, uncertainty, preferencePrice, preferencePriceLower, overruns, servings,
    linear: compileLinearTerms([request.maxDailyPills == null ? normalizedPills : ZERO, request.maxProductCount == null ? products : ZERO,
      request.maxPriceMinor == null || (profile.version === WEB_PRACTICAL_SCORING_VERSION && preferencePrice === null) ? normalizedPrice : ZERO,
      servings, weightedUncertainty ? ZERO : uncertainty, weightedUncertainty ? uncertainty : ZERO, ...overruns]) };
}
function measurementsFor(request: PracticalRequest, actual: PracticalActuals, profile: Profile) {
  const source = doseRequest.get(request as CanonicalRequest) ?? request;
  let cache = measuredActuals.get(source);
  if (!cache) {
    const bases = FIELDS.map(field => source[field] == null ? null : {
      target: measurement(source[field], field, field !== "maxDailyPills"),
      scale: fromDecimal(source[field] > 0 ? source[field] : field === "maxPriceMinor" ? 10000 : 1) });
    cache = { values: new WeakMap(), bases }; measuredActuals.set(source, cache);
  }
  let result = cache.values.get(actual);
  if (!result) { result = compileMeasurements(request, actual, profile, cache.bases); cache.values.set(actual, result); }
  return result;
}
/** Exact ranking estimate, with incomplete observations explicitly distinct from known zero. */
function numericalPracticalPenalties(request: PracticalRequest, actual: PracticalActuals) {
  if (actual.currency !== request.currency || actual.currency !== "THB") throw new Error("currency must match the THB profile normalization currency");
  const profile = resolvePracticalProfile(request), coefficient = coefficients(profile);
  const measured = measurementsFor(request, actual, profile);
  return linearSum(measured.linear, coefficient.linear);
}
export type NumericalOverallScore = Readonly<{ profile: Profile; request: CanonicalRequest; actual: PracticalActuals;
  doseExact: Rational; exactTotal: Rational }>;
function displayPenalties(request: PracticalRequest, actual: PracticalActuals): PracticalPenaltyScore {
  const total = numericalPracticalPenalties(request, actual), profile = resolvePracticalProfile(request);
  const measured = measurementsFor(request, actual, profile), coefficient = coefficients(profile), m = profile.multipliers;
  const missing = new Set<string>();
  if (actual.uncertainProductCount > 0) missing.add("administrationBasis");
  if (actual.dailyPills === null) missing.add("dailyPills");
  if (actual.priceMinor === null) missing.add("firstOrderPrice");
  const values = [actual.dailyPills, actual.productCount, measured.preferencePrice];
  const lower = [actual.pillLowerBound, actual.productCount, measured.preferencePriceLower];
  const preferences = FIELDS.map((field, index) => {
    const preferred = request[field] ?? null, amount = values[index]!, active = preferred !== null;
    if (active && amount === null) missing.add(field);
    return { field, preferred, actual: amount, lower: lower[index]!, active,
      scale: preferred === null ? null : preferred > 0 ? preferred : field === "maxPriceMinor" ? 10000 : 1 };
  });
  const exactPreferences = FIELDS.map((field, index) => multiply(coefficient.preferences[field], measured.overruns[index]!));
  const exactComponents = {
    pills: request.maxDailyPills == null ? multiply(coefficient.objectives.pills, measured.pills) : ZERO,
    products: request.maxProductCount == null ? multiply(coefficient.objectives.products, measured.products) : ZERO,
    price: request.maxPriceMinor == null || (profile.version === WEB_PRACTICAL_SCORING_VERSION && measured.preferencePrice === null)
      ? multiply(coefficient.objectives.price, measured.price) : ZERO,
    servings: multiply(coefficient.objectives.servings, measured.servings),
    uncertainty: profile.version === WEB_PRACTICAL_SCORING_VERSION && request.maxDailyPills != null
      ? multiply(measured.uncertainty, fromDecimal(Math.max(1, m.pills * IMPORTANCE[profile.importance.maxDailyPills]))) : measured.uncertainty,
    preferences: sum(exactPreferences)
  };
  return { profile, total: toNumber(total), exact: encoded(total), complete: missing.size === 0,
    components: Object.fromEntries(Object.entries(exactComponents).map(([k, v]) => [k, toNumber(v)])) as PracticalPenaltyScore["components"],
    preferences: Object.fromEntries(preferences.map((row, index) => [row.field, {
      active: row.active, actual: row.actual, actualLowerBound: row.lower, preferred: row.preferred, complete: row.actual !== null,
      scale: row.scale, importance: profile.importance[row.field], multiplier: [m.pills, m.products, m.price][index]!, penalty: toNumber(exactPreferences[index]!)
    }])) as Record<Field, PreferencePenalty>, missingComponents: [...missing].sort() };
}
export function scorePracticalPenalties(request: PracticalRequest, actual: PracticalActuals): PracticalPenaltyScore {
  return displayPenalties(request, actual);
}
export function numericalOverallMatchingScore(request: CanonicalRequest, exposure: ReadonlyMap<string, bigint>, actual: PracticalActuals): NumericalOverallScore {
  const penalties = numericalPracticalPenalties(request, actual), dose = numericalDoseFitScore(doseRequest.get(request) ?? request, exposure);
  const nutrient = request.scoring ? numericalWeightedDoseFitScore(request, exposure) : dose;
  const total = add(exactDoseFit(nutrient), penalties);
  return { profile: resolvePracticalProfile(request), request, actual, doseExact: exactDoseFit(dose), exactTotal: total };
}
const displayOverallScores = new WeakMap<NumericalOverallScore, OverallMatchingScore>();
function displayOverall(score: NumericalOverallScore): OverallMatchingScore {
  let value = displayOverallScores.get(score);
  if (!value) {
    value = { ...scorePracticalPenalties(score.request, score.actual), dosePenalty: toNumber(score.doseExact),
      overallPenalty: toNumber(score.exactTotal), overallExact: encoded(score.exactTotal) };
    displayOverallScores.set(score, value);
  }
  return value;
}
export function overallMatchingScore(request: CanonicalRequest, exposure: ReadonlyMap<string, bigint>, actual: PracticalActuals): OverallMatchingScore {
  return displayOverall(numericalOverallMatchingScore(request, exposure, actual));
}

const stateActuals = new WeakMap<SearchState, PracticalActuals>();
const stateScores = new WeakMap<CanonicalRequest, WeakMap<SearchState["exposure"], { state: SearchState; score: NumericalOverallScore }[]>>();
function sameMeasurements(a: SearchState, b: SearchState) {
  return a.pills === b.pills && a.pillCountKnown === b.pillCountKnown && a.count === b.count && a.price === b.price &&
    a.uncertainAdministrationCount === b.uncertainAdministrationCount && a.monthlyPriceMinor === b.monthlyPriceMinor &&
    a.monthlyPriceLowerBound === b.monthlyPriceLowerBound && (a.servingBurden && b.servingBurden
      ? a.servingBurden.num === b.servingBurden.num && a.servingBurden.den === b.servingBurden.den
      : a.routineServings === b.routineServings);
}
function cachedStateScore(request: CanonicalRequest, state: SearchState) {
  const bucket = stateScores.get(request)?.get(state.exposure);
  if (bucket) for (const row of bucket) {
    if (row.state === state || sameMeasurements(row.state, state)) return row.score;
  }
}
export function numericalSearchStateScore(request: CanonicalRequest, state: SearchState): NumericalOverallScore {
  const cached = cachedStateScore(request, state); if (cached) return cached;
  let actual = stateActuals.get(state);
  if (!actual) { actual = { dailyPills: state.pillCountKnown === false ? null : state.pills,
      pillLowerBound: state.pills, productCount: state.count, priceMinor: state.price, currency: request.currency,
      servings: state.routineServings ?? [], servingBurdenExact: state.servingBurden, uncertainProductCount: state.uncertainAdministrationCount ?? state.count,
      monthlyPriceMinor: state.monthlyPriceMinor, monthlyPriceLowerBound: state.monthlyPriceLowerBound }; stateActuals.set(state, actual); }
  const result = numericalOverallMatchingScore(request, state.exposure, actual);
  let cache = stateScores.get(request); if (!cache) { cache = new WeakMap(); stateScores.set(request, cache); }
  let bucket = cache.get(state.exposure);
  if (!bucket) { bucket = []; cache.set(state.exposure, bucket); }
  if (bucket.length >= 8) bucket.shift();
  bucket.push({ state, score: result });
  return result;
}
export function searchStateScore(request: CanonicalRequest, state: SearchState): OverallMatchingScore {
  return displayOverall(numericalSearchStateScore(request, state));
}
export function compareSearchStateScores(request: CanonicalRequest, left: SearchState, right: SearchState) {
  const score = numericalSearchStateScore(request, right), cached = cachedStateScore(request, left);
  if (cached) return compareOverallScores(cached, score);
  const actual = stateActuals.get(left);
  // All other loss terms are nonnegative. Only reuse a bound after the common
  // measurements have passed validation; an unassessed state takes the full path.
  if (left.servingBurden && actual && measuredActuals.get(doseRequest.get(request) ?? request)?.values.has(actual)) {
    const weight = coefficients(score.profile).objectives.servings;
    if (compare({ num: left.servingBurden.num * weight.num, den: left.servingBurden.den * weight.den }, score.exactTotal) > 0) return 1;
  }
  return compareOverallScores(numericalSearchStateScore(request, left), score);
}
export type ComparableOverallScore = Pick<OverallMatchingScore, "profile" | "overallExact"> | Pick<NumericalOverallScore, "profile" | "exactTotal">;
export function compareOverallScores(left: ComparableOverallScore, right: ComparableOverallScore) {
  if (left === right) return 0;
  if (left.profile.hash !== right.profile.hash) throw new Error("Cannot compare different matching profiles as one score");
  return compare("exactTotal" in left ? left.exactTotal : decoded(left.overallExact), "exactTotal" in right ? right.exactTotal : decoded(right.overallExact));
}

export function administrationBasisKnown(product: MatcherProduct) {
  const administration = verifiedAdministration(product.administration);
  return Boolean(administration && administration.route !== "unknown" && administration.physicalUnit !== "unknown" && administration.unitsPerServing !== null);
}

/** Thirty-day packs use the verified physical pack basis and round packs up, never a title number. */
export function monthlyGoodsPrice(product: MatcherProduct, servings: number, ratio?: Rational): number | null {
  const administration = verifiedAdministration(product.administration);
  if (!administrationBasisKnown(product) || !administration?.packQuantity || !administration.unitsPerServing) return null;
  const packs = divide(multiply(multiply(ratio ?? fromDecimal(servings), fromDecimal(30)), fromDecimal(administration.unitsPerServing)), fromDecimal(administration.packQuantity));
  const count = (packs.num + packs.den - BigInt(1)) / packs.den;
  const price = count * BigInt(product.unitPriceMinor);
  return price <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(price) : null;
}
