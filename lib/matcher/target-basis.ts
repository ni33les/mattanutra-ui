import type { CanonicalCurrent, CanonicalRequest, CanonicalTarget } from "@/lib/matcher/types";
import { isDoseError, scaleAmount } from "@/lib/matcher/dose";

export function intakeIsKnown(row: CanonicalCurrent) {
  return (row.certainty ?? "known") === "known" &&
    (row.minimumDailyAmount ?? row.dailyAmount) === row.dailyAmount &&
    (row.maximumDailyAmount ?? row.dailyAmount) === row.dailyAmount;
}

export function targetBasis(target: CanonicalTarget) { return target.basis ?? "supplemental"; }

/** Coverage is a claim about known intake. Estimates remain in dose-fit ranges,
 * but their nominal amount must not become guaranteed coverage. */
export function knownTargetExposure(request: CanonicalRequest, target: CanonicalTarget, supplemental: bigint) {
  const uncertainCurrent = request.currentSupplements.filter(row => row.subjectId === target.subjectId && !intakeIsKnown(row))
    .reduce((sum, row) => sum + row.daily.units, BigInt(0));
  const diet = targetBasis(target) === "total_daily" ? (request.dietaryIntake ?? [])
    .filter(row => row.subjectId === target.subjectId && intakeIsKnown(row))
    .reduce((sum, row) => sum + row.daily.units, BigInt(0)) : BigInt(0);
  const knownSupplemental = supplemental > uncertainCurrent ? supplemental - uncertainCurrent : BigInt(0);
  return knownSupplemental + diet;
}

export function knownCurrentTargetExposure(request: CanonicalRequest, target: CanonicalTarget) {
  const supplemental = request.currentSupplements.filter(row => row.subjectId === target.subjectId)
    .reduce((sum, row) => sum + row.daily.units, BigInt(0));
  return knownTargetExposure(request, target, supplemental);
}

type IntakeBounds = Readonly<{ minimum: bigint; maximum: bigint; nominal: bigint; supplemental: bigint; known: bigint }>;
const intakeBoundsCache = new WeakMap<CanonicalRequest, Map<CanonicalTarget, IntakeBounds>>();

/** Candidate breakpoints may use quantified estimates. This does not make
 * those estimates known intake or guaranteed target coverage. */
function targetIntakeBounds(request: CanonicalRequest, target: CanonicalTarget): IntakeBounds {
  let cache = intakeBoundsCache.get(request);
  if (!cache) { cache = new Map(); intakeBoundsCache.set(request, cache); }
  const cached = cache.get(target);
  if (cached) return cached;
  const rows = [...request.currentSupplements,
    ...(targetBasis(target) === "total_daily" ? request.dietaryIntake ?? [] : [])];
  let minimum = BigInt(0), maximum = BigInt(0), nominal = BigInt(0);
  for (const row of rows) {
    if (row.subjectId !== target.subjectId) continue;
    const lo = scaleAmount({ amount: row.minimumDailyAmount ?? row.dailyAmount, subjectId: row.subjectId, subjectName: row.name, unit: row.unit });
    const hi = scaleAmount({ amount: row.maximumDailyAmount ?? row.dailyAmount, subjectId: row.subjectId, subjectName: row.name, unit: row.unit });
    minimum += isDoseError(lo) ? row.daily.units : lo.units;
    maximum += isDoseError(hi) ? row.daily.units : hi.units;
    nominal += row.daily.units;
  }
  const supplemental = request.currentSupplements.filter(row => row.subjectId === target.subjectId)
    .reduce((sum, row) => sum + row.daily.units, BigInt(0));
  const result = { minimum, maximum, nominal, supplemental, known: knownCurrentTargetExposure(request, target) };
  cache.set(target, result);
  return result;
}

/** Neighbouring physically supported quantities around known, nominal and
 * interval endpoint/midpoint residuals. Midpoints stay rational: no capsule
 * splitting or floating-point rounding is introduced by an intake estimate. */
export function targetDoseTicks(request: CanonicalRequest, target: CanonicalTarget, perServing: bigint,
  step: Readonly<{ num: bigint; den: bigint }>, supplementalExposure?: bigint, reference = target.requested.units): bigint[] {
  const bounds = targetIntakeBounds(request, target);
  const added = supplementalExposure == null ? BigInt(0) : supplementalExposure - bounds.supplemental;
  const twice = BigInt(2);
  const exposures = new Set([bounds.known * twice, bounds.nominal * twice, bounds.minimum * twice,
    bounds.maximum * twice, bounds.minimum + bounds.maximum]);
  const ticks = new Set<bigint>();
  for (const exposure of exposures) {
    const remainder = reference * twice - exposure - added * twice;
    const floor = (remainder > 0 ? remainder : BigInt(0)) * step.den / (twice * perServing * step.num);
    for (const value of [floor - BigInt(1), floor, floor + BigInt(1)]) {
      if (value > 0 && value <= BigInt(Number.MAX_SAFE_INTEGER)) ticks.add(value);
    }
  }
  return [...ticks].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}
