/** Every requested row counts, including unresolved nutrients and deferred targets. */
export function requestedTargetCoverage(coverage: readonly Readonly<{ status: string }>[]) {
  const coveredCount = coverage.filter(row => ["covered", "already_covered", "over_target"].includes(row.status)).length;
  return { coveredCount, requestedCount: coverage.length, coveragePercent: coverage.length ? Math.round(100 * coveredCount / coverage.length) : 0 };
}
