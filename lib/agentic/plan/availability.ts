import { businessError } from '@/lib/agentic/contract/errors';
import { toCanonicalRequest } from '@/lib/agentic/plan/matching';
import { toMatcherProduct } from '@/lib/agentic/plan/to-matcher-product';
import { productRejectionReason } from '@/lib/matcher/eligibility';
import { productContributionAvailability } from '@/lib/matcher/product-availability';
import { validateProductDoseProposals } from '@/lib/matcher/serving-grid';
import type { CatalogueSnapshot } from '@/lib/agentic/catalogue/types';
import type { CanonicalPlanState } from '@/lib/agentic/plan/types';

export type IngredientAvailability = 'supplied' | 'not_selected' | 'unavailable' | 'not_on_list' | 'not_allowed' | 'unknown';
export type AvailabilityIssue = Readonly<{ fieldPath: string; itemId?: string; code: Exclude<IngredientAvailability, 'supplied'>; message: string }>;
export type PlanAvailability = Readonly<{ ingredients: Record<string, IngredientAvailability>; issues: readonly AvailabilityIssue[] }>;
const messages = {
  en: { not_on_list: 'Not on our supplement list.', not_allowed: 'Ingredient not allowed.', unavailable: 'Currently unavailable.', not_selected: 'Not included in this recommendation.', unknown: 'Product contribution is unknown.' },
  th: { not_on_list: 'ไม่อยู่ในรายการสารอาหารของเรา', not_allowed: 'ไม่อนุญาตให้ใช้ส่วนผสมนี้', unavailable: 'ขณะนี้ไม่มีผลิตภัณฑ์ที่รองรับ', not_selected: 'ไม่ได้รวมอยู่ในคำแนะนำนี้', unknown: 'ยังไม่ทราบปริมาณที่ผลิตภัณฑ์ให้ได้' },
  'zh-CN': { not_on_list: '不在我们的补充成分清单中。', not_allowed: '该成分不允许使用。', unavailable: '目前暂无可用产品。', not_selected: '未包含在本次推荐中。', unknown: '产品提供的含量未知。' }
};
export function availabilityMessage(code: AvailabilityIssue['code'], locale: string, product = false) {
  const language = locale === 'th' ? 'th' : locale === 'zh' || locale === 'zh-CN' ? 'zh-CN' : 'en';
  if (product && code === 'not_on_list') return { en: 'Product is not on our approved list.', th: 'ผลิตภัณฑ์ไม่อยู่ในรายการที่อนุมัติของเรา', 'zh-CN': '该产品不在我们的批准清单中。' }[language];
  if (product && code === 'not_allowed') return { en: 'Product not allowed.', th: 'ไม่อนุญาตให้ใช้ผลิตภัณฑ์นี้', 'zh-CN': '该产品不允许使用。' }[language];
  return messages[language][code];
}

/** Preserve the original command; only catalogue-unusable proposals are removed. */
export function preparePlanAvailability(state: CanonicalPlanState, snapshot: CatalogueSnapshot) {
  const canonical = toCanonicalRequest(state);
  if ('error' in canonical) return businessError({ reasonCode: 'invalid_request', message: canonical.error });
  const products = snapshot.products.map(toMatcherProduct), issues: AvailabilityIssue[] = [];
  const ingredients: Record<string, IngredientAvailability> = {};
  const possible = productContributionAvailability(canonical, products);
  for (const [index, target] of (state.originalRequest?.targets ?? []).entries()) {
    const id = target.ingredientId ?? target.supplementId!;
    const resolved = state.targets.find(row => row.supplementId === target.supplementId);
    const code: IngredientAvailability = snapshot.disallowedSupplements?.some(row => row.supplementId === id) ? 'not_allowed'
      : !resolved ? 'not_on_list' : possible.supplied.has(resolved.supplementId) ? 'not_selected' : possible.unknown.has(resolved.supplementId) ? 'unknown' : 'unavailable';
    ingredients[id] = code;
    if (code !== 'not_selected') issues.push({ fieldPath: `targets[${index}]`, itemId: id, code, message: availabilityMessage(code, state.locale) });
  }
  const kept = [];
  const seen = new Set<string>();
  for (const [index, dose] of (state.requirements.productDoses ?? []).entries()) {
    const fieldPath = `requirements.productDoses[${index}].productId`;
    if (seen.has(dose.productId) || state.requirements.excludeProductIds?.includes(dose.productId)) return businessError({ fieldPath, reasonCode: 'invalid_request', message: 'A product proposal must be unique and cannot also be excluded.' });
    seen.add(dose.productId);
    const listings = products.filter(row => row.productId === dose.productId);
    const allowed = listings.filter(row => !productRejectionReason(row, canonical));
    if (allowed.length) { kept.push(dose); continue; }
    const reasons = listings.map(row => productRejectionReason(row, canonical));
    const operational = new Set(['not_approved', 'not_orderable', 'incomplete_facts', 'oos', 'foreign_retailer']);
    if (reasons.some(reason => reason && !operational.has(reason))) return businessError({ fieldPath, reasonCode: 'invalid_request', message: `Product conflicts with the request (${reasons.join(', ')}).` });
    const code = snapshot.disallowedProductIds?.includes(dose.productId) ? 'not_allowed' : !listings.length ? 'not_on_list' : listings.every(row => row.status !== 'approved') ? 'not_allowed' : 'unavailable';
    issues.push({ fieldPath, itemId: dose.productId, code, message: availabilityMessage(code, state.locale, true) });
  }
  const requirements = { ...state.requirements, ...(state.requirements.productDoses ? { productDoses: kept } : {}) };
  const validation = validateProductDoseProposals({ ...canonical, productDoses: kept }, { products, availabilityAsOf: snapshot.availabilityAsOf, catalogueVersion: snapshot.catalogueVersion });
  if (validation.length) return businessError({ fieldPath: validation[0].field, reasonCode: 'invalid_request', message: validation[0].reason });
  return { ...state, requirements, availability: { ingredients, issues } } satisfies CanonicalPlanState;
}
