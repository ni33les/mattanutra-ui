import { reduceSelectionCoverage, type SelectionCoverageSnapshot } from "@/lib/matcher/selection-coverage";

/** Choose the complementary pair at the saved doses, not the two best singles. */
export function starterProductIds(productIds: readonly string[], snapshot?: SelectionCoverageSnapshot | null): string[] {
  const ids = [...new Set(productIds)];
  const fallback = ids.slice(0, 2);
  if (ids.length <= 2 || reduceSelectionCoverage(snapshot, ids).status !== "verified") return fallback;
  let best = fallback, bestScore = -1;
  for (let first = 0; first < ids.length - 1; first += 1) {
    for (let second = first + 1; second < ids.length; second += 1) {
      const pair = [ids[first], ids[second]];
      const coverage = reduceSelectionCoverage(snapshot, pair);
      if (coverage.status !== "verified") return fallback;
      // Need percentages already have fixed precision; avoid rounding the mean before comparing.
      const score = coverage.needCoverage.reduce((sum, need) => sum + Math.round((need.coveragePercent ?? 0) * 100), 0);
      if (score > bestScore) { best = pair; bestScore = score; }
    }
  }
  return best;
}

export function readStoredWebBasketSelection(raw: string | null, productIds: readonly string[]): string[] | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("ids" in value)) return null;
    const ids = value.ids;
    if (!Array.isArray(ids) || ids.some(id => typeof id !== "string" || !productIds.includes(id)) || new Set(ids).size !== ids.length) return null;
    return ids;
  } catch { return null; }
}
