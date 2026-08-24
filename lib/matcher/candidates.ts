import { productEligible } from "@/lib/matcher/eligibility";
import { isDoseError, scaleAmount } from "@/lib/matcher/dose";
import { productKeysMatch } from "@/lib/product-key-matching";
import type {
  CanonicalRequest,
  CatalogSnapshot,
  DoseVariant,
  MatcherProduct,
  ProductGroup,
  ScaledAmount
} from "@/lib/matcher/types";

const MAX_DAILY_UNITS = 3;

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
  const contributions = new Map<string, ScaledAmount>();
  let unknown = input.product.unknownSafetyAmount;

  for (const target of input.request.targets) {
    const labelled = contributionFor(
      input.product,
      target.name,
      target.subjectId
    );

    for (const fact of labelled) {
      if (fact.amount == null || !fact.unit) {
        unknown = true;
        continue;
      }

      const scaled = scaleAmount({
        amount: fact.amount,
        subjectId: target.subjectId,
        subjectName: target.name,
        unit: fact.unit
      });

      if (isDoseError(scaled)) {
        unknown = true;
        continue;
      }

      const daily = {
        dim: scaled.dim,
        subjectId: scaled.subjectId,
        units: scaled.units * BigInt(input.dailyUnits)
      };
      const existing = contributions.get(target.subjectId);
      contributions.set(
        target.subjectId,
        existing
          ? { ...daily, units: existing.units + daily.units }
          : daily
      );
    }
  }

  if (contributions.size < 1) {
    return null;
  }

  return {
    contributions,
    dailyPills: input.product.dailyPillsPerServing * input.dailyUnits,
    dailyUnits: input.dailyUnits,
    productId: input.product.productId,
    unknownSafetyAmount: false,
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

    if (target && amount.units < target.requested.units) {
      return true;
    }
  }

  return false;
}

export function compileGroups(
  request: CanonicalRequest,
  catalog: CatalogSnapshot,
  deadlineAt?: number
): ProductGroup[] {
  const groups: ProductGroup[] = [];

  for (const product of [...catalog.products].sort((left, right) =>
    left.productId.localeCompare(right.productId)
  )) {
    if (deadlineAt != null && Date.now() >= deadlineAt) {
      break;
    }

    if (!productEligible(product, request)) {
      continue;
    }

    const variants: DoseVariant[] = [];

    for (let dailyUnits = 1; dailyUnits <= MAX_DAILY_UNITS; dailyUnits += 1) {
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

    if (kept.length > 0) {
      groups.push({
        product,
        productId: product.productId,
        sellerId: product.sellerId,
        variants: kept.sort((left, right) =>
          left.variantId.localeCompare(right.variantId)
        )
      });
    }
  }

  return groups;
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
  request: CanonicalRequest
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
      groups: orderByScarcity(sellerGroups, request).slice(0, 32),
      sellerId
    }));
}
