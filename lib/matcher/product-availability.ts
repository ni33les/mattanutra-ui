import { compileVariant } from '@/lib/matcher/candidates';
import { productRejectionReason } from '@/lib/matcher/eligibility';
import { servingIncrement } from '@/lib/matcher/serving-grid';
import type { CanonicalRequest, MatcherProduct } from '@/lib/matcher/types';

/** One labelled-quantity probe per eligible listing; no search, I/O or scoring. */
export function productContributionAvailability(request: CanonicalRequest, products: readonly MatcherProduct[]) {
  const supplied = new Set<string>(), unknown = new Set<string>();
  for (const product of products) {
    if (productRejectionReason(product, request)) continue;
    const ratio = servingIncrement(product);
    const variant = compileVariant({ product, request, dailyUnits: Number(ratio.num) / Number(ratio.den), dailyUnitsRatio: ratio });
    for (const [id, amount] of variant?.contributions ?? []) if (amount.units > BigInt(0)) supplied.add(id);
    for (const id of variant?.unknownSubjectIds ?? []) unknown.add(id);
    for (const id of product.contributionSubjectIds) if (!variant?.contributions.has(id)) unknown.add(id);
  }
  return { supplied, unknown };
}
