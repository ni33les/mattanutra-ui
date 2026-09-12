import { COVERED_THRESHOLD } from "@/lib/matcher/config";
import { coverageUnits } from "@/lib/matcher/dominance";
import { productEligible } from "@/lib/matcher/eligibility";
import { isDoseError, scaleAmount, multiplyScaled } from "@/lib/matcher/dose";
import { isFalseOmegaAttribution } from "@/lib/agentic/catalogue/product-fit";
import { canonicalNutrientKey, normalizeProductFactKey, productKeysMatch } from "@/lib/product-key-matching";
import { nutrientNameMatchesTarget } from "@/lib/nutrient-identity";
import { labelledSafetyExposure } from "@/lib/matcher/safety";
import { factSupportsQuantifiedExposure, uncertainProductSubjects } from "@/lib/matcher/fact-provenance";
import { knownCurrentTargetExposure, targetDoseTicks } from "@/lib/matcher/target-basis";
import type {
  CanonicalRequest,
  CanonicalTarget,
  CatalogSnapshot,
  DoseVariant,
  MatcherProduct,
  ProductGroup,
  ScaledAmount
} from "@/lib/matcher/types";

import { ratioForSupportedServings, servingIncrement, type ServingRatio } from "@/lib/matcher/serving-grid";

const NON_PILL_FORM = /powder|liquid|sachet|oil|drops|\bml\b/i;

function listingId(product: Readonly<{ productId: string; sellerId: string }>) {
  return `${product.sellerId}:${product.productId}`;
}

export function isCountablePillForm(form: string) {
  return !NON_PILL_FORM.test(form);
}

export function variantPillBurden(
  product: Readonly<Pick<MatcherProduct, "dailyPillsPerServing" | "form" | "administration">>,
  dailyUnits: number
) {
  const administration = product.administration;
  if (administration?.provenance.status === "verified") {
    if (administration.route !== "oral" || !/^(capsule|tablet|softgel|gummy)$/.test(administration.physicalUnit)) return 0;
    return (administration.unitsPerServing ?? 0) * dailyUnits;
  }
  if (!isCountablePillForm(product.form)) {
    return 0;
  }

  return product.dailyPillsPerServing * dailyUnits;
}

export function isDeferredConditional(target: CanonicalRequest["targets"][number]) {
  return (
    target.importance === "conditional" &&
    target.prerequisite?.status !== "satisfied"
  );
}

export function remainingRequestedUnits(
  request: CanonicalRequest,
  subjectId: string
) {
  const target = request.targets.find((item) => item.subjectId === subjectId);

  if (!target || isDeferredConditional(target)) {
    return BigInt(0);
  }

  const current = knownCurrentTargetExposure(request, target);

  return target.requested.units > current
    ? target.requested.units - current
    : BigInt(0);
}

function subjectKeyVariants(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return [];
  }

  return [...new Set([trimmed, trimmed.replace(/-/g, "_"), trimmed.replace(/_/g, "-")])];
}

function labelledFactKey(
  fact: Readonly<{ name?: string | null; subjectId?: string | null; unit?: string | null }>
) {
  if (nutrientNameMatchesTarget("EPA", fact.name ?? "")) return "omega:epa";
  if (nutrientNameMatchesTarget("DHA", fact.name ?? "")) return "omega:dha";
  const subject = fact.subjectId?.trim().toLowerCase() ?? "";

  if (subject) {
    return `id:${subject}`;
  }

  const name = (fact.name ?? "").trim();
  const unit = (fact.unit ?? "").trim().toLowerCase();

  if (!name) {
    return `name:|${unit}`;
  }

  return `name:${canonicalNutrientKey(name)}|${unit}`;
}

export function collapseDuplicateLabelledFacts<
  T extends Readonly<{
    amount: number | null;
    name?: string | null;
    subjectId?: string | null;
    unit?: string | null;
  }>
>(facts: readonly T[]): T[] {
  const best = new Map<string, T>();

  for (const fact of facts) {
    if (fact.amount == null || fact.amount <= 0) {
      continue;
    }

    const key = labelledFactKey(fact);
    const existing = best.get(key);

    const scaled = fact.unit ? scaleAmount({ amount: fact.amount, subjectId: fact.subjectId ?? key, subjectName: fact.name ?? "", unit: fact.unit }) : null;
    const previous = existing?.unit && existing.amount != null ? scaleAmount({ amount: existing.amount, subjectId: existing.subjectId ?? key, subjectName: existing.name ?? "", unit: existing.unit }) : null;
    const larger = scaled && previous && !isDoseError(scaled) && !isDoseError(previous) && scaled.dim === previous.dim
      ? scaled.units > previous.units : fact.amount > (existing?.amount ?? 0);
    if (!existing || larger) {
      best.set(key, fact);
    }
  }

  return [...best.values()];
}

const contributionMemo = new WeakMap<MatcherProduct, Map<string, ReturnType<typeof contributionForFresh>>>();

export function contributionFor(
  product: MatcherProduct,
  targetName: string,
  targetSubjectId: string
) {
  const key = `${targetName}\0${targetSubjectId}`;
  let byTarget = contributionMemo.get(product);

  if (!byTarget) {
    byTarget = new Map();
    contributionMemo.set(product, byTarget);
  }

  if (byTarget.has(key)) {
    return byTarget.get(key)!;
  }

  const hits = contributionForFresh(product, targetName, targetSubjectId);
  byTarget.set(key, hits);
  return hits;
}

function contributionForFresh(
  product: MatcherProduct,
  targetName: string,
  targetSubjectId: string
) {
  if (product.administration && product.administration.route !== "oral" && product.administration.route !== "unknown") return [];
  const targetIds = subjectKeyVariants(targetSubjectId);

  if (
    isFalseOmegaAttribution({ title: product.title }) &&
    /omega|epa|dha|n-3|fish oil/i.test(`${targetName} ${targetSubjectId}`)
  ) {
    return [];
  }

  const hits = product.labelledContributions.filter((item) => {
    if (!factSupportsQuantifiedExposure(product, item) || item.amount == null || item.amount <= 0) {
      return false;
    }
    if (item.name?.trim() && targetName.trim() && !nutrientNameMatchesTarget(targetName, item.name)) return false;

    if (item.subjectId) {
      const factIds = subjectKeyVariants(item.subjectId);

      if (factIds.some((factId) => targetIds.includes(factId))) {
        return true;
      }

      const compact = (value: string) =>
        value.replace(/^sup_/i, "").replace(/-/g, "").toLowerCase();

      if (compact(item.subjectId) === compact(targetSubjectId)) {
        return true;
      }

      if (productKeysMatch(targetSubjectId, item.subjectId)) {
        return true;
      }
    }

    return Boolean(item.name?.trim() && targetName.trim()) &&
      nutrientNameMatchesTarget(targetName, item.name);
  });

  const explicitOmegaTotal = hits.filter((fact) => ["omega_3", "omega3", "omega_3_fatty_acids"].includes(normalizeProductFactKey(fact.name)));
  // A total and its EPA/DHA components describe the same labelled amount.
  return collapseDuplicateLabelledFacts(explicitOmegaTotal.length ? explicitOmegaTotal : hits);
}

// Immutable request/product facts are compiled once. Supported quantities only
// multiply these exact units; unknown/conflicting label evidence is preserved.
const variantBasis = new WeakMap<CanonicalRequest, WeakMap<MatcherProduct, ReturnType<typeof compileVariantBasis>>>();
function compileVariantBasis(input: Readonly<{ product: MatcherProduct; request: CanonicalRequest }>) {
  const amountPerUnit = new Map<string, ScaledAmount>();
  const unknownSubjectIds = uncertainProductSubjects(input.product, input.request);
  let unknown = input.product.unknownSafetyAmount || unknownSubjectIds.length > 0;

  for (const target of input.request.targets) {
    const labelled = contributionFor(
      input.product,
      target.name,
      target.subjectId
    );

    for (const fact of labelled) {
      if (fact.amount == null || fact.amount <= 0 || !fact.unit) {
        unknown = true;
        continue;
      }

      const names = [target.name, fact.name].filter(
        (name): name is string => Boolean(name?.trim())
      );
      let scaled: ReturnType<typeof scaleAmount> | null = null;

      for (const subjectName of names) {
        const attempt = scaleAmount({
          amount: fact.amount,
          subjectId: target.subjectId,
          subjectName,
          unit: fact.unit
        });

        if (!isDoseError(attempt)) {
          scaled = attempt;
          break;
        }
      }

      if (!scaled || scaled.dim !== target.requested.dim) {
        unknown = true;
        continue;
      }

      const existing = amountPerUnit.get(target.subjectId);
      const omegaComponents = /^(?:omega[- _]?3|omega[- _]?3 fatty acids)$/i.test(target.name.trim()) &&
        labelled.every((row) => nutrientNameMatchesTarget("EPA", row.name) || nutrientNameMatchesTarget("DHA", row.name));
      amountPerUnit.set(
        target.subjectId,
        existing
          ? { ...scaled, units: omegaComponents ? existing.units + scaled.units : existing.units > scaled.units ? existing.units : scaled.units }
          : scaled
      );
    }
  }

  return { amountPerUnit, unknownSubjectIds, unknown };
}
function variantBasisFor(input: Readonly<{ product: MatcherProduct; request: CanonicalRequest }>) {
  let cache = variantBasis.get(input.request); if (!cache) { cache = new WeakMap(); variantBasis.set(input.request, cache); }
  let result = cache.get(input.product);
  if (!result) { result = compileVariantBasis(input); cache.set(input.product, result); }
  return result;
}

export function compileVariant(input: Readonly<{
  dailyUnits: number;
  dailyUnitsRatio?: ServingRatio;
  product: MatcherProduct;
  request: CanonicalRequest;
}>): DoseVariant | null {
  const ratio = input.dailyUnitsRatio ?? ratioForSupportedServings(input.product, input.dailyUnits);
  if (!ratio) return null;
  const { amountPerUnit, unknownSubjectIds, unknown } = variantBasisFor(input);

  const safetyExposure = labelledSafetyExposure(input.product, input.dailyUnits, input.request, ratio);
  const declaredTarget = unknown && input.request.targets.some(row => input.product.contributionSubjectIds.includes(row.subjectId) || unknownSubjectIds.includes(row.subjectId)) &&
    (!input.product.administration || input.product.administration.route === "oral" || input.product.administration.route === "unknown");
  if (amountPerUnit.size < 1 && !declaredTarget && !input.request.retainProductIds.includes(input.product.productId) &&
    !input.request.productDoses?.some(row => row.productId === input.product.productId) &&
    !input.request.retainSubjectIds.some((id) => (safetyExposure.get(id)?.units ?? BigInt(0)) > BigInt(0))) {
    return null;
  }

  const contributions = new Map<string, ScaledAmount>();

  for (const [subjectId, perUnit] of amountPerUnit) {
    const scaled = multiplyScaled(perUnit, ratio);
    if (isDoseError(scaled)) return null;
    contributions.set(subjectId, scaled);
  }

  return {
    amountPerUnit,
    contributions,
    dailyPills: variantPillBurden(input.product, input.dailyUnits),
    dailyUnits: input.dailyUnits,
    dailyUnitsRatio: ratio,
    productId: input.product.productId,
    safetyExposure,
    unknownSafetyAmount: unknown,
    unknownSubjectIds,
    variantId: `${listingId(input.product)}:x${input.dailyUnits}`
  };
}

function carrierTitle(title: string) {
  return /beta\s*glucan|dong[-\s]?quai|soy[-\s]?germ|conceive|pre[-\s]?natal|pre\s*9|\b50\+|multivitamin|multi\s*plus/i.test(
    title
  );
}

export function productHitsCoverageFloor(
  product: MatcherProduct,
  request: CanonicalRequest,
  target: CanonicalTarget
) {
  const group = compileProductGroup(product, request);
  return Boolean(
    group &&
      groupCoversTargetAtFloor(group, request, target.subjectId)
  );
}

export function groupCoversTargetAtFloor(
  group: ProductGroup,
  request: CanonicalRequest,
  subjectId: string
) {
  const target = request.targets.find((item) => item.subjectId === subjectId);

  if (!target || target.requested.units <= BigInt(0)) {
    return false;
  }

  const current = knownCurrentTargetExposure(request, target);
  const floor = COVERED_THRESHOLD * 100;

  for (const variant of group.variants) {
    const contributed = variant.contributions.get(subjectId);

    if (!contributed || contributed.units <= BigInt(0)) {
      continue;
    }

    const exposure = current + contributed.units;


    if (coverageUnits(exposure, target.requested.units) >= floor) {
      return true;
    }
  }

  return false;
}

export function productIsDedicatedForTarget(
  product: MatcherProduct,
  target: CanonicalTarget
) {
  const labelled = contributionFor(product, target.name, target.subjectId);

  if (labelled.length < 1) {
    return false;
  }

  const hay = product.title.toLowerCase();
  const needle = target.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const titleMentions = needle.length >= 2 && hay.includes(needle);
  const factCount = product.labelledContributions.filter(
    (item) => item.amount != null && item.amount > 0
  ).length;

  if (carrierTitle(product.title) && factCount > 1 && !titleMentions) {
    return false;
  }

  return titleMentions || factCount === 1;
}

// Reuse compilation only inside the same immutable request. A partial token
// previously reused eligibility and dose variants across different forms,
// doses, demographics, destinations and safety ceilings.
const compiledGroupMemo = new WeakMap<CanonicalRequest, WeakMap<MatcherProduct, ProductGroup | null>>();

function compileProductGroup(
  product: MatcherProduct,
  request: CanonicalRequest
): ProductGroup | null {
  let session = compiledGroupMemo.get(request);
  if (!session) {
    session = new WeakMap();
    compiledGroupMemo.set(request, session);
  }
  if (session.has(product)) return session.get(product)!;

  const group = compileProductGroupFresh(product, request);
  session.set(product, group);
  return group;
}

function compileProductGroupFresh(
  product: MatcherProduct,
  request: CanonicalRequest
): ProductGroup | null {
  if (!productEligible(product, request)) {
    return null;
  }

  const variants: DoseVariant[] = [];
  for (const ratio of supportedDoseDomain(product, request)) {
    const dailyUnits = Number(ratio.num) / Number(ratio.den);
    const variant = compileVariant({ dailyUnits, dailyUnitsRatio: ratio, product, request });
    if (variant) variants.push(variant);
  }

  const kept = variants;

  if (kept.length < 1) {
    return null;
  }

  return {
    product,
    productId: product.productId,
    sellerId: product.sellerId,
    variants: kept.sort((left, right) =>
      left.variantId.localeCompare(right.variantId)
    )
  };
}

export function compileGroups(
  request: CanonicalRequest,
  catalog: CatalogSnapshot,
  _deadlineAt?: number
): ProductGroup[] {
  void _deadlineAt;
  // Compilation is deterministic. Health advice and weak contribution are not
  // reasons to discard an otherwise valid option before dose-fit comparison.
  const seen = new Set<string>();
  return [...catalog.products]
    .sort((a, b) => listingId(a).localeCompare(listingId(b)))
    .flatMap((product) => {
      const id = listingId(product);
      if (seen.has(id)) return [];
      seen.add(id);
      const group = compileProductGroup(product, request);
      return group ? [group] : [];
    });
}

function seedPriorityGroups(groups: ProductGroup[], request: CanonicalRequest, sellerGroupLimit: number) {
  // The expansion budget bounds work. All catalogue groups stay eligible; an
  // early coverage-floor hit cannot hide a less excessive combination.
  void sellerGroupLimit;
  return orderByScarcity(groups, request);
}

function orderByScarcity(groups: ProductGroup[], request: CanonicalRequest) {
  const coverCount = new Map<string, number>();

  for (const target of request.targets) {
    coverCount.set(
      target.subjectId,
      groups.filter((group) =>
        group.variants.some((variant) => variant.contributions.has(target.subjectId))
      ).length
    );
  }

  return [...groups].sort((left, right) => {
    const retained = Number(request.retainProductIds.includes(right.productId)) - Number(request.retainProductIds.includes(left.productId));
    if (retained !== 0) return retained;
    const leftRare = Math.min(
      ...request.targets.map((target) =>
        left.variants.some((variant) => variant.contributions.has(target.subjectId))
          ? coverCount.get(target.subjectId) ?? 0
          : 999
      )
    );
    const rightRare = Math.min(
      ...request.targets.map((target) =>
        right.variants.some((variant) => variant.contributions.has(target.subjectId))
          ? coverCount.get(target.subjectId) ?? 0
          : 999
      )
    );

    if (leftRare !== rightRare) {
      return leftRare - rightRare;
    }

    return left.productId.localeCompare(right.productId);
  });
}

export function groupsBySeller(
  groups: readonly ProductGroup[],
  request: CanonicalRequest,
  sellerGroupLimit = 32
) {
  const bySeller = new Map<string, ProductGroup[]>();

  for (const group of groups) {
    const list = bySeller.get(group.sellerId) ?? [];
    list.push(group);
    bySeller.set(group.sellerId, list);
  }

  return [...bySeller.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sellerId, sellerGroups]) => ({
      groups: seedPriorityGroups(sellerGroups, request, sellerGroupLimit),
      sellerId
    }));
}

/** A finite breakpoint domain bounds search effort without imposing a dose cap.
 * Neighbours retain valid choices on both sides of each target/reference limit. */
export function supportedDoseDomain(product: MatcherProduct, request: CanonicalRequest): ServingRatio[] {
  const proposed = request.productDoses?.find(row => row.productId === product.productId);
  if (proposed) { const ratio = ratioForSupportedServings(product, proposed.servingsPerDay); return ratio ? [ratio] : []; }
  const step = servingIncrement(product);
  const ticks = new Set<bigint>([BigInt(1)]);
  // Preserve labelled quantities, including the historical domain, as choices.
  for (const value of [1, 2, 3]) { const units = (BigInt(value) * step.den) / step.num; if (units > 0) ticks.add(units); }
  const compiled = compileVariant({ product, request, dailyUnits: Number(step.num) / Number(step.den), dailyUnitsRatio: step });
  for (const target of request.targets) {
    if (isDeferredConditional(target)) continue;
    const perServing = compiled?.amountPerUnit.get(target.subjectId)?.units;
    if (!perServing || perServing <= 0) continue;
    for (const value of targetDoseTicks(request, target, perServing, step)) ticks.add(value);
    for (const bound of [target.acceptableMinimum, target.acceptableMaximum]) {
      if (bound == null) continue;
      const scaled = scaleAmount({ amount: bound, subjectId: target.subjectId, subjectName: target.name, unit: target.requestedUnit });
      if (!isDoseError(scaled)) {
        for (const value of targetDoseTicks(request, target, perServing, step, undefined, scaled.units)) ticks.add(value);
      }
    }
  }
  const labelled = labelledSafetyExposure(product, Number(step.num) / Number(step.den), request, step);
  for (const ceiling of request.safetyCeilings ?? []) {
    const increment = labelled.get(ceiling.subjectId)?.units;
    if (!increment || increment <= 0) continue;
    const limit = scaleAmount({ amount: ceiling.maxAmount, subjectId: ceiling.subjectId, subjectName: ceiling.name, unit: ceiling.maxUnit });
    if (isDoseError(limit)) continue;
    const current = request.currentSupplements.filter(row => row.subjectId === ceiling.subjectId).reduce((sum, row) => sum + row.daily.units, BigInt(0));
    const floor = (limit.units > current ? limit.units - current : BigInt(0)) / increment;
    for (const value of [floor, floor + BigInt(1)]) if (value > 0 && value <= BigInt(Number.MAX_SAFE_INTEGER)) ticks.add(value);
  }
  return [...ticks].sort((a, b) => a < b ? -1 : a > b ? 1 : 0).map(value => ({ num: step.num * value, den: step.den }));
}
