import type { CanonicalRequest, CatalogSnapshot, MatcherConfig, MatcherProduct } from "@/lib/matcher/types";

/** Explicit finite fixture values, in one declared canonical unit per subject. */
export type OracleNumber = number | string;
export type OracleIntake = Readonly<{ subjectId: string; amount: OracleNumber; minimum?: OracleNumber; maximum?: OracleNumber; certainty?: "known" | "estimated" | "unknown" }>;
export type FiniteOracleFixture = Readonly<{
  targets: readonly Readonly<{ subjectId: string; amount: OracleNumber; basis?: "total_daily" | "supplemental"; importance?: "required" | "core" | "optional"; minimum?: OracleNumber; maximum?: OracleNumber }>[];
  current?: readonly OracleIntake[];
  dietary?: readonly OracleIntake[];
  limits?: readonly Readonly<{ subjectId: string; amount: OracleNumber; scope: "total" | "supplemental" }>[];
  products: readonly Readonly<{ productId: string; sellerId: string; priceMinor: number; pillsPerServing: number; pillCountKnown?: boolean;
    /** Supplied by the fixture, never compiled by the production dose enumerator. */
    doses: readonly OracleNumber[]; contributions: Readonly<Record<string, OracleNumber>>; eligible?: boolean }>[];
  maxProductCount?: number | null;
  maxDailyPills?: number | null;
  maxPriceMinor?: number | null;
  excludeProductIds?: readonly string[];
  productDoses?: readonly Readonly<{ productId: string; servingsPerDay: OracleNumber }>[];
  optimization?: "balanced" | "best_coverage" | "fewest_pills" | "lowest_cost";
  retainedProductIds?: readonly string[];
  retainedSubjectIds?: readonly string[];
}>;

type Rational = Readonly<{ n: bigint; d: bigint }>;
const ZERO: Rational = { n: BigInt(0), d: BigInt(1) };
const LIMIT = 250_000;

function rational(n: bigint, d = BigInt(1)): Rational {
  if (d === BigInt(0)) throw new Error("Oracle division by zero");
  let a = n < BigInt(0) ? -n : n, b = d;
  while (b) [a, b] = [b, a % b];
  const divisor = a || BigInt(1);
  return { n: n / divisor, d: d / divisor };
}
function number(value: OracleNumber): Rational {
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(value));
  if (!match) throw new Error(`Invalid finite oracle number: ${value}`);
  const exponent = Number(match[4] ?? 0) - (match[3]?.length ?? 0);
  if (Math.abs(exponent) > 40) throw new Error("Oracle fixture exponent exceeds the explicit precise limit");
  let n = BigInt(`${match[2]}${match[3] ?? ""}`) * (match[1] === "-" ? -BigInt(1) : BigInt(1));
  if (exponent > 0) n *= BigInt(10) ** BigInt(exponent);
  return rational(n, exponent < 0 ? BigInt(10) ** BigInt(-exponent) : BigInt(1));
}
const add = (a: Rational, b: Rational) => rational(a.n * b.d + b.n * a.d, a.d * b.d);
const subtract = (a: Rational, b: Rational) => rational(a.n * b.d - b.n * a.d, a.d * b.d);
const multiply = (a: Rational, b: Rational) => rational(a.n * b.n, a.d * b.d);
const divide = (a: Rational, b: Rational) => rational(a.n * b.d, a.d * b.n);
const compare = (a: Rational, b: Rational) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
const numeric = (a: Rational) => Number(a.n) / Number(a.d);
const positive = (a: Rational) => compare(a, ZERO) > 0 ? a : ZERO;
const excess = (a: Rational, b: Rational) => compare(b, ZERO) > 0 ? divide(positive(subtract(a, b)), b) : ZERO;
const sum = (rows: readonly Rational[]) => rows.reduce(add, ZERO);
const lesser = (a: Rational, b: Rational) => compare(a, b) < 0 ? a : b;

export type OracleBasket = Readonly<{
  productIds: readonly string[];
  variantIds: readonly string[];
  doses: readonly Readonly<{ productId: string; servingsPerDay: number }>[];
  sellerId: string;
  productCount: number;
  incidentalCount: number;
  priceMinor: number;
  dailyPills: number;
  pillCountKnown: boolean;
  purchaseEligible: boolean;
  fullyCoveredFraction: number;
  coverage: readonly Readonly<{ subjectId: string; target: number; exposure: number; gap: number; excess: number; coverage: number; withinRange: boolean | null; certainty: "known" | "estimated" | "unknown" }>[];
  loss: Readonly<{ under: number; over: number; limit: number; weightedLimit: number; total: number; exact: { numerator: string; denominator: string } }>;
}>;
type InternalBasket = { basket: OracleBasket; total: Rational; required: Rational; coverage: Rational; metrics: ReadonlyMap<string, readonly Rational[]> };

function interval(rows: readonly OracleIntake[], subjectId: string) {
  const relevant = rows.filter(row => row.subjectId === subjectId);
  // Unknown, unquantified intake is not a zero fact or a continued-dose reference.
  const quantified = relevant.filter(row => row.certainty !== "unknown");
  const minimum = sum(quantified.map(row => number(row.minimum ?? row.amount)));
  const maximum = sum(quantified.map(row => number(row.maximum ?? row.amount)));
  if (compare(minimum, maximum) > 0) throw new Error(`Invalid oracle intake interval: ${subjectId}`);
  return { base: sum(quantified.map(row => number(row.amount))), minimum, maximum,
    certainty: relevant.some(row => row.certainty === "unknown") ? "unknown" as const : relevant.some(row => row.certainty === "estimated") || compare(minimum, maximum) !== 0 ? "estimated" as const : "known" as const,
    known: sum(quantified.filter(row => (row.certainty ?? "known") === "known" && compare(number(row.minimum ?? row.amount), number(row.amount)) === 0 && compare(number(row.maximum ?? row.amount), number(row.amount)) === 0).map(row => number(row.amount))) };
}

function evaluate(fixture: FiniteOracleFixture, chosen: readonly { product: FiniteOracleFixture["products"][number]; dose: Rational }[]): InternalBasket {
  const contributions = new Map<string, Rational>();
  for (const { product, dose } of chosen) for (const [id, amount] of Object.entries(product.contributions)) contributions.set(id, add(contributions.get(id) ?? ZERO, multiply(number(amount), dose)));
  const subjects = [...new Set([...fixture.targets.map(row => row.subjectId), ...contributions.keys(), ...(fixture.current ?? []).map(row => row.subjectId), ...(fixture.dietary ?? []).map(row => row.subjectId)])].sort();
  let under = ZERO, over = ZERO, limits = ZERO, required = ZERO;
  const coverage: OracleBasket["coverage"][number][] = [], metrics = new Map<string, readonly Rational[]>();
  const coverageScores: Rational[] = [];
  for (const id of subjects) {
    const target = fixture.targets.find(row => row.subjectId === id);
    const current = interval(fixture.current ?? [], id), food = interval(fixture.dietary ?? [], id), added = contributions.get(id) ?? ZERO;
    const requested = target ? number(target.amount) : ZERO;
    const continued = !target && compare(current.known, ZERO) > 0 ? divide(added, current.known) : ZERO;
    const applicable = (fixture.limits ?? []).filter(row => row.subjectId === id);
    const endpoints = [current.minimum, current.maximum].flatMap(c => [food.minimum, food.maximum].map(f => {
      const supplemental = add(c, added), total = add(supplemental, f);
      const delivered = target?.basis === "supplemental" ? supplemental : total;
      const shortfall = target ? divide(positive(subtract(requested, delivered)), requested) : ZERO;
      const overshoot = add(target ? excess(delivered, requested) : ZERO, continued);
      const limit = sum(applicable.map(row => excess(row.scope === "total" ? total : supplemental, number(row.amount))));
      return { delivered, shortfall, overshoot, limit, total: add(add(shortfall, overshoot), multiply(number(2), limit)) };
    }));
    // For a convex loss over an intake interval, evaluate each endpoint combination.
    const worst = endpoints.reduce((a, b) => compare(a.total, b.total) >= 0 ? a : b);
    under = add(under, worst.shortfall); over = add(over, worst.overshoot); limits = add(limits, worst.limit);
    if (target && (target.importance ?? "required") !== "optional") {
      required = add(required, worst.total);
      metrics.set(id, [add(worst.shortfall, target ? excess(worst.delivered, requested) : ZERO), target ? excess(worst.delivered, requested) : ZERO, continued, worst.limit]);
    }
    if (target) {
      const delivered = add(add(current.base, added), target.basis === "supplemental" ? ZERO : food.base);
      const ratio = divide(lesser(delivered, requested), requested);
      coverageScores.push(ratio);
      coverage.push({ subjectId: id, target: numeric(requested), exposure: numeric(delivered), gap: numeric(positive(subtract(requested, delivered))), excess: numeric(positive(subtract(delivered, requested))), coverage: numeric(ratio),
        withinRange: target.minimum == null && target.maximum == null ? null : compare(delivered, number(target.minimum ?? target.amount)) >= 0 && compare(delivered, number(target.maximum ?? target.amount)) <= 0,
        certainty: current.certainty === "unknown" || food.certainty === "unknown" ? "unknown" : current.certainty === "estimated" || food.certainty === "estimated" ? "estimated" : "known" });
    }
  }
  const total = add(add(under, over), multiply(number(2), limits));
  const productIds = chosen.map(row => row.product.productId).sort();
  const basket: OracleBasket = { productIds, productCount: productIds.length,
    incidentalCount: chosen.reduce((sum, row) => sum + Object.entries(row.product.contributions).filter(([id, amount]) => !fixture.targets.some(target => target.subjectId === id) && compare(number(amount), ZERO) > 0).length, 0),
    variantIds: chosen.map(row => `${row.product.sellerId}:${row.product.productId}:x${numeric(row.dose)}`).sort(),
    doses: chosen.map(row => ({ productId: row.product.productId, servingsPerDay: numeric(row.dose) })).sort((a, b) => a.productId.localeCompare(b.productId)),
    sellerId: chosen[0]?.product.sellerId ?? "", priceMinor: chosen.reduce((sum, row) => sum + row.product.priceMinor, 0),
    pillCountKnown: chosen.every(row => row.product.pillCountKnown !== false),
    dailyPills: numeric(sum(chosen.map(row => multiply(number(row.product.pillsPerServing), row.dose)))), purchaseEligible: chosen.length > 0,
    fullyCoveredFraction: coverage.length ? coverage.filter(row => row.gap === 0).length / coverage.length : 0, coverage,
    loss: { under: numeric(under), over: numeric(over), limit: numeric(limits), weightedLimit: numeric(multiply(number(2), limits)), total: numeric(total), exact: { numerator: String(total.n), denominator: String(total.d) } } };
  return { basket, total, required, metrics, coverage: sum(coverageScores) };
}

/** Exhaustive reference implementation. Throws rather than returning a partial oracle. */
export function finiteCatalogueOracle(fixture: FiniteOracleFixture): { selected: OracleBasket | null; baskets: readonly OracleBasket[]; enumerated: number; exhaustive: true } {
  if (fixture.products.length > 64) throw new Error("Exhaustive oracle product limit (64) exceeded; reduce the fixture explicitly");
  if (new Set(fixture.targets.map(row => row.subjectId)).size !== fixture.targets.length) throw new Error("Duplicate oracle target identity");
  for (const target of fixture.targets) {
    if (compare(number(target.amount), ZERO) <= 0 || target.minimum != null && compare(number(target.minimum), number(target.amount)) > 0 || target.maximum != null && compare(number(target.maximum), number(target.amount)) < 0) throw new Error("Invalid oracle target or agreed range");
  }
  for (const product of fixture.products) {
    if (!product.doses?.length || product.doses.some(dose => compare(number(dose), ZERO) <= 0)) throw new Error(`Explicit positive dose grid required: ${product.productId}`);
    if (!Number.isSafeInteger(product.priceMinor) || product.priceMinor < 0 || product.pillsPerServing < 0 || Object.values(product.contributions).some(amount => compare(number(amount), ZERO) < 0)) throw new Error(`Invalid oracle commercial or dose facts: ${product.productId}`);
  }
  for (const limit of fixture.limits ?? []) if (compare(number(limit.amount), ZERO) <= 0) throw new Error("Invalid oracle reference limit");
  for (const key of ["maxDailyPills", "maxPriceMinor", "maxProductCount"] as const) if (fixture[key] != null && (!Number.isFinite(fixture[key]) || (key !== "maxDailyPills" && !Number.isSafeInteger(fixture[key])) || fixture[key]! < 0)) throw new Error(`Invalid oracle constraint: ${key}`);
  const products = fixture.products.filter(row => row.eligible !== false && !fixture.excludeProductIds?.includes(row.productId)).sort((a, b) => `${a.sellerId}:${a.productId}`.localeCompare(`${b.sellerId}:${b.productId}`));
  if (new Set(products.map(row => row.sellerId)).size <= 1 && new Set(products.map(row => row.productId)).size === products.length) {
    let leaves = 1;
    for (const product of products) {
      leaves *= new Set(product.doses.map(value => { const dose = number(value); return `${dose.n}/${dose.d}`; })).size + 1;
      if (leaves > LIMIT) throw new Error(`Exhaustive oracle expansion limit (${LIMIT}) exceeded; reduce the fixture explicitly`);
    }
  }
  const complete: InternalBasket[] = [];
  let enumerated = 0;
  function visit(index: number, chosen: readonly { product: FiniteOracleFixture["products"][number]; dose: Rational }[], price: number, pills: Rational) {
    if (++enumerated > LIMIT) throw new Error(`Exhaustive oracle expansion limit (${LIMIT}) exceeded; reduce the fixture explicitly`);
    if (index === products.length) {
      if ((fixture.retainedProductIds ?? []).some(id => !chosen.some(row => row.product.productId === id))) return;
      if ((fixture.productDoses ?? []).some(proposal => !chosen.some(row => row.product.productId === proposal.productId && compare(row.dose, number(proposal.servingsPerDay)) === 0))) return;
      if ((fixture.retainedSubjectIds ?? []).some(id => !chosen.some(row => compare(number(row.product.contributions[id] ?? 0), ZERO) > 0) && !(fixture.current ?? []).some(row => row.subjectId === id && compare(number(row.amount), ZERO) > 0))) return;
      complete.push(evaluate(fixture, chosen)); return;
    }
    const product = products[index]!;
    visit(index + 1, chosen, price, pills);
    if (chosen.some(row => row.product.productId === product.productId || row.product.sellerId !== product.sellerId)) return;
    const proposal = fixture.productDoses?.find(row => row.productId === product.productId);
    const doses = [...new Map(product.doses.map(value => { const dose = number(value); return [`${dose.n}/${dose.d}`, dose] as const; })).values()].sort(compare);
    for (const dose of doses) {
      if (proposal && compare(dose, number(proposal.servingsPerDay)) !== 0) continue;
      const nextPills = add(pills, multiply(number(product.pillsPerServing), dose));
      visit(index + 1, [...chosen, { product, dose }], price + product.priceMinor, nextPills);
    }
  }
  visit(0, [], 0, ZERO);
  // Independent total order: an unknown quantity is never a measured zero.
  const pillOrder = (a: OracleBasket, b: OracleBasket) => Number(!a.pillCountKnown) - Number(!b.pillCountKnown) || (a.pillCountKnown ? a.dailyPills - b.dailyPills : 0);
  const focused = (row: OracleBasket) => fixture.targets.length === 1 && row.productCount === 1 && row.incidentalCount === 0;
  const commercial = (a: InternalBasket, b: InternalBasket) => Number(focused(b.basket)) - Number(focused(a.basket)) || pillOrder(a.basket, b.basket) ||
    a.basket.productCount - b.basket.productCount || a.basket.priceMinor - b.basket.priceMinor || [a.basket.sellerId, ...a.basket.variantIds].join("|").localeCompare([b.basket.sellerId, ...b.basket.variantIds].join("|"));
  const ranked = [...complete].sort((a, b) => compare(a.total, b.total) || commercial(a, b));
  const requiredReference = [...complete].sort((a, b) => compare(a.required, b.required) || compare(a.total, b.total) || commercial(a, b))[0];
  const qualifying = requiredReference ? ranked.filter(candidate => [...requiredReference.metrics].every(([id, metrics]) => metrics.every((value, index) => compare(candidate.metrics.get(id)?.[index] ?? ZERO, value) <= 0))) : ranked;
  return { selected: qualifying[0]?.basket ?? null, baskets: ranked.map(row => row.basket), enumerated, exhaustive: true };
}

/** Canonical fixtures only: independently normalize supported units; reject ambiguity. */
function canonicalAmount(amount: number, unit: string, name: string): number {
  const normalized = unit.toLowerCase().replace(/[µμ]/g, "u").trim();
  const factor = normalized === "mg" ? 1_000_000 : normalized === "g" ? 1_000_000_000 : ["mcg", "ug"].includes(normalized) ? 1000 : normalized === "iu" ? /vitamin[ _-]*d(?:3)?|cholecalciferol/i.test(name) ? 25 : /vitamin[ _-]*e|alpha[ _-]*tocopherol/i.test(name) ? 670_000 : 1 : normalized === "cfu" ? 1 : normalized === "serving" ? 1000 : null;
  if (factor == null) throw new Error(`Oracle fixture requires an explicit supported unit: ${name} (${unit})`);
  return numeric(multiply(number(amount), number(factor)));
}
function independentlyEligible(request: CanonicalRequest, product: MatcherProduct) {
  return product.status === "approved" && product.orderable && product.stockStatus !== "unavailable" && product.currency === request.currency &&
    (!product.availableCountryCodes || product.availableCountryCodes.includes(request.destinationCountry)) &&
    (!request.allowedForms || request.allowedForms.includes(product.form)) &&
    !request.excludeSubjectIds.some(id => product.contributionSubjectIds.includes(id)) &&
    (request.dietaryPreference === "any" || product.dietarySource === "plant" || product.dietarySource === "algae") &&
    (request.omega3SourcePreference !== "algae_only" || product.omegaSource !== "fish");
}

/** Compatibility entry point for existing finite golden fixtures. Explicit grids may override [1,2,3]. */
export function bruteForceMatch(request: CanonicalRequest, catalog: CatalogSnapshot, _config?: MatcherConfig, doseGrids: Readonly<Record<string, readonly OracleNumber[]>> = {}) {
  void _config;
  const stage = request.profile.lifeStage === "pregnant" || request.profile.lifeStage === "breastfeeding" ? request.profile.lifeStage : request.profile.ageYears < 4 ? "child_1_3" : request.profile.ageYears < 9 ? "child_4_8" : request.profile.ageYears < 14 ? "child_9_13" : request.profile.ageYears < 19 ? "adolescent_14_18" : "adult";
  const intake = (rows: CanonicalRequest["currentSupplements"]): OracleIntake[] => rows.map(row => ({ subjectId: row.subjectId, amount: canonicalAmount(row.dailyAmount, row.unit, row.name), certainty: row.certainty,
    ...(row.minimumDailyAmount == null ? {} : { minimum: canonicalAmount(row.minimumDailyAmount, row.unit, row.name) }), ...(row.maximumDailyAmount == null ? {} : { maximum: canonicalAmount(row.maximumDailyAmount, row.unit, row.name) }) }));
  const products = catalog.products.map(product => {
    const contributions: Record<string, number> = {};
    for (const fact of product.labelledContributions) {
      if (!fact.subjectId || !fact.unit) throw new Error(`Oracle fixture needs explicit nutrient identity and unit: ${product.productId}`);
      if (fact.subjectId in contributions) throw new Error(`Oracle fixture contains ambiguous duplicate facts: ${product.productId}/${fact.subjectId}`);
      contributions[fact.subjectId] = canonicalAmount(fact.amount, fact.unit, fact.name);
    }
    return { productId: product.productId, sellerId: product.sellerId, priceMinor: product.unitPriceMinor, pillCountKnown: product.pillCountKnown,
      pillsPerServing: /powder|liquid|sachet|oil|drops|\bml\b/i.test(product.form) ? 0 : product.dailyPillsPerServing,
      doses: doseGrids[product.productId] ?? [1, 2, 3], contributions, eligible: independentlyEligible(request, product) };
  });
  const result = finiteCatalogueOracle({ targets: request.targets.filter(row => row.importance !== "conditional" || row.prerequisite?.status === "satisfied").map(row => ({ subjectId: row.subjectId, amount: canonicalAmount(row.requestedAmount, row.requestedUnit, row.name), basis: row.basis,
    importance: row.importance === "optional" ? "optional" : "required", ...(row.acceptableMinimum == null ? {} : { minimum: canonicalAmount(row.acceptableMinimum, row.requestedUnit, row.name) }), ...(row.acceptableMaximum == null ? {} : { maximum: canonicalAmount(row.acceptableMaximum, row.requestedUnit, row.name) }) })),
    current: intake(request.currentSupplements), dietary: intake(request.dietaryIntake ?? []),
    limits: request.profileKnown?.lifeStage === false || request.profileKnown?.ageYears === false || request.profile.ageYears < 1 ? [] : (request.safetyCeilings ?? []).filter(row => (row.lifeStage ?? "adult") === stage && row.maxAmount > 0).map(row => ({ subjectId: row.subjectId, amount: canonicalAmount(row.maxAmount, row.maxUnit, row.name), scope: row.sourceScope ?? "supplemental" })),
    products, maxProductCount: request.maxProductCount, maxDailyPills: request.maxDailyPills, maxPriceMinor: request.maxPriceMinor,
    excludeProductIds: request.excludeProductIds, retainedProductIds: request.retainProductIds.filter(id => !request.currentSupplements.some(row => row.productId === id)), retainedSubjectIds: request.retainSubjectIds, optimization: request.optimization });
  return { ...result, trimmed: false as const };
}
export function mulberry32(seed: number) {
  let next = seed >>> 0;

  return () => {
    next += 0x6d2b79f5;
    let z = next;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickCatalog(
  catalog: CatalogSnapshot,
  count: number,
  seed: number
): CatalogSnapshot {
  const random = mulberry32(seed);
  const pool = [...catalog.products];

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const current = pool[index]!;
    pool[index] = pool[swap]!;
    pool[swap] = current;
  }

  return {
    availabilityAsOf: catalog.availabilityAsOf,
    catalogueVersion: `${catalog.catalogueVersion}:rng-${seed}`,
    products: pool.slice(0, Math.min(count, pool.length))
  };
}
