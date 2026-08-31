import { ACTIVE_MARKET_COUNTRY, ACTIVE_MARKET_CURRENCY } from "@/lib/agentic/catalogue/market";
import type { CatalogueProduct, CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import { convertAmount } from "@/lib/matcher/dose";
import type { MatcherUnit } from "@/lib/matcher/types";
import { productIsDedicatedForTarget } from "@/lib/matcher/candidates";
import { toMatcherProduct } from "@/lib/agentic/plan/to-matcher-product";
import { servingsPerPackFromProduct } from "@/lib/agentic/value/pack-facts";

export type ValueRoleId =
  | "baselineBasket"
  | "collateralD3"
  | "dedicatedD3"
  | "directCreatine"
  | "directMagnesium"
  | "longSupplyPack";

export type ValueRoleTarget = Readonly<{
  amount: number;
  maximum: number;
  minimum: number;
  name: string;
  unit: MatcherUnit;
}>;

export type ValueRoleRequest = Readonly<{
  creatine: ValueRoleTarget;
  magnesium: ValueRoleTarget;
  vitaminD3: ValueRoleTarget;
}>;

export type ResolvedValueRole = Readonly<{
  blockedReason: string | null;
  dailyContribution: number | null;
  daysSupplied: number | null;
  productId: string | null;
  role: ValueRoleId;
  servingsPerPack: number | null;
  source: "retail" | null;
  status: "blocked" | "resolved";
}>;

const MAX_DAILY_UNITS = 3;

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function supplementForTarget(
  snapshot: CatalogueSnapshot,
  targetName: string
) {
  const needle = normalizeName(targetName);
  return (
    snapshot.supplements.find((item) => normalizeName(item.name) === needle) ??
    snapshot.supplements.find((item) =>
      item.aliases.some((alias) => normalizeName(alias) === needle)
    ) ??
    snapshot.supplements.find((item) =>
      normalizeName(item.name).includes(needle)
    ) ??
    null
  );
}

function dailyContribution(
  product: CatalogueProduct,
  target: ValueRoleTarget,
  supplementId: string,
  dailyUnits: number
) {
  let total = 0;

  for (const fact of product.candidate.facts) {
    if (!fact.unit || fact.amount == null || fact.amount <= 0) {
      continue;
    }

    const factSupplementId = fact.supplementId?.trim();
    const nameHit = normalizeName(fact.name) === normalizeName(target.name);

    if (factSupplementId && factSupplementId !== supplementId && !nameHit) {
      continue;
    }

    if (!factSupplementId && !nameHit) {
      continue;
    }

    const converted = convertAmount({
      amount: fact.amount * dailyUnits,
      fromUnit: fact.unit,
      subjectId: supplementId,
      subjectName: target.name,
      toUnit: target.unit
    });

    if (converted == null) {
      continue;
    }

    total += converted;
  }

  return total;
}

function coversWithinRange(
  product: CatalogueProduct,
  target: ValueRoleTarget,
  supplementId: string
) {
  for (let dailyUnits = 1; dailyUnits <= MAX_DAILY_UNITS; dailyUnits += 1) {
    const amount = dailyContribution(product, target, supplementId, dailyUnits);

    if (amount >= target.minimum && amount <= target.maximum) {
      return { amount, dailyUnits };
    }
  }

  return null;
}

function availableRetail(snapshot: CatalogueSnapshot) {
  return snapshot.products.filter(
    (item) =>
      item.source !== "fixture" &&
      item.orderable &&
      item.stockStatus !== "unavailable"
  );
}

function pickLexical(products: readonly CatalogueProduct[]) {
  return [...products].sort((left, right) =>
    left.productId.localeCompare(right.productId)
  )[0] ?? null;
}

function asTarget(
  target: ValueRoleTarget,
  supplementId: string
) {
  return {
    importance: "required" as const,
    name: target.name,
    requested: {
      dim: "mass_ng" as const,
      subjectId: supplementId,
      units: BigInt(0)
    },
    requestedAmount: target.amount,
    requestedUnit: target.unit,
    subjectId: supplementId
  };
}

function resolved(
  role: ValueRoleId,
  product: CatalogueProduct | null,
  extra?: Partial<ResolvedValueRole>
): ResolvedValueRole {
  if (!product) {
    return {
      blockedReason: `${role} not found in the frozen live catalogue`,
      dailyContribution: null,
      daysSupplied: null,
      productId: null,
      role,
      servingsPerPack: null,
      source: null,
      status: "blocked",
      ...extra
    };
  }

  return {
    blockedReason: null,
    dailyContribution: extra?.dailyContribution ?? null,
    daysSupplied: extra?.daysSupplied ?? null,
    productId: product.productId,
    role,
    servingsPerPack: servingsPerPackFromProduct(product),
    source: "retail",
    status: "resolved",
    ...extra
  };
}

export function resolveValueRoles(
  snapshot: CatalogueSnapshot,
  request: ValueRoleRequest
): Record<ValueRoleId, ResolvedValueRole> {
  const products = availableRetail(snapshot);
  const creatineSup = supplementForTarget(snapshot, request.creatine.name);
  const magSup = supplementForTarget(snapshot, request.magnesium.name);
  const d3Sup = supplementForTarget(snapshot, request.vitaminD3.name);

  const directCreatine = creatineSup
    ? pickLexical(
        products.filter((item) =>
          Boolean(coversWithinRange(item, request.creatine, creatineSup.supplementId))
        )
      )
    : null;

  const directMagnesium = magSup
    ? pickLexical(
        products.filter((item) =>
          Boolean(coversWithinRange(item, request.magnesium, magSup.supplementId))
        )
      )
    : null;

  let dedicatedD3: CatalogueProduct | null = null;
  let collateralD3: CatalogueProduct | null = null;

  if (d3Sup) {
    const covering = products.filter((item) =>
      Boolean(coversWithinRange(item, request.vitaminD3, d3Sup.supplementId))
    );
    const dedicated = covering.filter((item) =>
      productIsDedicatedForTarget(
        toMatcherProduct(item),
        asTarget(request.vitaminD3, d3Sup.supplementId)
      )
    );
    const collateral = covering.filter(
      (item) => !dedicated.some((row) => row.productId === item.productId)
    );

    dedicatedD3 =
      [...dedicated].sort((left, right) => {
        const leftCover = coversWithinRange(left, request.vitaminD3, d3Sup.supplementId);
        const rightCover = coversWithinRange(right, request.vitaminD3, d3Sup.supplementId);
        const leftDelta = Math.abs((leftCover?.amount ?? 0) - request.vitaminD3.amount);
        const rightDelta = Math.abs((rightCover?.amount ?? 0) - request.vitaminD3.amount);

        if (leftDelta !== rightDelta) {
          return leftDelta - rightDelta;
        }

        if (left.dailyPills !== right.dailyPills) {
          return left.dailyPills - right.dailyPills;
        }

        if (left.unitPriceMinor !== right.unitPriceMinor) {
          return left.unitPriceMinor - right.unitPriceMinor;
        }

        return left.productId.localeCompare(right.productId);
      })[0] ?? null;

    collateralD3 =
      collateral.find((item) => {
        if (!dedicatedD3) {
          return true;
        }

        return (
          item.dailyPills > dedicatedD3.dailyPills ||
          item.unitPriceMinor > dedicatedD3.unitPriceMinor ||
          item.candidate.facts.filter((fact) => (fact.amount ?? 0) > 0).length >
            dedicatedD3.candidate.facts.filter((fact) => (fact.amount ?? 0) > 0).length
        );
      }) ?? collateral[0] ?? null;
  }

  const longSupplyPool = products
    .map((item) => {
      const servings = servingsPerPackFromProduct(item);
      const days = servings != null && item.dailyPills > 0 ? servings / Math.max(1, item.dailyPills) : null;
      return { days, item };
    })
    .filter((row) => row.days != null && row.days > 30);

  const longSupply = pickLexical(longSupplyPool.map((row) => row.item));

  const baselineIds = [directCreatine, dedicatedD3, directMagnesium]
    .filter((item): item is CatalogueProduct => Boolean(item))
    .map((item) => item.productId);

  return {
    baselineBasket: {
      blockedReason:
        baselineIds.length > 0 ? null : "baseline separate-direct products were not resolved",
      dailyContribution: null,
      daysSupplied: null,
      productId: baselineIds[0] ?? null,
      role: "baselineBasket",
      servingsPerPack: null,
      source: baselineIds.length > 0 ? "retail" : null,
      status: baselineIds.length > 0 ? "resolved" : "blocked"
    },
    collateralD3: resolved("collateralD3", collateralD3),
    dedicatedD3: resolved("dedicatedD3", dedicatedD3),
    directCreatine: resolved(
      "directCreatine",
      directCreatine,
      directCreatine && creatineSup
        ? {
            dailyContribution: coversWithinRange(
              directCreatine,
              request.creatine,
              creatineSup.supplementId
            )?.amount ?? null
          }
        : undefined
    ),
    directMagnesium: resolved(
      "directMagnesium",
      directMagnesium,
      directMagnesium && magSup
        ? {
            dailyContribution: coversWithinRange(
              directMagnesium,
              request.magnesium,
              magSup.supplementId
            )?.amount ?? null
          }
        : undefined
    ),
    longSupplyPack: resolved(
      "longSupplyPack",
      longSupply,
      longSupply
        ? {
            daysSupplied:
              longSupplyPool.find((row) => row.item.productId === longSupply.productId)?.days ??
              null,
            servingsPerPack: servingsPerPackFromProduct(longSupply)
          }
        : { blockedReason: "no frozen product has a known pack lasting more than 30 days" }
    )
  };
}

export function valueMarketBinding() {
  return {
    countryCode: ACTIVE_MARKET_COUNTRY,
    currency: ACTIVE_MARKET_CURRENCY
  };
}
