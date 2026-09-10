/** Independent public quantity check for the optional-target customer-value cases. */
export function optionalTargetAmountsAreCoherent(row: Record<string, unknown> | undefined, target: number): boolean {
  if (!row || row.importance !== 'optional' || row.requestedAmount !== target) return false;
  const actual = Number(row.quantifiedExposureAmount);
  if (!Number.isFinite(actual) || actual < 0 || !(target > 0)) return false;
  const expected = actual > target ? 'over_target' : actual === target ? 'covered' : actual > 0 ? 'partial' : 'optional_omitted';
  const status = row.status === expected || (row.status === 'already_covered' && Number(row.currentAmount) >= target);
  return status && Number(row.remainingGap) === Math.max(0, target - actual) &&
    Number(row.excess) === Math.max(0, actual - target) &&
    Math.abs(Number(row.coveragePercent) - Math.floor(Math.min(100, actual / target * 100) * 100) / 100) <= 0.000001;
}
