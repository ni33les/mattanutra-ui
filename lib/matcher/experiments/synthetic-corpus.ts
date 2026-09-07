import type { CanonicalCurrent, CanonicalRequest, MatcherProduct } from "../types";
import type { ExperimentCase } from "./corpus-types";
import type { ExperimentOracleFixture, OracleDecimal } from "./oracle";

type ProductInput = Readonly<{ id: string; amounts: Readonly<Record<string, number>>; doses?: readonly OracleDecimal[]; price?: number | null; pills?: number | null; eligible?: boolean }>;
const knownIntake = (ids: readonly string[]): ExperimentOracleFixture["intake"] => ids.flatMap(subjectId => (["supplemental", "dietary"] as const).map(scope => ({ subjectId, scope, certainty: "known" as const, amount: 0 })));
function fixture(ids: readonly string[], products: readonly ProductInput[], overrides: Partial<ExperimentOracleFixture> = {}): ExperimentOracleFixture {
  return {
    currency: "THB", optimization: "best_coverage", subjectUnits: Object.fromEntries(ids.map(id => [id, "mg"])),
    targets: ids.map(subjectId => ({ subjectId, amount: 100, basis: "supplemental", importance: "required" })),
    intake: knownIntake(ids), limits: [],
    products: products.map(p => ({ productId: p.id, sellerId: "synthetic-seller", priceMinor: p.price === undefined ? 10000 : p.price,
      pillsPerServing: p.pills === undefined ? 1 : p.pills, doses: p.doses ?? [1], contributions: p.amounts, eligible: p.eligible ?? true })),
    ...overrides
  };
}
const FIXTURES: readonly Readonly<{ id: string; purpose: string; fixture: ExperimentOracleFixture }>[] = [
  { id: "SYN-01-symmetric-dose", purpose: "Equal proportional underdose and overdose remain symmetric at every alpha.", fixture: fixture(["a"], [
    { id: "under-80", amounts: { a: 80 } }, { id: "over-120", amounts: { a: 120 } }
  ]) },
  { id: "SYN-02-error-distribution", purpose: "Equal linear loss distinguishes distributed versus concentrated error only when curvature increases.", fixture: fixture(["a", "b"], [
    { id: "distributed", amounts: { a: 70, b: 70 } }, { id: "concentrated", amounts: { a: 40, b: 100 } }
  ]) },
  { id: "SYN-03-pills-price", purpose: "A near-fit cheaper one-pill option competes explicitly with exact four-pill coverage.", fixture: fixture(["a"], [
    { id: "exact-four", amounts: { a: 100 }, pills: 4, price: 30000 }, { id: "near-one", amounts: { a: 80 }, price: 10000 }
  ], { preferences: { dailyPills: 1, priceMinor: 10000 } }) },
  { id: "SYN-04-product-count", purpose: "A one-product90% blend is an explicit alternative to two exact products.", fixture: fixture(["a", "b"], [
    { id: "exact-a", amounts: { a: 100 }, price: 5000 }, { id: "exact-b", amounts: { b: 100 }, price: 5000 }, { id: "blend", amounts: { a: 90, b: 90 }, price: 10000 }
  ], { preferences: { productCount: 1 } }) },
  { id: "SYN-05-zero-preferences", purpose: "Zero numeric preferences use explicit1-product/1-pill/100THB scales; omission is a separate no-preference state.", fixture: fixture(["a"], [
    { id: "one", amounts: { a: 100 } }
  ], { preferences: { productCount: 0, dailyPills: 0, priceMinor: 0 } }) },
  { id: "SYN-06-unknown-evidence", purpose: "Unknown diet is not a zero fact; missing pill or price data makes only an active preference score incomplete.", fixture: fixture(["a"], [
    { id: "unknown-pills", amounts: { a: 80 }, pills: null }, { id: "unknown-price", amounts: { a: 100 }, price: null, eligible: false }
  ], { targets: [{ subjectId: "a", amount: 100, basis: "total_daily", importance: "required" }],
    intake: [{ subjectId: "a", scope: "supplemental", certainty: "known", amount: 0 }, { subjectId: "a", scope: "dietary", certainty: "unknown", amount: null }],
    preferences: { dailyPills: 1, priceMinor: 10000 } }) },
  { id: "SYN-07-scoped-limits-continued", purpose: "Supplemental targets, total/supplemental limits and incidental continued doses have independent denominators.", fixture: fixture(["a", "b"], [
    { id: "with-incidental", amounts: { a: 80, b: 10 } }, { id: "target-only", amounts: { a: 80 }, price: 12000 }
  ], { targets: [{ subjectId: "a", amount: 100, basis: "supplemental", importance: "required" }],
    intake: [{ subjectId: "a", scope: "supplemental", certainty: "known", amount: 20 }, { subjectId: "a", scope: "dietary", certainty: "known", amount: 90 },
      { subjectId: "b", scope: "supplemental", certainty: "known", amount: 10 }, { subjectId: "b", scope: "dietary", certainty: "known", amount: 0 }],
    limits: [{ subjectId: "a", amount: 150, scope: "total" }, { subjectId: "a", amount: 80, scope: "supplemental" }, { subjectId: "b", amount: 15, scope: "supplemental" }] }) },
  { id: "SYN-08-estimated-interval", purpose: "Each convex profile evaluates the whole endpoint loss; estimates remain explicitly uncertain.", fixture: fixture(["a"], [
    { id: "twenty", amounts: { a: 20 } }, { id: "forty", amounts: { a: 40 } }
  ], { intake: [{ subjectId: "a", scope: "supplemental", certainty: "estimated", amount: 60, minimum: 20, maximum: 100 },
    { subjectId: "a", scope: "dietary", certainty: "known", amount: 0 }] }) },
  { id: "SYN-09-core-optional", purpose: "Baseline core protection and explicit preference tradeoffs are independently classified.", fixture: fixture(["a", "b"], [
    { id: "core-exact", amounts: { a: 100 } }, { id: "optional-driven", amounts: { a: 80, b: 100 } }
  ], { targets: [{ subjectId: "a", amount: 100, basis: "supplemental", importance: "core" }, { subjectId: "b", amount: 100, basis: "supplemental", importance: "optional" }], preferences: { productCount: 1 } }) },
  { id: "SYN-10-sparse-exclusions", purpose: "Missing supply, explicit product exclusion and ineligible listings do not remove requested targets.", fixture: fixture(["a", "b", "c"], [
    { id: "excluded-a", amounts: { a: 100 } }, { id: "only-b", amounts: { b: 100 } }, { id: "not-orderable", amounts: { a: 100, b: 100 }, eligible: false }
  ], { excludeProductIds: ["excluded-a"] }) },
  { id: "SYN-11-empty-purchase-fallback", purpose: "An empty closest-dose recommendation retains a physically valid purchasable above-target basket.", fixture: fixture(["a"], [
    { id: "three-hundred", amounts: { a: 300 } }
  ], { limits: [{ subjectId: "a", amount: 200, scope: "supplemental" }] }) },
  { id: "SYN-12-powder-interior", purpose: "The explicit0.2-serving grid includes the0.6 interior optimum without inventing capsule splitting.", fixture: fixture(["a"], [
    { id: "powder", amounts: { a: 100 }, pills: 0, doses: ["0.2", "0.4", "0.6", "0.8", "1"] }
  ], { targets: [{ subjectId: "a", amount: 60, basis: "supplemental", importance: "required" }] }) }
];

/** Fixture adaptation is outside the oracle; the oracle consumes only its
 * declared units, quantities and eligibility facts, never these matcher types. */
function requestFor(f: ExperimentOracleFixture): CanonicalRequest {
  const current = (scope: "supplemental" | "dietary"): CanonicalCurrent[] => f.intake.filter(row => row.scope === scope).map(row => ({
    subjectId: row.subjectId, name: row.subjectId, sourceId: `${scope}:${row.subjectId}`, unit: "mg", certainty: row.certainty,
    dailyAmount: Number(row.amount ?? 0), daily: { dim: "mass_ng", subjectId: row.subjectId, units: BigInt(Math.round(Number(row.amount ?? 0) * 1_000_000)) },
    ...(row.minimum == null ? {} : { minimumDailyAmount: Number(row.minimum) }), ...(row.maximum == null ? {} : { maximumDailyAmount: Number(row.maximum) })
  }));
  return { acceptedGapSubjectIds: [], allowedForms: null, conditionCodes: [], currency: f.currency,
    currentSupplements: current("supplemental"), dietaryIntake: current("dietary"), destinationCountry: "TH", dietaryPreference: "any",
    excludeSubjectIds: [...f.excludeSubjectIds ?? []], excludeProductIds: [...f.excludeProductIds ?? []],
    productDoses: f.productDoses?.map(row => ({ productId: row.productId, servingsPerDay: Number(row.servingsPerDay) })),
    unknownIntakeSubjectIds: [...new Set(f.intake.filter(row => row.certainty === "unknown").map(row => row.subjectId))],
    estimatedIntakeSubjectIds: [...new Set(f.intake.filter(row => row.certainty === "estimated").map(row => row.subjectId))],
    leftovers: [], maxProductCount: f.preferences?.productCount == null ? null : Number(f.preferences.productCount),
    maxDailyPills: f.preferences?.dailyPills == null ? null : Number(f.preferences.dailyPills), maxPriceMinor: f.preferences?.priceMinor == null ? null : Number(f.preferences.priceMinor),
    medicationCodes: [], omega3SourcePreference: "any", optimization: "best_coverage", profile: { ageYears: 40, lifeStage: "adult" },
    profileKnown: { ageYears: true, lifeStage: true, sex: false }, retainProductIds: [...f.requiredProductIds ?? []], retainSubjectIds: [], selectorMode: "agentic", searchEffort: "standard",
    targets: f.targets.map(t => ({ subjectId: t.subjectId, name: t.subjectId, basis: t.basis, importance: t.importance, requestedAmount: Number(t.amount), requestedUnit: "mg",
      requested: { dim: "mass_ng", subjectId: t.subjectId, units: BigInt(Math.round(Number(t.amount) * 1_000_000)) } })),
    safetyCeilings: f.limits.map((l, index) => ({ subjectId: l.subjectId, name: l.subjectId, maxAmount: Number(l.amount), maxUnit: "mg", sourceScope: l.scope, lifeStage: "adult",
      bandId: `synthetic-limit-${index}`, bandVersion: 1, referenceConfidence: "high", authorityUrl: "https://example.invalid/synthetic-reference", basisRationale: "Controlled arithmetic fixture; not a clinical reference." })) };
}
function productsFor(f: ExperimentOracleFixture): MatcherProduct[] {
  return f.products.map(p => {
    const powder = p.productId === "powder", knownPills = p.pillsPerServing !== null;
    return { productId: p.productId, retailerSku: p.productId, sellerId: p.sellerId, sellerName: p.sellerId, title: p.productId,
      availableCountryCodes: ["TH"], currency: f.currency, unitPriceMinor: p.priceMinor ?? 0, orderable: p.eligible, status: "approved", stockStatus: "in_stock", source: "fixture",
      contributionSubjectIds: Object.keys(p.contributions), dailyPillsPerServing: Number(p.pillsPerServing ?? 0), pillCountKnown: knownPills,
      dietarySource: "plant", omegaSource: "none", form: powder ? "powder" : knownPills ? "capsule" : "unknown", imageUrl: null,
      incompleteCommercialFacts: p.priceMinor === null, prenatalOrFertility: false, productAudience: "both", unknownSafetyAmount: Object.values(p.contributions).some(amount => amount === null),
      administration: knownPills ? { route: "oral", physicalUnit: powder ? "g" : "capsule", unitsPerServing: powder ? 1 : Number(p.pillsPerServing),
        doseIncrement: powder ? 0.2 : 1, packQuantity: 30, provenance: { status: "verified", sourceUrl: "https://example.invalid/synthetic-label", sourceText: "Explicit controlled physical unit fixture.", verifiedAt: "2026-09-07T00:00:00Z" } } : null,
      labelledContributions: Object.entries(p.contributions).filter((entry): entry is [string, OracleDecimal] => entry[1] !== null).map(([subjectId, amount]) => ({ subjectId, name: subjectId, amount: Number(amount), unit: f.subjectUnits[subjectId], mappingStatus: "verified", confidence: "high", source: "controlled synthetic fixture", sourceUrl: "https://example.invalid/synthetic-label", sourceText: "Exact quantity supplied by the synthetic case." })) };
  });
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}
export function syntheticCorpus(): ExperimentCase[] {
  return FIXTURES.map(({ id, purpose, fixture: oracleFixture }) => freeze({ id, kind: "synthetic" as const,
    request: requestFor(oracleFixture), catalog: { availabilityAsOf: "2026-09-07T00:00:00Z", catalogueVersion: `scoring-experiment:${id}`, products: productsFor(oracleFixture) },
    provenance: { origin: "explicit_synthetic_arithmetic_fixture", purpose, unitPolicy: "All subject amounts are explicit mg; no inferred unit conversions.",
      gridScope: "Exhaustive only over the independent explicit dose grid; production search may propose additional physical quantities.",
      unknownPolicy: "Null oracle intake remains unknown; the production adapter retains its explicit unknown marker on placeholder quantities.",
      clinicalEvidence: false, fixturePricesChangedToObtainGreen: false }, oracleFixture }));
}
