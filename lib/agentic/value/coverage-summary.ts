import { marketingCoveragePercentFromNeedCoverage } from "@/lib/marketing-coverage";

/** Proportional dose coverage and fully met target counts are distinct measures.
 * Every requested row counts, including unresolved and optional targets. */
export function requestedTargetCoverage(coverage: readonly Readonly<{ status: string; coveragePercent: number }>[]) {
  const coveredCount = coverage.filter(row => ["covered", "already_covered", "over_target"].includes(row.status)).length;
  return { coveredCount, requestedCount: coverage.length, coveragePercent: marketingCoveragePercentFromNeedCoverage(coverage) };
}
