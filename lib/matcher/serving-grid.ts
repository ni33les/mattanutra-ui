import { isDoseError, numberToRational } from '@/lib/matcher/dose';
import { productRejectionReason } from '@/lib/matcher/eligibility';
import type { CanonicalRequest, CatalogSnapshot, MatcherProduct } from '@/lib/matcher/types';
export type ServingRatio = Readonly<{ num: bigint; den: bigint }>;
const ONE = BigInt(1);
export function servingIncrement(product: MatcherProduct): ServingRatio {
  const a = product.administration;
  if (!a || a.provenance.status !== 'verified' || a.route !== 'oral' || !a.unitsPerServing || !a.doseIncrement) return { num: ONE, den: ONE };
  const units = numberToRational(a.unitsPerServing);
  const increment = numberToRational(a.doseIncrement);
  if (isDoseError(units) || isDoseError(increment) || units.num <= 0 || increment.num <= 0) return { num: ONE, den: ONE };
  return { num: increment.num * units.den, den: increment.den * units.num };
}
export function ratioForSupportedServings(product: MatcherProduct, value: number): ServingRatio | null {
  if (!Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER) return null;
  const step = servingIncrement(product);
  const ticks = value * Number(step.den) / Number(step.num);
  const nearest = Math.round(ticks);
  // The tolerance only permits the unavoidable JS representation of rational
  // unit fractions such as one capsule of a three-capsule labelled serving.
  if (!Number.isSafeInteger(nearest) || nearest < 1 || Math.abs(ticks - nearest) > Number.EPSILON * Math.max(1, Math.abs(ticks)) * 8) return null;
  return { num: step.num * BigInt(nearest), den: step.den };
}
export type ProductDoseIssue = Readonly<{ field: string; reason: string; permittedIncrement?: number }>;
export class ProductDoseValidationError extends Error {
  readonly issues: readonly ProductDoseIssue[];
  constructor(issues: readonly ProductDoseIssue[]) {
    super(issues.map(row => `${row.field}: ${row.reason}`).join('; '));
    this.name = 'ProductDoseValidationError'; this.issues = issues;
  }
}
export function validateProductDoseProposals(request: CanonicalRequest, catalog: CatalogSnapshot): ProductDoseIssue[] {
  const issues: ProductDoseIssue[] = [];
  const seen = new Set<string>();
  for (const [index, dose] of (request.productDoses ?? []).entries()) {
    const field = `requirements.productDoses[${index}]`;
    if (seen.has(dose.productId)) { issues.push({ field: `${field}.productId`, reason: 'A product may have only one proposed quantity.' }); continue; }
    seen.add(dose.productId);
    const listings = catalog.products.filter(row => row.productId === dose.productId);
    const eligible = listings.filter(row => !productRejectionReason(row, request));
    if (!eligible.length) { issues.push({ field: `${field}.productId`, reason: listings.length ? `Product conflicts with eligibility or an explicit exclusion (${productRejectionReason(listings[0]!, request)}).` : 'Unknown product ID.' }); continue; }
    if (!eligible.some(row => ratioForSupportedServings(row, dose.servingsPerDay))) {
      const step = servingIncrement(eligible[0]!);
      issues.push({ field: `${field}.servingsPerDay`, reason: 'Quantity must be positive and use a supported whole physical unit or measurable increment.', permittedIncrement: Number(step.num) / Number(step.den) });
    }
  }
  if (request.maxProductCount != null && seen.size > request.maxProductCount) issues.push({ field: 'requirements.productDoses', reason: `Proposed products exceed maxProductCount ${request.maxProductCount}.` });
  if (!issues.length && seen.size) {
    const sellers = new Set(catalog.products.map(row => row.sellerId));
    const feasible = [...sellers].some(sellerId => {
      let price = 0, pills = 0;
      for (const dose of request.productDoses ?? []) {
        const p = catalog.products.find(row => row.sellerId === sellerId && row.productId === dose.productId && !productRejectionReason(row, request) && ratioForSupportedServings(row, dose.servingsPerDay));
        if (!p) return false;
        price += p.unitPriceMinor;
        const a = p.administration;
        const verifiedPills = a?.provenance.status === 'verified' && /^(capsule|tablet|softgel|gummy)$/.test(a.physicalUnit) ? (a.unitsPerServing ?? 0) : p.dailyPillsPerServing;
        pills += verifiedPills * dose.servingsPerDay;
      }
      return (request.maxPriceMinor == null || price <= request.maxPriceMinor) && (request.maxDailyPills == null || pills <= request.maxDailyPills);
    });
    if (!feasible) issues.push({ field: 'requirements.productDoses', reason: 'No single eligible seller can supply these quantities within the explicit pill and price ceilings.' });
  }
  return issues;
}
