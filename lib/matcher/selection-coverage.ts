import { COVERAGE_SCALE } from "@/lib/matcher/config";
import { targetCoverageUnits } from "@/lib/matcher/dominance";
import { marketingCoveragePercentFromNeedCoverage } from "@/lib/marketing-coverage";
import type { ProductNeedCoverage } from "@/lib/formulation-types";
import type { ProductRecommendationNeed } from "@/lib/product-recommendation-types";
import type { CanonicalCurrent, CanonicalTarget, ScaledAmount } from "@/lib/matcher/types";

type CoverageNeed = Pick<ProductRecommendationNeed, "id" | "sourceId" | "normalizedName" | "displayName" | "itemType">;
export type StoredCoverageAmount = Omit<ScaledAmount, "units"> & { units: string };
export type SelectionCoverageSnapshot = Readonly<{
  version: 1;
  needs: readonly CoverageNeed[];
  targets: readonly (Omit<CanonicalTarget, "requested"> & { requested: StoredCoverageAmount })[];
  currentSupplements: readonly (Omit<CanonicalCurrent, "daily"> & { daily: StoredCoverageAmount })[];
  dietaryIntake: readonly (Omit<CanonicalCurrent, "daily"> & { daily: StoredCoverageAmount })[];
  unknownIntakeSubjectIds: readonly string[];
  estimatedIntakeSubjectIds: readonly string[];
  products: readonly Readonly<{
    productId: string;
    dailyUnits: number;
    contributions: readonly StoredCoverageAmount[];
  }>[];
}>;

export function needSubjectIds(need: Pick<CoverageNeed, "id" | "sourceId" | "normalizedName">) {
  const sourceId = need.sourceId?.trim();
  const id = need.id?.trim();
  const fromPrefixed = id?.includes(":") ? id.slice(id.indexOf(":") + 1) : null;
  const raw = [need.normalizedName?.trim(), sourceId, id, fromPrefixed].filter(Boolean) as string[];
  return [...new Set(raw.flatMap(value => [value, value.replace(/-/g, "_"), value.replace(/_/g, "-")]))];
}

export function matcherNeedCoveragePercent(coverageBySubject: ReadonlyMap<string, number> | undefined, need: Pick<CoverageNeed, "id" | "sourceId" | "normalizedName">) {
  let units = 0;
  for (const subjectId of needSubjectIds(need)) units = Math.max(units, coverageBySubject?.get(subjectId) ?? 0);
  return Math.max(0, Math.min(100, units / (COVERAGE_SCALE / 100)));
}

export type SelectionCoverage = Readonly<{
  status: "verified" | "unknown";
  coveragePercent: number | null;
  needCoverage: ProductNeedCoverage[];
  removedNeedIds: string[];
}>;

function restoredAmount(value: StoredCoverageAmount): ScaledAmount {
  if (!/^[0-9]{1,40}$/.test(value.units)) throw new Error("Invalid coverage units");
  return { ...value, units: BigInt(value.units) };
}

/** Recount only frozen, verified amounts at their original daily dose. Removing
 * a product never invokes matching or changes another product's quantity.
 * Older runs lack this evidence: their basket percentage cannot be prorated. */
export function reduceSelectionCoverage(snapshot: SelectionCoverageSnapshot | undefined | null, selectedProductIds: readonly string[]): SelectionCoverage {
  const unknown: SelectionCoverage = { status: "unknown", coveragePercent: null, needCoverage: [], removedNeedIds: [] };
  if (!snapshot || snapshot.version !== 1) return unknown;
  try {
    const productIds = new Set(snapshot.products.map(product => product.productId));
    if (productIds.size !== snapshot.products.length || new Set(selectedProductIds).size !== selectedProductIds.length || selectedProductIds.some(id => !productIds.has(id))) return unknown;
    const request = {
      currentSupplements: snapshot.currentSupplements.map(row => ({ ...row, daily: restoredAmount(row.daily) })),
      dietaryIntake: snapshot.dietaryIntake.map(row => ({ ...row, daily: restoredAmount(row.daily) })),
      unknownIntakeSubjectIds: snapshot.unknownIntakeSubjectIds,
      estimatedIntakeSubjectIds: snapshot.estimatedIntakeSubjectIds
    };
    const targets = snapshot.targets.map(row => ({ ...row, requested: restoredAmount(row.requested) }));
    const products = snapshot.products.map(row => ({ ...row, contributions: row.contributions.map(restoredAmount) }));
    function coverage(ids: ReadonlySet<string>) {
      const delivered = new Map<string, bigint>();
      const add = (amount: ScaledAmount) => delivered.set(amount.subjectId, (delivered.get(amount.subjectId) ?? BigInt(0)) + amount.units);
      request.currentSupplements.forEach(row => add(row.daily));
      products.filter(row => ids.has(row.productId)).forEach(row => row.contributions.forEach(add));
      const bySubject = new Map(targets.map(target => [target.subjectId, targetCoverageUnits(request, target, delivered.get(target.subjectId) ?? BigInt(0))]));
      return snapshot!.needs.map(need => ({
        id: need.id, displayName: need.displayName, itemType: "supplement" as const,
        coveragePercent: matcherNeedCoveragePercent(bySubject, need), bestRejectedProductId: null, bestRejectedReason: null
      }));
    }
    const needCoverage = coverage(new Set(selectedProductIds));
    const original = new Map(coverage(productIds).map(row => [row.id, row.coveragePercent]));
    return { status: "verified", coveragePercent: marketingCoveragePercentFromNeedCoverage(needCoverage), needCoverage,
      removedNeedIds: needCoverage.filter(row => row.coveragePercent < (original.get(row.id) ?? 0)).map(row => row.id) };
  } catch {
    return unknown;
  }
}
