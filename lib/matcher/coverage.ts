import { amountFromScaled } from '@/lib/matcher/dose';
import { intakeIsKnown, targetBasis } from '@/lib/matcher/target-basis';
import type { CanonicalRequest, CoverageSummaryRow, Exposure } from '@/lib/matcher/types';
/** One factual ledger for matching, option summaries and remaining-gap advice.
 * Nominal estimates are shown separately and never count as known coverage. */
export function coverageSummary(request: CanonicalRequest, exposure: Exposure): CoverageSummaryRow[] {
  return request.targets.map(target => {
    const subjectId = target.subjectId;
    const supplements = request.currentSupplements.filter(row => row.subjectId === subjectId);
    const food = targetBasis(target) === 'total_daily' ? (request.dietaryIntake ?? []).filter(row => row.subjectId === subjectId) : [];
    const current = [...supplements, ...food];
    const known = current.filter(intakeIsKnown).reduce((sum, row) => sum + row.daily.units, BigInt(0));
    const estimated = current.filter(row => !intakeIsKnown(row)).reduce((sum, row) => sum + row.daily.units, BigInt(0));
    const newUnits = exposure.provenance.filter(row => row.source === 'selected' && row.subjectId === subjectId).reduce((sum, row) => sum + row.amount.units, BigInt(0));
    const total = known + newUnits;
    const unknown = Boolean(request.unknownIntakeSubjectIds?.some(id => id === subjectId || id === '*') ||
      exposure.unknownSubjectIds?.includes(subjectId) || current.some(row => row.certainty === 'unknown'));
    const uncertain = unknown || current.some(row => !intakeIsKnown(row)) || Boolean(request.estimatedIntakeSubjectIds?.some(id => id === subjectId || id === '*'));
    const zeroMet = target.requested.units === BigInt(0) && total === BigInt(0) && !uncertain;
    const amount = (units: bigint) => amountFromScaled({ ...target.requested, units }, target.requestedUnit, target.name) ?? 0;
    const gap = target.requested.units > total ? target.requested.units - total : BigInt(0);
    const excess = total > target.requested.units ? total - target.requested.units : BigInt(0);
    return { subjectId, name: target.name, unit: target.requestedUnit, target: target.requestedAmount, importance: target.importance,
      basis: targetBasis(target), knownCurrent: amount(known), estimatedCurrent: amount(estimated), unknown: target.requested.units === BigInt(0) ? uncertain : unknown,
      newContribution: amount(newUnits), quantifiedTotal: amount(total + estimated), knownTotal: amount(total),
      remainingGap: amount(gap), excess: amount(excess), fullyMet: zeroMet || (target.requested.units > 0 && total >= target.requested.units),
      coveragePercent: target.requested.units > 0 ? Number((total < target.requested.units ? total : target.requested.units) * BigInt(10000) / target.requested.units) / 100 : zeroMet ? 100 : 0 };
  });
}
