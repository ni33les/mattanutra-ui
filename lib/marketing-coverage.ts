export function marketingCoveragePercentFromNeedCoverage(
  needs: readonly {
    coveragePercent: number;
    itemType?: string;
  }[]
) {
  const rows = needs.filter((need) => need.itemType !== "food");

  if (rows.length < 1) {
    return 0;
  }

  const total = rows.reduce((sum, need) => {
    const percent = Number(need.coveragePercent);
    if (!Number.isFinite(percent)) {
      return sum;
    }

    return sum + Math.min(100, Math.max(0, percent));
  }, 0);

  return Math.max(0, Math.min(100, Math.round(total / rows.length)));
}
