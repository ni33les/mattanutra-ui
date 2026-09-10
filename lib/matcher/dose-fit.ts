import { DOSE_FIT_VERSION, UPPER_LIMIT_EXTRA_WEIGHT } from "@/lib/matcher/config";
import { amountFromScaled, isDoseError, scaleAmount } from "@/lib/matcher/dose";
import { catalogBandRuleId, safetyCeilingFor } from "@/lib/matcher/safety-ceilings";
import { intakeIsKnown, targetBasis } from "@/lib/matcher/target-basis";
import { zeroTargetScale } from "@/lib/matcher/zero-target-policy";
import { effectiveWeights } from "@/lib/matcher/scoring-policy";
import { fromDecimal, multiply } from "@/lib/matcher/rational";
import type { CanonicalRequest, DoseDimension, DoseFitScore, MatcherUnit, SafetyCeiling } from "@/lib/matcher/types";

type Fraction = Readonly<{ num: bigint; den: bigint }>;
const ZERO: Fraction = { num: BigInt(0), den: BigInt(1) };
const exactTotals = new WeakMap<DoseFitScore, Fraction>();
const exactParts = new WeakMap<DoseFitScore, { fitting: Fraction; safety: Fraction }>();
const fixedWeights = new WeakMap<CanonicalRequest, number | null>();
const scoreCache = new WeakMap<CanonicalRequest, WeakMap<object, DoseFitScore>>();
const weightedCache = new WeakMap<CanonicalRequest, WeakMap<object, DoseFitScore>>();

function gcd(a: bigint, b: bigint): bigint {
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  return a || BigInt(1);
}

function add(a: Fraction, b: Fraction): Fraction {
  const common = gcd(a.den, b.den);
  const num = a.num * (b.den / common) + b.num * (a.den / common);
  const den = a.den * (b.den / common);
  const divisor = gcd(num, den);
  return { num: num / divisor, den: den / divisor };
}

function excess(amount: bigint, limit: bigint): Fraction {
  return amount > limit && limit > BigInt(0) ? { num: amount - limit, den: limit } : ZERO;
}

function value(fraction: Fraction) {
  const numerator = Number(fraction.num), denominator = Number(fraction.den);
  if (Number.isFinite(numerator) && Number.isFinite(denominator)) return numerator / denominator;
  // Exact sums may have enormous coprime denominators even though their ratio
  // is small. Convert leading significant digits without Infinity / Infinity.
  const n = fraction.num.toString(), d = fraction.den.toString();
  const leadingN = n.slice(0, 17), leadingD = d.slice(0, 17);
  const coefficient = (Number(leadingN) / 10 ** (leadingN.length - 1)) /
    (Number(leadingD) / 10 ** (leadingD.length - 1));
  return Number(`${coefficient}e${n.length - d.length}`);
}

function certainty(request: CanonicalRequest, subjectId: string) {
  if (request.unknownIntakeSubjectIds?.some((id) => id === subjectId || id === "*")) return "unknown" as const;
  if (request.estimatedIntakeSubjectIds?.some((id) => id === subjectId || id === "*")) return "estimated" as const;
  return "known" as const;
}

/** Scoring placeholders must never select an age-specific reference as a known fact. */
export function knownLimitProfile(request: Pick<CanonicalRequest, "profile" | "profileKnown">) {
  if (request.profileKnown?.ageYears !== false && request.profile.ageYears < 1) return null;
  if (request.profileKnown?.lifeStage === false) return null;
  if (request.profileKnown?.ageYears === false && !["pregnant", "breastfeeding"].includes(request.profile.lifeStage)) return null;
  return request.profile;
}

type Limit = Readonly<{ subjectId: string; ceiling: SafetyCeiling; units: bigint; dim: DoseDimension }>;
const limitCache = new WeakMap<CanonicalRequest, Map<string, readonly Limit[]>>();

function limitsFor(request: CanonicalRequest, subjectId: string): readonly Limit[] {
  let cache = limitCache.get(request);
  if (!cache) { cache = new Map(); limitCache.set(request, cache); }
  const existing = cache.get(subjectId);
  if (existing) return existing;
  const profile = knownLimitProfile(request);
  if (!profile) return [];
  const name = request.targets.find((row) => row.subjectId === subjectId)?.name ??
    request.currentSupplements.find((row) => row.subjectId === subjectId)?.name ??
    request.dietaryIntake?.find((row) => row.subjectId === subjectId)?.name ??
    request.safetyCeilings?.find((row) => row.subjectId === subjectId)?.name ?? subjectId;
  const expectedDim = request.targets.find((row) => row.subjectId === subjectId)?.requested.dim ??
    request.currentSupplements.find((row) => row.subjectId === subjectId)?.daily.dim ??
    request.dietaryIntake?.find((row) => row.subjectId === subjectId)?.daily.dim;
  const limits = (["supplemental", "total"] as const).flatMap((sourceScope) => {
    const ceiling = safetyCeilingFor(request.safetyCeilings ?? [], { name, profile, sourceScope, subjectId });
    if (!ceiling || ceiling.maxAmount <= 0) return [];
    const amount = scaleAmount({ amount: ceiling.maxAmount, subjectId, subjectName: ceiling.name, unit: ceiling.maxUnit });
    return isDoseError(amount) || amount.units <= BigInt(0) || (expectedDim && expectedDim !== amount.dim) ? [] : [{ subjectId, ceiling, units: amount.units, dim: amount.dim }];
  });
  cache.set(subjectId, limits);
  return limits;
}

function rangeOffsets(rows: CanonicalRequest["currentSupplements"], subjectId: string) {
  let minimum = BigInt(0), maximum = BigInt(0), base = BigInt(0);
  for (const row of rows) {
    if (row.subjectId !== subjectId) continue;
    const lo = scaleAmount({ amount: row.minimumDailyAmount ?? row.dailyAmount, subjectId, subjectName: row.name, unit: row.unit });
    const hi = scaleAmount({ amount: row.maximumDailyAmount ?? row.dailyAmount, subjectId, subjectName: row.name, unit: row.unit });
    base += row.daily.units;
    minimum += isDoseError(lo) ? row.daily.units : lo.units;
    maximum += isDoseError(hi) ? row.daily.units : hi.units;
  }
  return { minimum, maximum, base };
}

const subjectCache = new WeakMap<CanonicalRequest, Map<string, ReturnType<typeof compileSubject>>>();
function compileSubject(request: CanonicalRequest, subjectId: string) {
  const requested = request.targets.find(row => row.subjectId === subjectId);
  const target = requested?.importance === "conditional" && requested.prerequisite?.status !== "satisfied" ? undefined : requested;
  const ranges = rangeOffsets(request.currentSupplements, subjectId), dietary = rangeOffsets(request.dietaryIntake ?? [], subjectId);
  const knownRows = request.currentSupplements.filter(row => row.subjectId === subjectId && intakeIsKnown(row));
  const referenceRows = !requested ? knownRows.filter(row => row.daily.units > BigInt(0)) : [];
  const reference = referenceRows.reduce((n, row) => n + row.daily.units, BigInt(0));
  const zeroScale = request.scoring && target?.requested.units === BigInt(0) ? zeroTargetScale(target.name, subjectId) : null;
  if (request.scoring && target?.requested.units === BigInt(0) && (!zeroScale || zeroScale.dim !== target.requested.dim)) throw new Error(`No reviewed zero-target normalization scale for ${target.name}`);
  const scale = zeroScale?.units;
  return { requested, target, ranges, dietary, referenceRows, reference, scale, bounds: limitsFor(request, subjectId) };
}
function subjectInputs(request: CanonicalRequest, subjectId: string) {
  let compiled = subjectCache.get(request); if (!compiled) { compiled = new Map(); subjectCache.set(request, compiled); }
  let value = compiled.get(subjectId); if (!value) { value = compileSubject(request, subjectId); compiled.set(subjectId, value); } return value;
}

function compareFractions(a: Fraction, b: Fraction) {
  const delta = a.num * b.den - b.num * a.den;
  return delta < BigInt(0) ? -1 : delta > BigInt(0) ? 1 : 0;
}

export function doseFitScore(request: CanonicalRequest, exposure: ReadonlyMap<string, bigint>): DoseFitScore {
  return calculateDoseFit(request, exposure, false);
}
export function weightedDoseFitScore(request: CanonicalRequest, exposure: ReadonlyMap<string, bigint>): DoseFitScore {
  const settings = request.scoring ? effectiveWeights(request.scoring) : null;
  if (!settings || (settings.defaultNutrient === 1 && Object.values(settings.nutrients).every(weight => weight === 1))) return doseFitScore(request, exposure);
  // With one physical endpoint and uniform fitting weights >=1 there is no
  // endpoint choice. Reuse the exact fit/safety components.
  // Estimated ranges must always evaluate the complete weighted endpoints.
  let uniform = fixedWeights.get(request);
  if (uniform === undefined) {
    const varying = [...request.currentSupplements, ...(request.dietaryIntake ?? [])].some(row =>
      (row.minimumDailyAmount ?? row.dailyAmount) !== (row.maximumDailyAmount ?? row.dailyAmount));
    uniform = !varying && Object.values(settings.nutrients).every(weight => weight === settings.defaultNutrient) ? settings.defaultNutrient : null;
    fixedWeights.set(request, uniform);
  }
  if (uniform !== null) {
    let cache = weightedCache.get(request); if (!cache) { cache = new WeakMap(); weightedCache.set(request, cache); }
    const found = cache.get(exposure); if (found) return found;
    const base = doseFitScore(request, exposure), parts = exactParts.get(base)!;
    const exact = add(multiply(fromDecimal(uniform), parts.fitting), parts.safety);
    const score = { ...base, total: value(exact) }; exactTotals.set(score, exact); cache.set(exposure, score); return score;
  }
  return calculateDoseFit(request, exposure, true);
}
function calculateDoseFit(request: CanonicalRequest, exposure: ReadonlyMap<string, bigint>, applyWeights: boolean): DoseFitScore {
  const memo = applyWeights ? weightedCache : scoreCache;
  let cache = memo.get(request);
  if (!cache) { cache = new WeakMap(); memo.set(request, cache); }
  const previous = cache.get(exposure);
  if (previous) return previous;
  let under = ZERO, over = ZERO, limit = ZERO, intentTotal = ZERO;
  const settings = applyWeights && request.scoring ? effectiveWeights(request.scoring) : null;
  const perTarget: DoseFitScore["perTarget"][number][] = [];
  const perContinuedDose: NonNullable<DoseFitScore["perContinuedDose"]>[number][] = [];
  const perLimit: DoseFitScore["perLimit"][number][] = [];
  const subjects = new Set([...exposure.keys(), ...(request.dietaryIntake ?? []).map((row) => row.subjectId), ...request.targets.map((row) => row.subjectId)]);
  for (const subjectId of [...subjects].sort()) {
    const { target, ranges, dietary, referenceRows, reference, scale, bounds } = subjectInputs(request, subjectId);
    const known = exposure.get(subjectId) ?? BigInt(0);
    const minimum = known + ranges.minimum - ranges.base, maximum = known + ranges.maximum - ranges.base;
    const added = known > ranges.base ? known - ranges.base : BigInt(0);
    const continuedIncrease = reference > BigInt(0) ? { num: added, den: reference } : ZERO;
    const weightValue = settings ? settings.nutrients[subjectId] ?? settings.defaultNutrient : 1;
    const weight = fromDecimal(weightValue);
    const cases = [...new Set([minimum, maximum])].flatMap((supplemental) =>
      [...new Set([dietary.minimum, dietary.maximum])].map((food) => {
        const want = target?.requested.units ?? BigInt(0);
        const targetExposure = supplemental + (target && targetBasis(target) === "total_daily" ? food : BigInt(0));
        const shortfall = want > BigInt(0) && targetExposure < want ? { num: want - targetExposure, den: want } : ZERO;
        const overshoot = add(target && want === BigInt(0) && scale ? { num: targetExposure, den: scale } : excess(targetExposure, want), continuedIncrease);
        const limits = bounds.map((row) => {
          const sourceScope = row.ceiling.sourceScope ?? "supplemental";
          const total = supplemental + (sourceScope === "total" ? food : BigInt(0));
          return { row, total, sourceScope, excess: excess(total, row.units) };
        });
        const limitLoss = limits.reduce((sum, row) => add(sum, row.excess), ZERO);
        const total = add(multiply(weight, add(shortfall, overshoot)), { num: limitLoss.num * BigInt(UPPER_LIMIT_EXTRA_WEIGHT), den: limitLoss.den });
        return { supplemental, food, targetExposure, shortfall, overshoot, limits, limitLoss, total };
      }));
    // Convex absolute deviation plus hinge penalties attains its worst value at
    // an interval endpoint. Choose the whole penalty, not max intake alone.
    const worst = cases.reduce((a, b) => compareFractions(b.total, a.total) > 0 ? b : a);
    intentTotal = add(intentTotal, worst.total);
    under = add(under, worst.shortfall);
    over = add(over, worst.overshoot);
    limit = add(limit, worst.limitLoss);
    const estimated = minimum !== maximum || dietary.minimum !== dietary.maximum;
    const rowCertainty = certainty(request, subjectId) === "unknown" ? "unknown" : estimated ? "estimated" : certainty(request, subjectId);
    if (target) {
      const amount = (units: bigint) => amountFromScaled({ ...target.requested, units }, target.requestedUnit, target.name) ?? 0;
      const includeFood = targetBasis(target) === "total_daily";
      perTarget.push({ basis: targetBasis(target), subjectId, name: target.name, unit: target.requestedUnit, target: target.requestedAmount,
        exposure: amount(known + (includeFood ? dietary.base : BigInt(0))),
        exposureMinimum: amount(minimum + (includeFood ? dietary.minimum : BigInt(0))),
        exposureMaximum: amount(maximum + (includeFood ? dietary.maximum : BigInt(0))),
        conservativeExposure: amount(worst.targetExposure), under: value(worst.shortfall), over: value(worst.overshoot), certainty: rowCertainty,
        ...(target.acceptableMinimum != null || target.acceptableMaximum != null ? {
          acceptableMinimum: target.acceptableMinimum ?? target.requestedAmount,
          acceptableMaximum: target.acceptableMaximum ?? target.requestedAmount,
          withinAcceptableRange: amount(minimum + (includeFood ? dietary.minimum : BigInt(0))) >= (target.acceptableMinimum ?? target.requestedAmount) &&
            amount(maximum + (includeFood ? dietary.maximum : BigInt(0))) <= (target.acceptableMaximum ?? target.requestedAmount)
        } : {}) });
    }
    if (reference > BigInt(0)) {
      const first = referenceRows[0]!;
      const amount = (units: bigint) => amountFromScaled({ ...first.daily, units }, first.unit, first.name) ?? 0;
      const referenceExposure = amount(reference + added);
      perContinuedDose.push({ subjectId, name: first.name, unit: first.unit, referenceBasis: "continued_dose",
        referenceDose: amount(reference), sourceIds: referenceRows.map(row => row.sourceId).sort(),
        exposure: referenceExposure, exposureMinimum: referenceExposure, exposureMaximum: referenceExposure,
        conservativeExposure: referenceExposure, over: value(continuedIncrease), certainty: rowCertainty });
    }
    for (const item of worst.limits) {
      const { row, sourceScope } = item;
      const amount = (units: bigint) => amountFromScaled({ dim: row.dim, subjectId, units }, row.ceiling.maxUnit, row.ceiling.name) ?? 0;
      perLimit.push({ subjectId, name: row.ceiling.name, unit: row.ceiling.maxUnit as MatcherUnit,
        exposure: amount(known + (sourceScope === "total" ? dietary.base : BigInt(0))),
        exposureMinimum: amount(minimum + (sourceScope === "total" ? dietary.minimum : BigInt(0))),
        exposureMaximum: amount(maximum + (sourceScope === "total" ? dietary.maximum : BigInt(0))),
        conservativeExposure: amount(item.total), limit: row.ceiling.maxAmount, excess: value(item.excess), sourceScope,
        ruleId: catalogBandRuleId(row.ceiling), authorityUrl: row.ceiling.authorityUrl ?? null, certainty: rowCertainty });
    }
  }
  const weighted = { num: limit.num * BigInt(UPPER_LIMIT_EXTRA_WEIGHT), den: limit.den };
  const exact = settings ? intentTotal : add(add(under, over), weighted);
  const score: DoseFitScore = { version: DOSE_FIT_VERSION, limitWeight: 2, under: value(under), over: value(over),
    limit: value(limit), weightedLimit: value(weighted), total: value(exact), perTarget, perContinuedDose, perLimit,
    unknownSubjectIds: [...new Set(request.unknownIntakeSubjectIds ?? [])].sort(),
    estimatedSubjectIds: [...new Set([...(request.estimatedIntakeSubjectIds ?? []), ...perTarget.filter((row) => row.certainty === "estimated").map((row) => row.subjectId)])].sort() };
  exactTotals.set(score, exact);
  exactParts.set(score, { fitting: add(under, over), safety: weighted });
  cache.set(exposure, score);
  return score;
}

/** Compare rational sums, not rounded display scores: even a tiny excess counts. */
export function compareDoseFit(left: DoseFitScore, right: DoseFitScore) {
  const a = exactTotals.get(left);
  const b = exactTotals.get(right);
  if (!a || !b) return left.total - right.total;
  const delta = a.num * b.den - b.num * a.den;
  return delta < BigInt(0) ? -1 : delta > BigInt(0) ? 1 : 0;
}

/** Fresh scoring callers reuse the original exact sum, never a rounded DTO. */
export function exactDoseFit(score: DoseFitScore): Fraction {
  const exact = exactTotals.get(score);
  if (!exact) throw new Error("Exact dose-fit score must be calculated from immutable inputs");
  return exact;
}

/** Annotate incomplete product evidence without changing the independently
 * tested arithmetic or losing its exact rational comparison identity. */
export function withProductUncertainty(score: DoseFitScore, subjectIds: readonly string[] = []): DoseFitScore {
  if (!subjectIds.length) return score;
  const unknown = new Set([...score.unknownSubjectIds, ...subjectIds]);
  const annotate = <T extends { subjectId: string; certainty: 'known' | 'estimated' | 'unknown' }>(row: T): T =>
    unknown.has(row.subjectId) || unknown.has('*') ? { ...row, certainty: 'unknown' } : row;
  const result: DoseFitScore = { ...score, unknownSubjectIds: [...unknown].sort(),
    perTarget: score.perTarget.map(annotate), perLimit: score.perLimit.map(annotate),
    ...(score.perContinuedDose ? { perContinuedDose: score.perContinuedDose.map(annotate) } : {}) };
  const exact = exactTotals.get(score);
  if (exact) exactTotals.set(result, exact);
  return result;
}
