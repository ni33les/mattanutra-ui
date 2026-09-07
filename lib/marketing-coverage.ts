export const FORMULA_NEED_COVERED_PERCENT = 100;

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

/** Display precision never promotes a partial dose to full coverage. */
export function displayCoveragePercent(value: number) {
  const bounded = boundedNeedPercent(value);
  return Math.min(bounded < 100 ? 99.99 : 100, Math.round(bounded * 100) / 100);
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

  return displayCoveragePercent(total / rows.length);
}
