import { isDoseError, scaleAmount } from "@/lib/matcher/dose";
import { knownLimitProfile } from "@/lib/matcher/dose-fit";
import { catalogBandRuleId, safetyCeilingFor } from "@/lib/matcher/safety-ceilings";
import { intakeIsKnown, targetBasis } from "@/lib/matcher/target-basis";
import type { CanonicalCurrent, CanonicalRequest, DoseDimension, SafetyCeiling, SafetySourceScope, ScoredBasket } from "@/lib/matcher/types";
import { resolveProfile, type PreferenceMetric, type ScoringProfile } from "@/lib/matcher/experiments/profiles";
import { add, compare, divide, fromDecimal, multiply, ONE, positive, rational, subtract, sum, ZERO, type Rational } from "@/lib/matcher/experiments/rational";

export type ScoringActuals = Readonly<{ productCount: number; dailyPills: number | null; priceMinor: number | null; currency: string }>;
type Certainty = "known" | "estimated" | "unknown";
export type ExperimentalTarget = Readonly<{
  subjectId: string; name: string; basis: "supplemental" | "total_daily"; dimension: DoseDimension;
  target: Rational; exposure: Rational; exposureMinimum: Rational; exposureMaximum: Rational; conservativeExposure: Rational;
  under: Rational; over: Rational; deviation: Rational; penalty: Rational; certainty: Certainty;
  withinAcceptableRange: boolean | null;
}>;
export type ExperimentalContinuedDose = Readonly<{
  subjectId: string; name: string; referenceDose: Rational; added: Rational; deviation: Rational; penalty: Rational; sourceIds: readonly string[];
}>;
export type ExperimentalLimit = Readonly<{
  subjectId: string; sourceScope: SafetySourceScope; ruleId: string | null; limit: Rational;
  exposure: Rational; exposureMinimum: Rational; exposureMaximum: Rational; conservativeExposure: Rational;
  deviation: Rational; penalty: Rational; dimension: DoseDimension;
}>;
export type ExperimentalPreference = Readonly<{
  metric: PreferenceMetric; kind: "product_count" | "daily_pills" | "first_order_goods_price";
  active: boolean; complete: boolean; preferred: Rational | null; actual: Rational | null;
  denominator: Rational | null; overrun: Rational | null; deviation: Rational | null;
  weight: Rational; rawPenalty: Rational | null; penalty: Rational | null;
}>;
export type ExperimentalScore = Readonly<{
  profile: Readonly<{ id: string; version: string; hash: string }>;
  total: Rational | null; nutrientTotal: Rational; preferenceTotal: Rational | null;
  complete: boolean; missingComponents: readonly string[];
  nutrientEvidenceComplete: boolean; uncertaintyNotes: readonly string[];
  components: Readonly<{ targetUnder: Rational; targetOver: Rational; continued: Rational; safety: Rational }>;
  perTarget: readonly ExperimentalTarget[]; perContinuedDose: readonly ExperimentalContinuedDose[];
  perLimit: readonly ExperimentalLimit[]; preferences: readonly ExperimentalPreference[];
}>;

/** Normalized nutrient deviation is transformed individually, never after summing. */
export function nutrientPenalty(deviation: Rational, alpha: Rational): Rational {
  if (deviation.num < BigInt(0) || compare(alpha, ZERO) < 0 || compare(alpha, ONE) > 0) throw new Error("Invalid nutrient penalty input");
  return add(multiply(subtract(ONE, alpha), deviation), multiply(alpha, multiply(deviation, deviation)));
}
function excess(value: bigint, reference: bigint): Rational {
  return value > reference && reference > BigInt(0) ? rational(value - reference, reference) : ZERO;
}
function offsets(rows: readonly CanonicalCurrent[], subjectId: string) {
  let minimum = BigInt(0), maximum = BigInt(0), base = BigInt(0);
  for (const row of rows) {
    if (row.subjectId !== subjectId) continue;
    const lo = scaleAmount({ amount: row.minimumDailyAmount ?? row.dailyAmount, subjectId, subjectName: row.name, unit: row.unit });
    const hi = scaleAmount({ amount: row.maximumDailyAmount ?? row.dailyAmount, subjectId, subjectName: row.name, unit: row.unit });
    base += row.daily.units;minimum += isDoseError(lo) ? row.daily.units : lo.units;maximum += isDoseError(hi) ? row.daily.units : hi.units;
  }
  return { minimum, maximum, base };
}
type Limit = Readonly<{ ceiling: SafetyCeiling; units: bigint; dimension: DoseDimension }>;
const limitCache = new WeakMap<CanonicalRequest, Map<string, readonly Limit[]>>();
function limitsFor(request: CanonicalRequest, subjectId: string): readonly Limit[] {
  let cache = limitCache.get(request);if (!cache) { cache = new Map();limitCache.set(request, cache); }
  const previous = cache.get(subjectId);if (previous) return previous;
  const profile = knownLimitProfile(request);if (!profile) return [];
  const target = request.targets.find(row => row.subjectId === subjectId),current = request.currentSupplements.find(row => row.subjectId === subjectId),food = request.dietaryIntake?.find(row => row.subjectId === subjectId);
  const name = target?.name ?? current?.name ?? food?.name ?? request.safetyCeilings?.find(row => row.subjectId === subjectId)?.name ?? subjectId;
  const dimension = target?.requested.dim ?? current?.daily.dim ?? food?.daily.dim;
  const limits = (["supplemental", "total"] as const).flatMap(sourceScope => {
    const ceiling = safetyCeilingFor(request.safetyCeilings ?? [], { name, profile, sourceScope, subjectId });
    if (!ceiling || ceiling.maxAmount <= 0) return [];
    const scaled = scaleAmount({ amount: ceiling.maxAmount, subjectId, subjectName: ceiling.name, unit: ceiling.maxUnit });
    return isDoseError(scaled) || scaled.units <= BigInt(0) || dimension && scaled.dim !== dimension ? [] : [{ ceiling, units: scaled.units, dimension: scaled.dim }];
  });cache.set(subjectId, limits);return limits;
}
function validActual(value: number | null, field: string, integer: boolean): Rational | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER || integer && !Number.isSafeInteger(value)) throw new Error(`${field} must be a nonnegative ${integer ? "safe integer" : "finite number"} or null`);
  return fromDecimal(value);
}
function preferenceScores(profile: ScoringProfile, request: CanonicalRequest, actual: ScoringActuals) {
  if (!/^[A-Z]{3}$/.test(actual.currency) || actual.currency !== request.currency) throw new Error("Actual currency must match the request currency");
  const counts = validActual(actual.productCount, "productCount", true);if (!counts) throw new Error("productCount must be known");
  const pills = validActual(actual.dailyPills, "dailyPills", false),price = validActual(actual.priceMinor, "priceMinor", true);
  return ([
    { metric: "productCount", kind: "product_count", preferred: request.maxProductCount, actual: counts },
    { metric: "dailyPills", kind: "daily_pills", preferred: request.maxDailyPills, actual: pills },
    { metric: "priceMinor", kind: "first_order_goods_price", preferred: request.maxPriceMinor, actual: price }
  ] as const).map((row): ExperimentalPreference => {
    const preferred = row.preferred == null ? null : validActual(row.preferred, row.kind, row.metric !== "dailyPills");
    const weight = profile.preferenceWeights[row.metric];
    const active = profile.preferenceCurve !== "off" && weight.num > BigInt(0) && preferred !== null;
    const denominator = preferred === null ? null : preferred.num > BigInt(0) ? preferred : profile.zeroPreferenceScales[row.metric];
    if (active && row.metric === "priceMinor" && preferred?.num === BigInt(0) && profile.zeroPreferenceScales.currency !== actual.currency) throw new Error("Zero price preference scale currency differs from actual currency");
    const overrun = preferred && row.actual ? positive(subtract(row.actual, preferred)) : null;
    const deviation = overrun && denominator ? divide(overrun, denominator) : null;
    const rawPenalty = !active ? ZERO : deviation === null ? null : profile.preferenceCurve === "quadratic" ? multiply(deviation, deviation) : deviation;
    return { metric: row.metric, kind: row.kind, active, complete: !active || row.actual !== null, preferred, actual: row.actual, denominator, overrun, deviation, weight,
      rawPenalty, penalty: rawPenalty === null ? null : multiply(weight, rawPenalty) };
  });
}

/** Amount fields are exact canonical scaled units; normalized deviations and
 * losses are dimensionless. Unknown intake stays annotated, never a zero fact. */
export function scoreExposure(profileInput: ScoringProfile, request: CanonicalRequest, exposure: ReadonlyMap<string, bigint>, actual: ScoringActuals): ExperimentalScore {
  const profile = resolveProfile(profileInput);
  for (const value of exposure.values()) if (typeof value !== "bigint" || value < BigInt(0)) throw new Error("Exposure must contain nonnegative canonical scaled integers");
  const preferences = preferenceScores(profile, request, actual);
  const missingComponents = preferences.filter(row => !row.complete).map(row => row.kind);
  const preferenceTotal = missingComponents.length ? null : sum(preferences.map(row => row.penalty!));
  const perTarget: ExperimentalTarget[] = [],perContinuedDose: ExperimentalContinuedDose[] = [],perLimit: ExperimentalLimit[] = [];
  let targetUnder = ZERO,targetOver = ZERO,continued = ZERO,safety = ZERO;
  const uncertainty = new Set<string>();
  for (const id of request.unknownIntakeSubjectIds ?? []) uncertainty.add(`unknown_intake:${id}`);
  for (const id of request.estimatedIntakeSubjectIds ?? []) uncertainty.add(`estimated_intake:${id}`);
  for (const row of [...request.currentSupplements, ...(request.dietaryIntake ?? [])]) if (!intakeIsKnown(row)) uncertainty.add(`${row.certainty === "unknown" ? "unknown" : "estimated"}_intake:${row.subjectId}`);
  const subjects = new Set([...exposure.keys(), ...(request.dietaryIntake ?? []).map(row => row.subjectId), ...request.targets.map(row => row.subjectId)]);
  for (const subjectId of [...subjects].sort()) {
    const requested = request.targets.find(row => row.subjectId === subjectId);
    const target = requested?.importance === "conditional" && requested.prerequisite?.status !== "satisfied" ? undefined : requested;
    const current = offsets(request.currentSupplements, subjectId),food = offsets(request.dietaryIntake ?? [], subjectId),nominal = exposure.get(subjectId) ?? BigInt(0);
    const minimum = nominal + current.minimum - current.base,maximum = nominal + current.maximum - current.base;
    const referenceRows = !requested ? request.currentSupplements.filter(row => row.subjectId === subjectId && intakeIsKnown(row) && row.daily.units > BigInt(0)) : [];
    const reference = referenceRows.reduce((total, row) => total + row.daily.units, BigInt(0)),added = nominal > current.base ? nominal - current.base : BigInt(0);
    const continuedDeviation = reference > BigInt(0) ? rational(added, reference) : ZERO;
    const continuedPenalty = nutrientPenalty(continuedDeviation, profile.nutrientAlpha);
    const limits = limitsFor(request, subjectId);
    const cases = [...new Set([minimum, maximum])].flatMap(supplemental => [...new Set([food.minimum, food.maximum])].map(diet => {
      const desired = target?.requested.units ?? BigInt(0),delivered = supplemental + (target && targetBasis(target) === "total_daily" ? diet : BigInt(0));
      const under = desired > BigInt(0) && delivered < desired ? rational(desired - delivered, desired) : ZERO,over = excess(delivered, desired);
      const underPenalty = nutrientPenalty(under, profile.nutrientAlpha),overPenalty = nutrientPenalty(over, profile.nutrientAlpha);
      const bounded = limits.map(limit => { const sourceScope = limit.ceiling.sourceScope ?? "supplemental",amount = supplemental + (sourceScope === "total" ? diet : BigInt(0)),deviation = excess(amount, limit.units);return { limit, sourceScope, amount, deviation, penalty: multiply(rational(BigInt(2)), deviation) }; });
      const safetyPenalty = sum(bounded.map(row => row.penalty));
      return { delivered, under, over, underPenalty, overPenalty, bounded, safetyPenalty, total: sum([underPenalty, overPenalty, continuedPenalty, safetyPenalty]) };
    }));
    const worst = cases.reduce((a, b) => compare(b.total, a.total) > 0 ? b : a);
    targetUnder = add(targetUnder, worst.underPenalty);targetOver = add(targetOver, worst.overPenalty);continued = add(continued, continuedPenalty);safety = add(safety, worst.safetyPenalty);
    const unknown = [...uncertainty].some(note => note === `unknown_intake:${subjectId}` || note === "unknown_intake:*");
    const estimated = minimum !== maximum || food.minimum !== food.maximum || [...uncertainty].some(note => note === `estimated_intake:${subjectId}` || note === "estimated_intake:*");
    if (target && target.requested.units > BigInt(0)) {
      const includeFood = targetBasis(target) === "total_daily",lo = minimum + (includeFood ? food.minimum : BigInt(0)),hi = maximum + (includeFood ? food.maximum : BigInt(0));
      let withinAcceptableRange: boolean | null = null;
      if (target.acceptableMinimum != null || target.acceptableMaximum != null) {
        const min = scaleAmount({ amount: target.acceptableMinimum ?? target.requestedAmount, subjectId, subjectName: target.name, unit: target.requestedUnit });
        const max = scaleAmount({ amount: target.acceptableMaximum ?? target.requestedAmount, subjectId, subjectName: target.name, unit: target.requestedUnit });
        if (isDoseError(min) || isDoseError(max)) throw new Error("Canonical target range cannot be scaled");
        withinAcceptableRange = lo >= min.units && hi <= max.units;
      }
      perTarget.push({ subjectId, name: target.name, basis: targetBasis(target), dimension: target.requested.dim, target: rational(target.requested.units),
        exposure: rational(nominal + (includeFood ? food.base : BigInt(0))),exposureMinimum: rational(lo),exposureMaximum: rational(hi),conservativeExposure: rational(worst.delivered),
        under: worst.under, over: worst.over, deviation: add(worst.under, worst.over), penalty: add(worst.underPenalty, worst.overPenalty),certainty: unknown ? "unknown" : estimated ? "estimated" : "known",withinAcceptableRange });
    }
    if (reference > BigInt(0)) perContinuedDose.push({ subjectId, name: referenceRows[0]!.name, referenceDose: rational(reference),added: rational(added),deviation: continuedDeviation,penalty: continuedPenalty,sourceIds: referenceRows.map(row => row.sourceId).sort() });
    for (const row of worst.bounded) perLimit.push({ subjectId,sourceScope: row.sourceScope,ruleId: catalogBandRuleId(row.limit.ceiling),limit: rational(row.limit.units),dimension: row.limit.dimension,
      exposure: rational(nominal + (row.sourceScope === "total" ? food.base : BigInt(0))),exposureMinimum: rational(minimum + (row.sourceScope === "total" ? food.minimum : BigInt(0))),exposureMaximum: rational(maximum + (row.sourceScope === "total" ? food.maximum : BigInt(0))),
      conservativeExposure: rational(row.amount),deviation: row.deviation,penalty: row.penalty });
  }
  const nutrientTotal = sum([targetUnder, targetOver, continued, safety]);
  return { profile: { id: profile.id,version: profile.version,hash: profile.hash }, total: preferenceTotal === null ? null : add(nutrientTotal, preferenceTotal),nutrientTotal,preferenceTotal,
    complete: missingComponents.length === 0,missingComponents,nutrientEvidenceComplete: ![...uncertainty].some(note => note.startsWith("unknown_")),uncertaintyNotes: [...uncertainty].sort(),
    components: { targetUnder,targetOver,continued,safety },perTarget,perContinuedDose,perLimit,preferences };
}

export function scoreBasket(profile: ScoringProfile, request: CanonicalRequest, basket: ScoredBasket): ExperimentalScore {
  const result = scoreExposure(profile, request, new Map([...basket.exposure.totals].map(([id, row]) => [id, row.units])), {
    productCount: basket.productCount,dailyPills: basket.pillCountKnown === false ? null : basket.dailyPills,priceMinor: basket.priceMinor,currency: request.currency
  });
  const unknown = basket.exposure.unknownSubjectIds ?? [];
  return unknown.length ? { ...result,nutrientEvidenceComplete: false,
    perTarget: result.perTarget.map(row => unknown.includes(row.subjectId) || unknown.includes("*") ? { ...row, certainty: "unknown" as const } : row),
    uncertaintyNotes: [...new Set([...result.uncertaintyNotes,...unknown.map(id => `unknown_product_amount:${id}`)])].sort() } : result;
}

export function compareScores(left: ExperimentalScore, right: ExperimentalScore): number {
  if (!left.complete || !right.complete || left.total === null || right.total === null) throw new Error("Cannot rank incomplete experimental scores");
  if (left.profile.hash !== right.profile.hash) throw new Error("Cannot compare totals from different scoring profiles");
  return compare(left.total, right.total);
}
