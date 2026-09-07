import { sha256Hex } from "@/lib/sha256";
import { compileVariant } from "@/lib/matcher/candidates";
import { COVERAGE_SCALE } from "@/lib/matcher/config";
import { productRejectionReason } from "@/lib/matcher/eligibility";
import { seedState, tryAddVariant } from "@/lib/matcher/search";
import type {
  CanonicalRequest,
  CatalogSnapshot,
  ProductGroup,
  RejectedCandidate,
  RejectedSummary,
  RejectionReason,
  ScoredBasket
} from "@/lib/matcher/types";

export const PUBLIC_REJECTED_SAMPLE_LIMIT = 12;
export const DEV_REJECTED_DUMP_LIMIT = 200;

export function publicCoveragePercent(basket: ScoredBasket | null) {
  if (!basket) {
    return 0;
  }

  return Math.round(basket.aggregateCoverage / (COVERAGE_SCALE / 100));
}

export function optionIdFor(productIds: readonly string[]) {
  return `opt_${sha256Hex([...productIds].sort().join("|")).slice(0, 16)}`;
}

function asRejected(
  product: CatalogSnapshot["products"][number],
  reason: RejectionReason
): RejectedCandidate {
  return {
    productId: product.productId,
    reason,
    sellerId: product.sellerId,
    title: product.title
  };
}

function seedUnusableReason(
  group: ProductGroup,
  request: CanonicalRequest
): RejectionReason | null {
  const seed = seedState(request);

  for (const variant of group.variants) {
    if (tryAddVariant(seed, variant, group, request)) {
      return null;
    }
  }

  const variant = group.variants[0];

  if (!variant) {
    return "incidental_only";
  }

  return "incidental_only";

}

export function rejectedCandidatesFor(
  request: CanonicalRequest,
  catalog: CatalogSnapshot,
  groups: readonly ProductGroup[],
  _deadlineAt?: number
): RejectedCandidate[] {
  void _deadlineAt;
  const compiled = new Map(groups.map((item) => [`${item.sellerId}:${item.productId}`, item]));
  const rejected: RejectedCandidate[] = [];

  for (const product of catalog.products) {
    const eligibility = productRejectionReason(product, request);

    if (eligibility) {
      rejected.push(asRejected(product, eligibility));
      continue;
    }

    const group = compiled.get(`${product.sellerId}:${product.productId}`);

    if (group) {
      const unusable = seedUnusableReason(group, request);

      if (unusable) {
        rejected.push(asRejected(product, unusable));
      }

      continue;
    }

    const variant = compileVariant({ dailyUnits: 1, product, request });

    if (!variant) {
      rejected.push(asRejected(product, "incidental_only"));
      continue;
    }

  }

  return rejected.sort(
    (left, right) =>
      left.reason.localeCompare(right.reason) ||
      left.productId.localeCompare(right.productId)
  );
}

export function summarizeRejections(
  rejected: readonly RejectedCandidate[],
  sampleLimit = PUBLIC_REJECTED_SAMPLE_LIMIT
): RejectedSummary {
  const counts: Record<string, number> = {};

  for (const item of rejected) {
    counts[item.reason] = (counts[item.reason] ?? 0) + 1;
  }

  return {
    counts,
    sample: rejected.slice(0, sampleLimit),
    total: rejected.length
  };
}
