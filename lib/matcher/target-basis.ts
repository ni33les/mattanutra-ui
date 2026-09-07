import type { CanonicalCurrent, CanonicalRequest, CanonicalTarget } from "@/lib/matcher/types";

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
