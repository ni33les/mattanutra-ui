import { canonicalizeTargets } from '../../lib/matcher/canonicalizer.ts';
import type { CanonicalRequest, MatcherProduct } from '../../lib/matcher/types.ts';
export function request(overrides: Partial<CanonicalRequest> = {}): CanonicalRequest {
  return { acceptedGapSubjectIds: [], allowedForms: null, conditionCodes: [], currency: 'THB', currentSupplements: [],
    destinationCountry: 'TH', dietaryPreference: 'any', excludeSubjectIds: [], leftovers: [], maxDailyPills: null,
    maxPriceMinor: null, maxProductCount: null, medicationCodes: [], omega3SourcePreference: 'any', optimization: 'balanced',
    profile: { ageYears: 38, lifeStage: 'adult' }, retainProductIds: [], retainSubjectIds: [], safetyCeilings: [],
    selectorMode: 'agentic', targets: canonicalizeTargets({ targets: [{ subjectId: 'a', name: 'A', amount: 100, unit: 'mg' }] }).targets,
    ...overrides };
}
export function product(id: string, nutrients: Record<string, number>, price = 100, extra: Partial<MatcherProduct> = {}): MatcherProduct {
  return { productId: id, sellerId: 'seller', sellerName: 'Seller', retailerSku: id, title: id, source: 'fixture', currency: 'THB',
    unitPriceMinor: price, form: 'capsule', dailyPillsPerServing: 1, productAudience: 'both', availableCountryCodes: ['TH'],
    dietarySource: 'any', omegaSource: 'none', imageUrl: null, orderable: true, status: 'approved', stockStatus: 'in_stock',
    incompleteCommercialFacts: false, prenatalOrFertility: false, unknownSafetyAmount: false,
    contributionSubjectIds: Object.keys(nutrients), labelledContributions: Object.entries(nutrients).map(([subjectId, amount]) =>
      ({ subjectId, name: subjectId.toUpperCase(), amount, unit: 'mg' })), ...extra };
}
export const catalog = (products: MatcherProduct[]) => ({ catalogueVersion: 'v5-frozen', availabilityAsOf: '2026-09-07T00:00:00Z', products });
