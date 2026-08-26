import { COVERED_THRESHOLD } from "@/lib/matcher/config";
import { coverageUnits } from "@/lib/matcher/dominance";
import { productEligible } from "@/lib/matcher/eligibility";
import { aggregateDailyExposure, isDoseError, scaleAmount } from "@/lib/matcher/dose";
import { isFalseOmegaAttribution } from "@/lib/agentic/catalogue/product-fit";
import { productKeysMatch } from "@/lib/product-key-matching";
import { evaluateSafety, exposureExceedsCeiling } from "@/lib/matcher/safety";
import type {
  CanonicalRequest,
  CanonicalTarget,
  CatalogSnapshot,
  DoseVariant,
  MatcherProduct,
  ProductGroup,
  ScaledAmount
} from "@/lib/matcher/types";

const MAX_DAILY_UNITS = 3;
const HIGH_COLLATERAL_MULTI_MAX_DAILY_UNITS = 1;
const NON_PILL_FORM = /powder|liquid|sachet|oil|drops|\bml\b/i;

export function isCountablePillForm(form: string) {
  return !NON_PILL_FORM.test(form);
}

export function variantPillBurden(
  product: Readonly<{ dailyPillsPerServing: number; form: string }>,
  dailyUnits: number
) {
  if (!isCountablePillForm(product.form)) {
    return 0;
  }

  return product.dailyPillsPerServing * dailyUnits;
}

export function remainingRequestedUnits(
  request: CanonicalRequest,
  subjectId: string
) {
  const target = request.targets.find((item) => item.subjectId === subjectId);

  if (!target) {
    return BigInt(0);
  }

  const current = request.currentSupplements
    .filter((item) => item.subjectId === subjectId)
    .reduce((sum, item) => sum + item.daily.units, BigInt(0));

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

export function contributionFor(
  product: MatcherProduct,
  targetName: string,
  targetSubjectId: string
) {
  const targetIds = subjectKeyVariants(targetSubjectId);

  if (
    isFalseOmegaAttribution({ title: product.title }) &&
    /omega|epa|dha|n-3|fish oil/i.test(`${targetName} ${targetSubjectId}`)
  ) {
    return [];
  }

  return product.labelledContributions.filter((item) => {
    if (item.amount == null || item.amount <= 0) {
      return false;
    }

    if (item.subjectId) {
      const factIds = subjectKeyVariants(item.subjectId);

      if (factIds.some((factId) => targetIds.includes(factId))) {
        return true;
      }

      return productKeysMatch(targetSubjectId, item.subjectId);
    }

    return Boolean(item.name?.trim() && targetName.trim()) &&
      productKeysMatch(targetName, item.name);
  });
}

export function compileVariant(input: Readonly<{
  dailyUnits: number;
  product: MatcherProduct;
  request: CanonicalRequest;
}>): DoseVariant | null {
  const amountPerUnit = new Map<string, ScaledAmount>();
  let unknown = input.product.unknownSafetyAmount;

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

      if (!scaled) {
        unknown = true;
        continue;
      }

      const existing = amountPerUnit.get(target.subjectId);
      amountPerUnit.set(
        target.subjectId,
        existing
          ? { ...scaled, units: existing.units + scaled.units }
          : scaled
      );
    }
  }

  if (amountPerUnit.size < 1) {
    return null;
  }

  const contributions = new Map<string, ScaledAmount>();

  for (const [subjectId, perUnit] of amountPerUnit) {
    contributions.set(subjectId, {
      ...perUnit,
      units: perUnit.units * BigInt(input.dailyUnits)
    });
  }

  return {
    amountPerUnit,
    contributions,
    dailyPills: variantPillBurden(input.product, input.dailyUnits),
    dailyUnits: input.dailyUnits,
    productId: input.product.productId,
    unknownSafetyAmount: unknown,
    variantId: `${input.product.productId}:x${input.dailyUnits}`
  };
}

function variantDominates(left: DoseVariant, right: DoseVariant) {
  if (left.productId !== right.productId) {
    return false;
  }

  const subjects = new Set([...left.contributions.keys(), ...right.contributions.keys()]);

  for (const subjectId of subjects) {
    const a = left.contributions.get(subjectId)?.units ?? BigInt(0);
    const b = right.contributions.get(subjectId)?.units ?? BigInt(0);

    if (a < b) {
      return false;
    }
  }

  if (left.dailyPills > right.dailyPills) {
    return false;
  }

  return (
    left.dailyPills < right.dailyPills ||
    [...subjects].some((subjectId) => {
      const a = left.contributions.get(subjectId)?.units ?? BigInt(0);
      const b = right.contributions.get(subjectId)?.units ?? BigInt(0);
      return a > b;
    })
  );
}

function pruneVariants(variants: DoseVariant[]) {
  return variants.filter(
    (candidate, index) =>
      !variants.some(
        (other, otherIndex) =>
          otherIndex !== index && variantDominates(other, candidate)
      )
  );
}

function variantLeavesTargetShortfall(
  variant: DoseVariant,
  request: CanonicalRequest
) {
  for (const [subjectId, amount] of variant.contributions) {
    const target = request.targets.find((item) => item.subjectId === subjectId);

    if (target && amount.units < remainingRequestedUnits(request, subjectId)) {
      return true;
    }
  }

  return false;
}

function carrierTitle(title: string) {
  return /beta\s*glucan|dong[-\s]?quai|soy[-\s]?germ|conceive|pre[-\s]?natal|pre\s*9|\b50\+|multivitamin|multi\s*plus/i.test(
    title
  );
}

function highCollateralMultiTitle(title: string) {
  return /\b50\+|multivitamins for 50/i.test(title);
}

function currentUnitsForSubject(request: CanonicalRequest, subjectId: string) {
  return request.currentSupplements
    .filter((item) => item.subjectId === subjectId)
    .reduce((sum, item) => sum + item.daily.units, BigInt(0));
}

function variantHardBlocked(
  group: ProductGroup,
  variant: DoseVariant,
  request: CanonicalRequest
) {
  const exposure = aggregateDailyExposure({
    current: request.currentSupplements,
    variants: [variant]
  });

  if (isDoseError(exposure)) {
    return true;
  }

  return evaluateSafety({
    exposure,
    products: [group.product],
    request,
    variants: [variant]
  }).hardBlocked;
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

  const current = currentUnitsForSubject(request, subjectId);
  const floor = COVERED_THRESHOLD * 100;

  for (const variant of group.variants) {
    const contributed = variant.contributions.get(subjectId);

    if (!contributed || contributed.units <= BigInt(0)) {
      continue;
    }

    const exposure = current + contributed.units;

    if (exposureExceedsCeiling(request, subjectId, exposure)) {
      continue;
    }

    if (coverageUnits(exposure, target.requested.units) >= floor) {
      return true;
    }
  }

  return false;
}

export function targetHasCoveringGroup(
  groups: readonly ProductGroup[],
  request: CanonicalRequest,
  subjectId: string
) {
  return groups.some((group) =>
    groupCoversTargetAtFloor(group, request, subjectId)
  );
}

function isCarrierNoise(
  product: MatcherProduct,
  request: CanonicalRequest,
  groups: readonly ProductGroup[]
) {
  if (
    highCollateralMultiTitle(product.title) &&
    !request.targets.some((target) => productIsDedicatedForTarget(product, target))
  ) {
    return true;
  }

  if (!carrierTitle(product.title)) {
    return false;
  }

  if (
    (request.profile.lifeStage === "pregnant" ||
      request.profile.lifeStage === "trying_to_conceive") &&
    /pre[-\s]?natal|conceive|pre\s*9/i.test(product.title)
  ) {
    return false;
  }

  if (request.targets.some((target) => productIsDedicatedForTarget(product, target))) {
    return false;
  }

  const labelled = request.targets.filter(
    (target) => contributionFor(product, target.name, target.subjectId).length > 0
  );

  if (labelled.length < 1) {
    return true;
  }

  return labelled.every((target) =>
    targetHasCoveringGroup(groups, request, target.subjectId)
  );
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

function dedicatedTargetCount(product: MatcherProduct, request: CanonicalRequest) {
  return request.targets.reduce(
    (sum, target) => sum + (productIsDedicatedForTarget(product, target) ? 1 : 0),
    0
  );
}

function labelledTargetCount(product: MatcherProduct, request: CanonicalRequest) {
  return request.targets.reduce(
    (sum, target) =>
      sum +
      (contributionFor(product, target.name, target.subjectId).length > 0 ? 1 : 0),
    0
  );
}

function compareDedicatedThenId(
  left: MatcherProduct,
  right: MatcherProduct,
  request: CanonicalRequest
) {
  const dedicated =
    dedicatedTargetCount(right, request) - dedicatedTargetCount(left, request);

  if (dedicated !== 0) {
    return dedicated;
  }

  const labelled =
    labelledTargetCount(left, request) - labelledTargetCount(right, request);

  if (labelled !== 0) {
    return labelled;
  }

  return left.productId.localeCompare(right.productId);
}

function mappedToRequest(
  product: MatcherProduct,
  request: CanonicalRequest
) {
  return request.targets.some((target) =>
    product.contributionSubjectIds.includes(target.subjectId)
  );
}

function labelledForRequest(
  product: MatcherProduct,
  request: CanonicalRequest
) {
  return request.targets.some(
    (target) => contributionFor(product, target.name, target.subjectId).length > 0
  );
}

function compileProductGroup(
  product: MatcherProduct,
  request: CanonicalRequest
): ProductGroup | null {
  if (!productEligible(product, request)) {
    return null;
  }

  const variants: DoseVariant[] = [];
  const maxDailyUnits =
    highCollateralMultiTitle(product.title) &&
    !request.targets.some((target) => productIsDedicatedForTarget(product, target))
      ? HIGH_COLLATERAL_MULTI_MAX_DAILY_UNITS
      : MAX_DAILY_UNITS;

  for (let dailyUnits = 1; dailyUnits <= maxDailyUnits; dailyUnits += 1) {
    if (
      request.maxDailyPills != null &&
      product.dailyPillsPerServing * dailyUnits > request.maxDailyPills
    ) {
      break;
    }

    const variant = compileVariant({ dailyUnits, product, request });

    if (!variant) {
      break;
    }

    variants.push(variant);

    if (!variantLeavesTargetShortfall(variant, request)) {
      break;
    }
  }

  const kept = pruneVariants(variants);

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

function groupCoversTarget(group: ProductGroup, subjectId: string) {
  return group.variants.some((variant) => variant.contributions.has(subjectId));
}

export function compileGroups(
  request: CanonicalRequest,
  catalog: CatalogSnapshot,
  deadlineAt?: number
): ProductGroup[] {
  const groups: ProductGroup[] = [];
  const products = [...catalog.products].sort((left, right) =>
    left.productId.localeCompare(right.productId)
  );
  const mapped = products
    .filter((product) => mappedToRequest(product, request))
    .sort((left, right) => compareDedicatedThenId(left, right, request));
  const labelled = products
    .filter(
      (product) =>
        !mappedToRequest(product, request) && labelledForRequest(product, request)
    )
    .sort((left, right) => compareDedicatedThenId(left, right, request));

  const productLabelsUncoveredTarget = (product: MatcherProduct) =>
    request.targets.some(
      (target) =>
        !targetHasCoveringGroup(groups, request, target.subjectId) &&
        contributionFor(product, target.name, target.subjectId).length > 0
    );

  const tryCompile = (product: MatcherProduct, ignoreDeadline = false) => {
    if (
      !ignoreDeadline &&
      deadlineAt != null &&
      Date.now() >= deadlineAt &&
      !productLabelsUncoveredTarget(product)
    ) {
      return;
    }

    if (groups.some((group) => group.productId === product.productId)) {
      return;
    }

    const group = compileProductGroup(product, request);

    if (group) {
      groups.push(group);
    }
  };

  const dedicatedMapped = mapped.filter((product) =>
    request.targets.some((target) => productIsDedicatedForTarget(product, target))
  );
  const otherMapped = mapped.filter(
    (product) => !dedicatedMapped.some((item) => item.productId === product.productId)
  );

  for (const product of dedicatedMapped) {
    tryCompile(product, true);
  }

  for (const product of otherMapped) {
    if (isCarrierNoise(product, request, groups)) {
      continue;
    }

    const before = groups.length;
    tryCompile(product, true);
    const added = groups[groups.length - 1];

    if (
      groups.length > before &&
      added &&
      !request.targets.some(
        (target) =>
          productIsDedicatedForTarget(product, target) ||
          groupCoversTargetAtFloor(added, request, target.subjectId)
      )
    ) {
      groups.pop();
    }
  }

  for (const product of labelled) {
    if (isCarrierNoise(product, request, groups)) {
      continue;
    }

    const before = groups.length;
    tryCompile(product);
    const added = groups[groups.length - 1];

    if (
      groups.length > before &&
      added &&
      !request.targets.some(
        (target) =>
          productIsDedicatedForTarget(product, target) ||
          groupCoversTargetAtFloor(added, request, target.subjectId)
      )
    ) {
      groups.pop();
    }
  }

  for (const target of request.targets) {
    if (remainingRequestedUnits(request, target.subjectId) <= BigInt(0)) {
      continue;
    }

    if (targetHasCoveringGroup(groups, request, target.subjectId)) {
      continue;
    }

    let added = 0;
    const pool = [...mapped, ...labelled];

    for (const product of pool) {
      if (targetHasCoveringGroup(groups, request, target.subjectId)) {
        break;
      }

      if (groups.some((group) => group.productId === product.productId)) {
        continue;
      }

      if (isCarrierNoise(product, request, groups)) {
        continue;
      }

      if (
        !product.contributionSubjectIds.includes(target.subjectId) &&
        contributionFor(product, target.name, target.subjectId).length < 1
      ) {
        continue;
      }

      const group = compileProductGroup(product, request);

      if (!group || !groupCoversTarget(group, target.subjectId)) {
        continue;
      }

      const coversFloor = groupCoversTargetAtFloor(
        group,
        request,
        target.subjectId
      );

      if (!coversFloor) {
        continue;
      }

      groups.push(group);
      added += 1;
    }
  }

  return groups;
}

function currentUnitsFor(request: CanonicalRequest, subjectId: string) {
  return request.currentSupplements
    .filter((item) => item.subjectId === subjectId)
    .reduce((sum, item) => sum + item.daily.units, BigInt(0));
}

function variantRankForTarget(
  group: ProductGroup,
  variant: DoseVariant,
  target: CanonicalTarget,
  request: CanonicalRequest
) {
  const contributed = variant.contributions.get(target.subjectId);

  if (!contributed || contributed.units <= BigInt(0)) {
    return null;
  }

  const exposure = currentUnitsFor(request, target.subjectId) + contributed.units;

  if (exposureExceedsCeiling(request, target.subjectId, exposure)) {
    return null;
  }

  return {
    coverage: coverageUnits(exposure, target.requested.units),
    dedicated: productIsDedicatedForTarget(group.product, target) ? 1 : 0,
    labelledTargets: labelledTargetCount(group.product, request),
    pills: variant.dailyPills,
    price: group.product.unitPriceMinor * variant.dailyUnits,
    productId: group.productId
  };
}

export function coveringVariantForTarget(
  group: ProductGroup,
  request: CanonicalRequest,
  subjectId: string
) {
  const target = request.targets.find((item) => item.subjectId === subjectId);

  if (!target || target.requested.units <= BigInt(0)) {
    return null;
  }

  const current = currentUnitsFor(request, subjectId);
  const floor = COVERED_THRESHOLD * 100;
  let best: DoseVariant | null = null;

  for (const variant of group.variants) {
    const contributed = variant.contributions.get(subjectId);

    if (!contributed || contributed.units <= BigInt(0)) {
      continue;
    }

    const exposure = current + contributed.units;

    if (exposureExceedsCeiling(request, subjectId, exposure)) {
      continue;
    }

    if (variantHardBlocked(group, variant, request)) {
      continue;
    }

    if (coverageUnits(exposure, target.requested.units) < floor) {
      continue;
    }

    if (
      !best ||
      variant.dailyPills < best.dailyPills ||
      (variant.dailyPills === best.dailyPills &&
        variant.dailyUnits < best.dailyUnits)
    ) {
      best = variant;
    }
  }

  return best;
}

export function compactMultiCoveringGroups(
  groups: readonly ProductGroup[],
  request: CanonicalRequest
) {
  return [...groups]
    .filter((group) => floorCoverCount(group, request) >= 2)
    .sort((left, right) => {
      const floors =
        floorCoverCount(right, request) - floorCoverCount(left, request);

      if (floors !== 0) {
        return floors;
      }

      const pills = minVariantPills(left) - minVariantPills(right);

      if (pills !== 0) {
        return pills;
      }

      return left.productId.localeCompare(right.productId);
    });
}

export function coveringVariantForMostFloors(
  group: ProductGroup,
  request: CanonicalRequest
) {
  const floor = COVERED_THRESHOLD * 100;
  let best: DoseVariant | null = null;
  let bestFloors = 0;

  for (const variant of group.variants) {
    if (variantHardBlocked(group, variant, request)) {
      continue;
    }

    let floors = 0;
    let blocked = false;

    for (const target of request.targets) {
      const units = variant.contributions.get(target.subjectId)?.units ?? BigInt(0);

      if (units <= BigInt(0)) {
        continue;
      }

      const exposure =
        currentUnitsFor(request, target.subjectId) + units;

      if (exposureExceedsCeiling(request, target.subjectId, exposure)) {
        blocked = true;
        break;
      }

      if (coverageUnits(exposure, target.requested.units) >= floor) {
        floors += 1;
      }
    }

    if (blocked || floors < 2) {
      continue;
    }

    if (
      !best ||
      floors > bestFloors ||
      (floors === bestFloors && variant.dailyPills < best.dailyPills)
    ) {
      best = variant;
      bestFloors = floors;
    }
  }

  return best;
}

export function bestCompactCoveringGroup(
  groups: readonly ProductGroup[],
  request: CanonicalRequest,
  subjectId: string
): ProductGroup | null {
  const target = request.targets.find((item) => item.subjectId === subjectId);

  if (!target) {
    return null;
  }

  let best: ProductGroup | null = null;
  let bestRank: {
    dedicated: number;
    facts: number;
    pills: number;
    price: number;
    productId: string;
  } | null = null;

  for (const group of groups) {
    const variant = coveringVariantForTarget(group, request, subjectId);

    if (!variant) {
      continue;
    }

    const rank = {
      dedicated: productIsDedicatedForTarget(group.product, target) ? 1 : 0,
      facts: labelledTargetCount(group.product, request),
      pills: variant.dailyPills,
      price: group.product.unitPriceMinor * variant.dailyUnits,
      productId: group.productId
    };

    if (
      !bestRank ||
      rank.dedicated > bestRank.dedicated ||
      (rank.dedicated === bestRank.dedicated && rank.facts < bestRank.facts) ||
      (rank.dedicated === bestRank.dedicated &&
        rank.facts === bestRank.facts &&
        rank.pills < bestRank.pills) ||
      (rank.dedicated === bestRank.dedicated &&
        rank.facts === bestRank.facts &&
        rank.pills === bestRank.pills &&
        rank.price < bestRank.price) ||
      (rank.dedicated === bestRank.dedicated &&
        rank.facts === bestRank.facts &&
        rank.pills === bestRank.pills &&
        rank.price === bestRank.price &&
        rank.productId < bestRank.productId)
    ) {
      best = group;
      bestRank = rank;
    }
  }

  return best;
}

export function bestGroupForTarget(
  groups: readonly ProductGroup[],
  request: CanonicalRequest,
  subjectId: string
): ProductGroup | null {
  const target = request.targets.find((item) => item.subjectId === subjectId);

  if (!target || remainingRequestedUnits(request, subjectId) <= BigInt(0)) {
    return null;
  }

  let best: ProductGroup | null = null;
  let bestRank: ReturnType<typeof variantRankForTarget> = null;

  for (const group of groups) {
    for (const variant of group.variants) {
      const rank = variantRankForTarget(group, variant, target, request);

      if (!rank) {
        continue;
      }

      if (
        !bestRank ||
        rank.coverage > bestRank.coverage ||
        (rank.coverage === bestRank.coverage &&
          rank.labelledTargets > bestRank.labelledTargets) ||
        (rank.coverage === bestRank.coverage &&
          rank.labelledTargets === bestRank.labelledTargets &&
          rank.dedicated > bestRank.dedicated) ||
        (rank.coverage === bestRank.coverage &&
          rank.labelledTargets === bestRank.labelledTargets &&
          rank.dedicated === bestRank.dedicated &&
          rank.pills < bestRank.pills) ||
        (rank.coverage === bestRank.coverage &&
          rank.labelledTargets === bestRank.labelledTargets &&
          rank.dedicated === bestRank.dedicated &&
          rank.pills === bestRank.pills &&
          rank.price < bestRank.price) ||
        (rank.coverage === bestRank.coverage &&
          rank.labelledTargets === bestRank.labelledTargets &&
          rank.dedicated === bestRank.dedicated &&
          rank.pills === bestRank.pills &&
          rank.price === bestRank.price &&
          rank.productId < bestRank.productId)
      ) {
        best = group;
        bestRank = rank;
      }
    }
  }

  return best;
}

function floorCoverCount(group: ProductGroup, request: CanonicalRequest) {
  return request.targets.filter((target) =>
    groupCoversTargetAtFloor(group, request, target.subjectId)
  ).length;
}

function minVariantPills(group: ProductGroup) {
  return group.variants.reduce(
    (min, variant) => Math.min(min, variant.dailyPills),
    Number.POSITIVE_INFINITY
  );
}

function seedPriorityGroups(
  groups: ProductGroup[],
  request: CanonicalRequest,
  _sellerGroupLimit: number
) {
  const ranked = orderByScarcity(groups, request);
  const priority: ProductGroup[] = [];
  const seen = new Set<string>();

  const compactMultis = [...ranked]
    .filter((group) => floorCoverCount(group, request) >= 2)
    .sort((left, right) => {
      const floors =
        floorCoverCount(right, request) - floorCoverCount(left, request);

      if (floors !== 0) {
        return floors;
      }

      const pills = minVariantPills(left) - minVariantPills(right);

      if (pills !== 0) {
        return pills;
      }

      return left.productId.localeCompare(right.productId);
    });

  for (const group of compactMultis) {
    if (seen.has(group.productId)) {
      continue;
    }

    seen.add(group.productId);
    priority.push(group);
  }

  for (const target of request.targets) {
    const group = bestCompactCoveringGroup(ranked, request, target.subjectId);

    if (!group || seen.has(group.productId)) {
      continue;
    }

    seen.add(group.productId);
    priority.push(group);
  }

  for (const target of request.targets) {
    if (targetHasCoveringGroup(priority, request, target.subjectId)) {
      continue;
    }

    const group = bestGroupForTarget(ranked, request, target.subjectId);

    if (!group || seen.has(group.productId)) {
      continue;
    }

    seen.add(group.productId);
    priority.push(group);
  }

  const rest = ranked.filter((item) => !seen.has(item.productId));
  const covering = request.targets.every(
    (target) =>
      remainingRequestedUnits(request, target.subjectId) <= BigInt(0) ||
      Boolean(bestCompactCoveringGroup(priority, request, target.subjectId))
  );

  if (covering) {
    return priority;
  }

  const limit = Math.max(priority.length + 4, 8);

  return [...priority, ...rest].slice(0, limit);
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
