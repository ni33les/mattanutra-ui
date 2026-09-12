import { productRejectionReason } from "@/lib/matcher/eligibility";
import { contributionFor } from "@/lib/matcher/candidates";
import { knownCurrentTargetExposure } from "@/lib/matcher/target-basis";
import type { CanonicalRequest, CatalogSnapshot, MatchResult, ProductGroup, RejectedCandidate, ScoredBasket } from "@/lib/matcher/types";

export const MATCHING_REASON_CODES = ["targets_already_covered", "empty_closest_fit", "empty_practical_fit", "catalogue_empty", "no_eligible_products", "no_supported_quantities", "no_evaluated_purchase", "search_incomplete", "purchase_options_available"] as const;
export type MatchingReasonCode = typeof MATCHING_REASON_CODES[number];
export type MatchingDiagnostics = Readonly<{
  catalogueListings: number;
  catalogueProducts: number;
  eligibleListings: number;
  eligibleProducts: number;
  supportedDoseVariants: number;
  evaluatedNonemptyBaskets: number;
  reasonCode: MatchingReasonCode;
  rejectionCounts: readonly Readonly<{ reason: string; count: number }>[];
  targets: readonly Readonly<{ subjectId: string; name: string; candidateProducts: number; eligibleProducts: number; supportedDoseVariants: number }>[];
}>;

/** Counts describe this snapshot and work actually evaluated, never an assertion
 * that every combination in a bounded search was examined. Advice is not a filter. */
export function matchingDiagnosticsFor(input: Readonly<{
  request: CanonicalRequest;
  catalog: CatalogSnapshot;
  groups: readonly ProductGroup[];
  baskets: readonly ScoredBasket[];
  selected: ScoredBasket | null;
  searchSummary: NonNullable<MatchResult["searchSummary"]>;
  rejected: readonly RejectedCandidate[];
}>): MatchingDiagnostics {
  const { request, catalog, groups, selected, searchSummary } = input;
  const eligible = catalog.products.filter(product => productRejectionReason(product, request) == null);
  const distinct = (ids: readonly string[]) => new Set(ids).size;
  const supportedDoseVariants = groups.reduce((sum, group) => sum + group.variants.length, 0);
  const evaluatedNonemptyBaskets = new Set(input.baskets.filter(basket => basket.productCount > 0).map(basket => `${basket.sellerId}:${[...basket.variantIds].sort().join(",")}`)).size;
  const activeTargets = request.targets.filter(target => target.importance !== "conditional" || target.prerequisite?.status === "satisfied");
  const covered = request.leftovers.length === 0 && activeTargets.length > 0 && activeTargets.every(target => knownCurrentTargetExposure(request, target) >= target.requested.units);
  const reasonCode: MatchingReasonCode = selected?.productCount ? "purchase_options_available"
    : covered ? "targets_already_covered"
    : evaluatedNonemptyBaskets > 0 && selected?.productCount === 0 ? selected.roles?.includes("closest_dose") ? "empty_closest_fit" : "empty_practical_fit"
    : !searchSummary.complete ? "search_incomplete"
    : catalog.products.length === 0 ? "catalogue_empty"
    : eligible.length === 0 ? "no_eligible_products"
    : supportedDoseVariants === 0 ? "no_supported_quantities"
    : "no_evaluated_purchase";
  const counts = new Map<string, number>();
  for (const rejected of input.rejected) counts.set(rejected.reason, (counts.get(rejected.reason) ?? 0) + 1);
  return { catalogueListings: catalog.products.length, catalogueProducts: distinct(catalog.products.map(product => product.productId)),
    eligibleListings: eligible.length, eligibleProducts: distinct(eligible.map(product => product.productId)),
    supportedDoseVariants, evaluatedNonemptyBaskets, reasonCode,
    rejectionCounts: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([reason, count]) => ({ reason, count })),
    targets: request.targets.map(target => {
      const mentions = (product: CatalogSnapshot["products"][number]) => contributionFor(product, target.name, target.subjectId).length > 0;
      return { subjectId: target.subjectId, name: target.name,
        candidateProducts: distinct(catalog.products.filter(mentions).map(product => product.productId)),
        eligibleProducts: distinct(eligible.filter(mentions).map(product => product.productId)),
        supportedDoseVariants: groups.flatMap(group => group.variants).filter(variant => (variant.contributions.get(target.subjectId)?.units ?? BigInt(0)) > BigInt(0)).length };
    }).sort((a, b) => a.subjectId.localeCompare(b.subjectId)) };
}
