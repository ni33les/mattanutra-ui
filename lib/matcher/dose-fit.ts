import { DOSE_FIT_VERSION, UPPER_LIMIT_EXTRA_WEIGHT } from "@/lib/matcher/config";
import { amountFromScaled, isDoseError, scaleAmount } from "@/lib/matcher/dose";
import { catalogBandRuleId, safetyCeilingFor } from "@/lib/matcher/safety-ceilings";
import { intakeIsKnown, targetBasis } from "@/lib/matcher/target-basis";
import { zeroTargetScale } from "@/lib/matcher/zero-target-policy";
import { effectiveWeights } from "@/lib/matcher/scoring-policy";
import { add, compare as compareFractions, fromDecimal, multiply, sum, toNumber as value } from "@/lib/matcher/rational";
import type { CanonicalRequest, DoseDimension, DoseFitScore, MatcherUnit, SafetyCeiling } from "@/lib/matcher/types";

type Fraction = Readonly<{ num: bigint; den: bigint }>;
const ZERO: Fraction = { num: BigInt(0), den: BigInt(1) };
type TargetDeviation = Pick<DoseFitScore["perTarget"][number], "subjectId" | "under" | "over">;
export type NumericalDoseFitScore = Readonly<{ exact: Fraction; fitting: Fraction; safety: Fraction; deviations: readonly TargetDeviation[] }>;
const exactFacts = new WeakMap<DoseFitScore, NumericalDoseFitScore>();
/** Frontier comparisons need deviations, not unit-converted display rows. */
export function doseFitTargetDeviations(score: NumericalDoseFitScore | DoseFitScore) { return "deviations" in score ? score.deviations : exactFacts.get(score)?.deviations ?? score.perTarget; }
const fixedWeights = new WeakMap<CanonicalRequest, number | null>();
const scoreCache = new WeakMap<CanonicalRequest, WeakMap<object, NumericalDoseFitScore>>();
const weightedCache = new WeakMap<CanonicalRequest, WeakMap<object, NumericalDoseFitScore>>();
const sharedInputs = new WeakMap<CanonicalRequest, CanonicalRequest>();
// Live additions retain only their parent exposure and the variant's immutable
// subject list. Checkpoints carry ordinary maps and use the full evaluator until
// another live addition establishes a parent; no recovery format changes.
const exposureChanges = new WeakMap<object, { parent: ReadonlyMap<string, bigint>; subjects: readonly string[] }>();
export function registerDoseFitChange(exposure: ReadonlyMap<string, bigint>, parent: ReadonlyMap<string, bigint>, subjects: readonly string[]) {
  exposureChanges.set(exposure, { parent, subjects });
}
/** Only the internal profile copier calls this: all intake, target and reference
 * objects are shared immutable inputs, while weighted endpoint caches stay separate. */
export function shareDoseFitInputs(profile: CanonicalRequest, source: CanonicalRequest) {
  sharedInputs.set(profile, sharedInputs.get(source) ?? source);
}
const ONE = fromDecimal(1);
const weightCache = new WeakMap<ReturnType<typeof effectiveWeights>, { defaultWeight: Fraction; subjects: Map<string, Fraction> }>();
function exactWeights(settings: ReturnType<typeof effectiveWeights>) {
  let value = weightCache.get(settings);
  if (!value) {
    value = { defaultWeight: fromDecimal(settings.defaultNutrient), subjects: new Map(Object.entries(settings.nutrients).map(([id, weight]) => [id, fromDecimal(weight)])) };
    weightCache.set(settings, value);
  }
  return value;
}

function excess(amount: bigint, limit: bigint): Fraction {
  return amount > limit && limit > BigInt(0) ? { num: amount - limit, den: limit } : ZERO;
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

const fixedSubjects = new WeakMap<CanonicalRequest, readonly string[] | null>();
const requestedSubjects = new WeakMap<CanonicalRequest, Set<string>>();
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
  return { requested, target, ranges, dietary, referenceRows, reference, scale, bounds: limitsFor(request, subjectId), losses: new Map<Fraction, Map<bigint, ReturnType<typeof subjectLoss>>>() };
}
function subjectInputs(request: CanonicalRequest, subjectId: string) {
  request = sharedInputs.get(request) ?? request;
  let compiled = subjectCache.get(request); if (!compiled) { compiled = new Map(); subjectCache.set(request, compiled); }
  let value = compiled.get(subjectId); if (!value) { value = compileSubject(request, subjectId); compiled.set(subjectId, value); } return value;
}

/** Request-local exact endpoint terms. Different baskets commonly supply the
 * same amount of one nutrient; profile weights and uncertain endpoints stay isolated. */
function subjectLoss(input: { target: CanonicalRequest["targets"][number] | undefined; ranges: ReturnType<typeof rangeOffsets>; dietary: ReturnType<typeof rangeOffsets>; reference: bigint; scale: bigint | undefined; bounds: readonly Limit[] }, known: bigint, weight: Fraction) {
  const { target, ranges, dietary, reference, scale, bounds } = input;
  const minimum = known + ranges.minimum - ranges.base, maximum = known + ranges.maximum - ranges.base;
  const added = known > ranges.base ? known - ranges.base : BigInt(0);
  const continuedIncrease = reference > BigInt(0) ? { num: added, den: reference } : ZERO;
  const endpoint = (supplemental: bigint, food: bigint) => {
    const want = target?.requested.units ?? BigInt(0);
    const targetExposure = supplemental + (target && targetBasis(target) === "total_daily" ? food : BigInt(0));
    const shortfall = want > BigInt(0) && targetExposure < want ? { num: want - targetExposure, den: want } : ZERO;
    const overshoot = add(target && want === BigInt(0) && scale ? { num: targetExposure, den: scale } : excess(targetExposure, want), continuedIncrease);
    const limits = bounds.map((row) => {
      const sourceScope = row.ceiling.sourceScope ?? "supplemental";
      const total = supplemental + (sourceScope === "total" ? food : BigInt(0));
      return { row, total, sourceScope, excess: excess(total, row.units) };
    });
    const fitting = sum([shortfall, overshoot]), limitLoss = sum(limits.map(row => row.excess));
    const safety = sum([{ num: limitLoss.num * BigInt(UPPER_LIMIT_EXTRA_WEIGHT), den: limitLoss.den }]);
    const total = add(multiply(weight, fitting), safety);
    return { supplemental, food, targetExposure, shortfall, overshoot, limits, limitLoss, fitting, safety, total };
  };
  // Compare the complete penalty at each distinct interval endpoint. Preserve
  // endpoint order when losses tie, without temporary sets or Cartesian arrays.
  let worst: ReturnType<typeof endpoint> | undefined;
  for (let supply = 0; supply < (minimum === maximum ? 1 : 2); supply++) {
    for (let diet = 0; diet < (dietary.minimum === dietary.maximum ? 1 : 2); diet++) {
      const candidate = endpoint(supply ? maximum : minimum, diet ? dietary.maximum : dietary.minimum);
      if (!worst || compareFractions(candidate.total, worst.total) > 0) worst = candidate;
    }
  }
  return { minimum, maximum, added, continuedIncrease, worst: worst!,
    deviation: target ? { subjectId: target.subjectId, under: value(worst!.shortfall), over: value(worst!.overshoot) } : null };
}
function cachedSubjectLoss(input: ReturnType<typeof compileSubject>, known: bigint, weight: Fraction) {
  let cache = input.losses.get(weight);
  if (!cache) { cache = new Map(); input.losses.set(weight, cache); }
  let value = cache.get(known);
  if (!value) {
    value = subjectLoss(input, known, weight);
    if (cache.size >= 256) cache.delete(cache.keys().next().value!);
    cache.set(known, value);
  }
  return value;
}

export function numericalDoseFitScore(request: CanonicalRequest, exposure: ReadonlyMap<string, bigint>): NumericalDoseFitScore {
  return calculateDoseFit(sharedInputs.get(request) ?? request, exposure, false);
}
export function numericalWeightedDoseFitScore(request: CanonicalRequest, exposure: ReadonlyMap<string, bigint>): NumericalDoseFitScore {
  const settings = request.scoring ? effectiveWeights(request.scoring) : null;
  if (!settings || (settings.defaultNutrient === 1 && Object.values(settings.nutrients).every(weight => weight === 1))) return numericalDoseFitScore(request, exposure);
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
    const base = numericalDoseFitScore(request, exposure);
    const score = { ...base, exact: add(multiply(exactWeights(settings).defaultWeight, base.fitting), base.safety) };
    cache.set(exposure, score); return score;
  }
  return calculateDoseFit(request, exposure, true);
}

function appendDifference(terms: Fraction[], next: Fraction, previous: Fraction) {
  if (next === previous) return;
  const sameDenominator = next.den === previous.den;
  const num = sameDenominator ? next.num - previous.num : next.num * previous.den - previous.num * next.den;
  if (num !== BigInt(0)) terms.push({ num, den: sameDenominator ? next.den : next.den * previous.den });
}

function incrementalDoseFit(request: CanonicalRequest, exposure: ReadonlyMap<string, bigint>, parent: NumericalDoseFitScore,
  change: { parent: ReadonlyMap<string, bigint>; subjects: readonly string[] }, applyWeights: boolean): NumericalDoseFitScore | null {
  const fittingTerms = [parent.fitting], safetyTerms = [parent.safety], intentTerms = [parent.exact];
  const settings = applyWeights && request.scoring ? effectiveWeights(request.scoring) : null;
  const weights = settings ? exactWeights(settings) : null;
  let deviations = parent.deviations;
  for (const subjectId of change.subjects) {
    const known = exposure.get(subjectId) ?? BigInt(0), previousKnown = change.parent.get(subjectId) ?? BigInt(0);
    if (known === previousKnown) continue;
    const compiled = subjectInputs(request, subjectId);
    if (!compiled.target && compiled.reference === BigInt(0) && compiled.bounds.length === 0) continue;
    const weight = weights ? weights.subjects.get(subjectId) ?? weights.defaultWeight : ONE;
    // A cached parent score can outlive its individual endpoint terms. Rebuilding
    // an old endpoint solely to subtract it adds work; use the full evaluator.
    const before = compiled.losses.get(weight)?.get(previousKnown);
    if (!before) return null;
    const after = cachedSubjectLoss(compiled, known, weight);
    appendDifference(fittingTerms, after.worst.fitting, before.worst.fitting);
    appendDifference(safetyTerms, after.worst.safety, before.worst.safety);
    if (settings) appendDifference(intentTerms, after.worst.total, before.worst.total);
    if (after.deviation) {
      // Targets are present even at zero exposure. Preserve the existing stable
      // subject order and share untouched immutable deviation rows.
      if (deviations === parent.deviations) deviations = [...deviations];
      // The parent already includes every active target, even at zero exposure.
      // Adding exposure cannot introduce a new target into this immutable request.
      const index = deviations.findIndex(row => row.subjectId === subjectId);
      (deviations as TargetDeviation[])[index] = after.deviation;
    }
  }
  const fitting = fittingTerms.length === 1 ? parent.fitting : sum(fittingTerms);
  const safety = safetyTerms.length === 1 ? parent.safety : sum(safetyTerms);
  const exact = settings ? (intentTerms.length === 1 ? parent.exact : sum(intentTerms)) : add(fitting, safety);
  // Keep a distinct numerical identity: equal penalties can still have different
  // display exposures or newly encountered incidental nutrient rows.
  return { exact, fitting, safety, deviations };
}

function calculateDoseFit(request: CanonicalRequest, exposure: ReadonlyMap<string, bigint>, applyWeights: boolean, materialize: true): DoseFitScore;
function calculateDoseFit(request: CanonicalRequest, exposure: ReadonlyMap<string, bigint>, applyWeights: boolean, materialize?: false): NumericalDoseFitScore;
function calculateDoseFit(request: CanonicalRequest, exposure: ReadonlyMap<string, bigint>, applyWeights: boolean, materialize = false): NumericalDoseFitScore | DoseFitScore {
  const memo = applyWeights ? weightedCache : scoreCache;
  let cache = memo.get(request);
  if (!cache) { cache = new WeakMap(); memo.set(request, cache); }
  const previous = cache.get(exposure);
  if (previous && !materialize) return previous;
  if (!materialize) {
    const change = exposureChanges.get(exposure), parent = change && cache.get(change.parent);
    // Once the raw score exists, uniform profiles reuse it and later weighted
    // endpoints can use the full evaluator. No child needs to retain its parent's
    // exposure map for the remaining lifetime of a large search archive.
    if (!applyWeights && change) exposureChanges.delete(exposure);
    // Replacing terms reads both the old and new loss. A broad update is cheaper
    // with the full evaluator. Target count is a conservative lower bound for
    // active subjects, so incidental limits cannot make this estimate optimistic.
    if (change && parent && change.subjects.length * 3 <= parent.deviations.length) {
      const score = incrementalDoseFit(request, exposure, parent, change, applyWeights);
      if (score) { cache.set(exposure, score); return score; }
    }
  }
  const fittingTerms: Fraction[] = [], safetyTerms: Fraction[] = [], intentTerms: Fraction[] = [];
  const displayTerms: Fraction[][] | null = materialize ? [[], [], []] : null;
  const settings = applyWeights && request.scoring ? effectiveWeights(request.scoring) : null;
  const weights = settings ? exactWeights(settings) : null;
  const perTarget: DoseFitScore["perTarget"][number][] | null = materialize ? [] : null;
  const perContinuedDose: NonNullable<DoseFitScore["perContinuedDose"]>[number][] | null = materialize ? [] : null;
  const perLimit: DoseFitScore["perLimit"][number][] | null = materialize ? [] : null;
  const deviations: TargetDeviation[] = [], estimatedTargets: string[] = [];
  let fixed = fixedSubjects.get(request);
  if (fixed === undefined) {
    fixed = request.currentSupplements.length === 0 && (!knownLimitProfile(request) || !request.safetyCeilings?.length)
      ? [...new Set([...(request.dietaryIntake ?? []).map(row => row.subjectId), ...request.targets.map(row => row.subjectId)])].sort() : null;
    fixedSubjects.set(request, fixed);
  }
  // Display rows retain their historical ordering. Exact numeric sums are
  // order-independent; avoid allocating and sorting a set for every basket.
  let requested = requestedSubjects.get(request);
  if (!requested) { requested = new Set([...(request.dietaryIntake ?? []).map(row => row.subjectId), ...request.targets.map(row => row.subjectId)]); requestedSubjects.set(request, requested); }
  const subjects = fixed ?? (materialize ? [...new Set([...exposure.keys(), ...requested])].sort()
    : [...requested, ...exposure.keys()].filter((id, index) => index < requested.size || !requested.has(id)));
  for (const subjectId of subjects) {
    const compiled = subjectInputs(request, subjectId);
    const { target, dietary, referenceRows, reference, bounds } = compiled;
    if (!target && reference === BigInt(0) && bounds.length === 0) continue;
    const known = exposure.get(subjectId) ?? BigInt(0);
    const weight = weights ? weights.subjects.get(subjectId) ?? weights.defaultWeight : ONE;
    const { minimum, maximum, added, continuedIncrease, worst, deviation } = cachedSubjectLoss(compiled, known, weight);
    if (settings) intentTerms.push(worst.total);
    fittingTerms.push(worst.fitting);
    safetyTerms.push(worst.safety);
    if (deviation) deviations.push(deviation);
    if (!materialize) continue;
    displayTerms![0]!.push(worst.shortfall); displayTerms![1]!.push(worst.overshoot); displayTerms![2]!.push(worst.limitLoss);
    const estimated = minimum !== maximum || dietary.minimum !== dietary.maximum;
    const rowCertainty = certainty(request, subjectId) === "unknown" ? "unknown" : estimated ? "estimated" : certainty(request, subjectId);
    if (target && rowCertainty === "estimated") estimatedTargets.push(subjectId);
    if (target) {
      const amount = (units: bigint) => amountFromScaled({ ...target.requested, units }, target.requestedUnit, target.name) ?? 0;
      const includeFood = targetBasis(target) === "total_daily";
      perTarget!.push({ basis: targetBasis(target), subjectId, name: target.name, unit: target.requestedUnit, target: target.requestedAmount,
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
      perContinuedDose!.push({ subjectId, name: first.name, unit: first.unit, referenceBasis: "continued_dose",
        referenceDose: amount(reference), sourceIds: referenceRows.map(row => row.sourceId).sort(),
        exposure: referenceExposure, exposureMinimum: referenceExposure, exposureMaximum: referenceExposure,
        conservativeExposure: referenceExposure, over: value(continuedIncrease), certainty: rowCertainty });
    }
    for (const item of worst.limits) {
      const { row, sourceScope } = item;
      const amount = (units: bigint) => amountFromScaled({ dim: row.dim, subjectId, units }, row.ceiling.maxUnit, row.ceiling.name) ?? 0;
      perLimit!.push({ subjectId, name: row.ceiling.name, unit: row.ceiling.maxUnit as MatcherUnit,
        exposure: amount(known + (sourceScope === "total" ? dietary.base : BigInt(0))),
        exposureMinimum: amount(minimum + (sourceScope === "total" ? dietary.minimum : BigInt(0))),
        exposureMaximum: amount(maximum + (sourceScope === "total" ? dietary.maximum : BigInt(0))),
        conservativeExposure: amount(item.total), limit: row.ceiling.maxAmount, excess: value(item.excess), sourceScope,
        ruleId: catalogBandRuleId(row.ceiling), authorityUrl: row.ceiling.authorityUrl ?? null, certainty: rowCertainty });
    }
  }
  const fitting = fittingTerms.length === 1 ? fittingTerms[0]! : sum(fittingTerms);
  const weighted = safetyTerms.length === 1 ? safetyTerms[0]! : sum(safetyTerms);
  const exact = settings ? (intentTerms.length === 1 ? intentTerms[0]! : sum(intentTerms)) : add(fitting, weighted);
  const facts = { exact, fitting, safety: weighted, deviations };
  if (!materialize) {
    deviations.sort((a, b) => a.subjectId < b.subjectId ? -1 : a.subjectId > b.subjectId ? 1 : 0);
    cache.set(exposure, facts); return facts;
  }
  const [under, over, limit] = displayTerms!.map(sum);
  const score = { version: DOSE_FIT_VERSION, limitWeight: 2 as const, under: value(under), over: value(over),
    limit: value(limit), weightedLimit: value(weighted), total: value(exact), perTarget: perTarget!, perContinuedDose: perContinuedDose!, perLimit: perLimit!,
      unknownSubjectIds: [...new Set(request.unknownIntakeSubjectIds ?? [])].sort(),
      estimatedSubjectIds: [...new Set([...(request.estimatedIntakeSubjectIds ?? []), ...estimatedTargets])].sort() };
  exactFacts.set(score, facts);
  return score;
}

// Only retained results need units, sources, certainty arrays and response fields.
// Rendering reuses the same compiled endpoint evaluator; there is no second formula.
const displayScores = new WeakMap<NumericalDoseFitScore, DoseFitScore>();
function displayScore(request: CanonicalRequest, exposure: ReadonlyMap<string, bigint>, weighted: boolean): DoseFitScore {
  const numerical = weighted ? numericalWeightedDoseFitScore(request, exposure) : numericalDoseFitScore(request, exposure);
  let display = displayScores.get(numerical);
  if (!display) {
    display = calculateDoseFit(weighted ? request : sharedInputs.get(request) ?? request, exposure, weighted, true);
    displayScores.set(numerical, display);
  }
  return display;
}
export function doseFitScore(request: CanonicalRequest, exposure: ReadonlyMap<string, bigint>): DoseFitScore {
  return displayScore(request, exposure, false);
}
export function weightedDoseFitScore(request: CanonicalRequest, exposure: ReadonlyMap<string, bigint>): DoseFitScore {
  return displayScore(request, exposure, true);
}

/** Compare rational sums, not rounded display scores: even a tiny excess counts. */
export function compareDoseFit(left: NumericalDoseFitScore | DoseFitScore, right: NumericalDoseFitScore | DoseFitScore) {
  const a = "exact" in left ? left.exact : exactFacts.get(left)?.exact;
  const b = "exact" in right ? right.exact : exactFacts.get(right)?.exact;
  if (!a || !b) return ("total" in left ? left.total : value(left.exact)) - ("total" in right ? right.total : value(right.exact));
  return compareFractions(a, b);
}

/** Fresh scoring callers reuse the original exact sum, never a rounded DTO. */
export function exactDoseFit(score: NumericalDoseFitScore | DoseFitScore): Fraction {
  const exact = "exact" in score ? score.exact : exactFacts.get(score)?.exact;
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
  const exact = exactFacts.get(score);
  if (exact) exactFacts.set(result, exact);
  return result;
}
