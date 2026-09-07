import { nutrientNameMatchesTarget } from '@/lib/nutrient-identity';
import { canonicalNutrientKey } from '@/lib/product-key-matching';
import type { CanonicalRequest, MatcherContribution, MatcherProduct } from '@/lib/matcher/types';

/** Untrusted label evidence remains available for advice and exploration, but
 * cannot establish measured oral exposure or satisfy a requested target. */
export function factSupportsQuantifiedExposure(product: MatcherProduct, fact: MatcherContribution): boolean {
  const route = product.administration?.route;
  return (!route || route === 'oral' || route === 'unknown') &&
    fact.mappingStatus !== 'conflicting' && fact.mappingStatus !== 'unverified' &&
    fact.confidence !== 'low' && fact.confidence !== 'moderate';
}

export function uncertainProductSubjects(product: MatcherProduct, request: CanonicalRequest): string[] {
  const subjects = new Set<string>();
  if (product.unknownSafetyAmount) for (const id of product.contributionSubjectIds) subjects.add(id);
  for (const fact of product.labelledContributions) {
    if (factSupportsQuantifiedExposure(product, fact) && fact.amount != null && fact.amount > 0 && fact.unit) continue;
    const matching = [...request.targets, ...request.currentSupplements, ...(request.dietaryIntake ?? [])]
      .filter(row => row.subjectId === fact.subjectId || nutrientNameMatchesTarget(row.name, fact.name));
    for (const row of matching) subjects.add(row.subjectId);
    const id = fact.subjectId || canonicalNutrientKey(fact.name);
    if (id) subjects.add(id);
  }
  return [...subjects].sort();
}
