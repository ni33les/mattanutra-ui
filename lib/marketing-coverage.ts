export const FORMULA_NEED_COVERED_PERCENT = 90;

type NeedCoverageRow = Readonly<{
  coveragePercent: number;
  itemType?: string;
}>;

function formulaNeedRows(needs: readonly NeedCoverageRow[]) {
  return needs.filter((need) => need.itemType !== "food");
}

function boundedNeedPercent(value: unknown) {
  const percent = Number(value);

  if (!Number.isFinite(percent)) {
    return 0;
  }

  return Math.min(100, Math.max(0, percent));
}

export function formulaNeedCount(needs: readonly NeedCoverageRow[]) {
  return formulaNeedRows(needs).length;
}

export function coveredFormulaNeedCount(needs: readonly NeedCoverageRow[]) {
  return formulaNeedRows(needs).filter(
    (need) => boundedNeedPercent(need.coveragePercent) >= FORMULA_NEED_COVERED_PERCENT
  ).length;
}

export function marketingCoveragePercentFromNeedCoverage(
  needs: readonly NeedCoverageRow[]
) {
  const rows = formulaNeedRows(needs);

  if (rows.length < 1) {
    return 0;
  }

  const total = rows.reduce(
    (sum, need) => sum + boundedNeedPercent(need.coveragePercent),
    0
  );

  return Math.max(0, Math.min(100, Math.round(total / rows.length)));
}
