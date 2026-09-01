import { payableSnapshot } from "@/lib/agentic/money";
import { catalogueSnapshotId } from "@/lib/agentic/catalogue/freeze";
import type { CatalogueProduct, CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import type {
  BasketItem,
  CanonicalPlanState,
  CoverageRow,
  EconomicsBaselineLine,
  EconomicsComparisonBasis,
  EconomicsLedger
} from "@/lib/agentic/plan/types";
import { productIsDedicatedForTarget } from "@/lib/matcher/candidates";
import { toMatcherProduct } from "@/lib/agentic/plan/to-matcher-product";
import { packsForHorizon } from "@/lib/agentic/value/horizon-cash";
import { actualDaysSupplied, servingsPerPackFromProduct } from "@/lib/agentic/value/pack-facts";

const DEFAULT_HORIZONS = [30, 90] as const;
const HORIZON_90 = 90;

export function packsThroughHorizon(input: Readonly<{
  dailyServings: number;
  horizonDays: number;
  servingsPerPack: number | null | undefined;
}>) {
  return packsForHorizon(input);
}

export function leftoverServingsAt(input: Readonly<{
  dailyServings: number;
  horizonDays: number;
  servingsPerPack: number | null | undefined;
}>) {
  if (input.servingsPerPack == null || input.servingsPerPack <= 0 || input.dailyServings <= 0) {
    return null;
  }

  const packs = packsThroughHorizon(input);
  if (packs == null) {
    return null;
  }
  return packs * input.servingsPerPack - input.horizonDays * input.dailyServings;
}

export function enrichBasketPackFacts(item: BasketItem): BasketItem {
  const servingsPerPack = item.servingsPerPack ?? null;
  const purchasedQuantity = Math.max(1, item.quantity);
  const dailyServings = Math.max(1, item.servingsPerDay);
  const availableServings =
    servingsPerPack != null ? servingsPerPack * purchasedQuantity : null;
  const daysOfSupply = actualDaysSupplied({
    dailyServings,
    purchasedQuantity,
    servingsPerPack
  });

  return {
    ...item,
    availableServings,
    daysOfSupply,
    leftoverServings30: leftoverServingsAt({
      dailyServings,
      horizonDays: 30,
      servingsPerPack
    }),
    leftoverServings90: leftoverServingsAt({
      dailyServings,
      horizonDays: 90,
      servingsPerPack
    }),
    lineTotalMinor: item.unitPriceMinor * purchasedQuantity,
    quantity: purchasedQuantity,
    replenishmentDay: daysOfSupply,
    servingsPerPack
  };
}

function lineCash(item: BasketItem, horizonDays: number) {
  const packs = packsThroughHorizon({
    dailyServings: item.servingsPerDay,
    horizonDays,
    servingsPerPack: item.servingsPerPack
  });
  if (packs == null) {
    return null;
  }
  return item.unitPriceMinor * packs;
}

function lineConsumption(item: BasketItem, horizonDays: number) {
  if (item.servingsPerPack == null || item.servingsPerPack <= 0 || item.servingsPerDay <= 0) {
    return null;
  }

  return Math.round(
    (item.unitPriceMinor / item.servingsPerPack) * horizonDays * item.servingsPerDay
  );
}

function coveredCount(coverage: readonly CoverageRow[]) {
  return coverage.filter(
    (row) =>
      row.status === "covered" ||
      row.status === "already_covered" ||
      row.status === "over_target"
  ).length;
}

function administrationCount(items: readonly BasketItem[]) {
  return items.filter((item) => /powder|liquid|sachet/i.test(item.form)).length;
}

function baselineLineForProduct(
  product: CatalogueProduct,
  dailyServings: number
): EconomicsBaselineLine {
  const servingsPerPack = servingsPerPackFromProduct(product);
  const quantity =
    packsThroughHorizon({
      dailyServings,
      horizonDays: 90,
      servingsPerPack
    }) ?? 1;

  return {
    lineTotalMinor: product.unitPriceMinor * quantity,
    productId: product.productId,
    quantity,
    unitPriceMinor: product.unitPriceMinor
  };
}

function dedicatedLine(
  snapshot: CatalogueSnapshot,
  state: CanonicalPlanState,
  coverage: CoverageRow
): EconomicsLedger["baseline"]["lines"][number] | null {
  const target = state.targets.find((item) => item.supplementId === coverage.supplementId);

  if (!target) {
    return null;
  }

  const matcherTarget = {
    importance: target.importance ?? "required",
    name: target.name,
    requested: {
      dim: "mass_ng" as const,
      subjectId: target.supplementId,
      units: BigInt(0)
    },
    requestedAmount: target.amount,
    requestedUnit: target.unit,
    subjectId: target.supplementId
  };
  const dedicated = snapshot.products
    .filter(
      (product) =>
        product.source !== "fixture" &&
        product.orderable &&
        product.contributionSupplementIds.includes(target.supplementId) &&
        productIsDedicatedForTarget(toMatcherProduct(product), matcherTarget)
    )
    .sort((left, right) => left.unitPriceMinor - right.unitPriceMinor || left.productId.localeCompare(right.productId))[0];

  if (!dedicated) {
    return null;
  }

  return baselineLineForProduct(dedicated, 1);
}

function productForCurrent(
  snapshot: CatalogueSnapshot,
  current: CanonicalPlanState["currentSupplements"][number]
) {
  if (current.productId) {
    const exact = snapshot.products.find((item) => item.productId === current.productId);
    if (exact) {
      return exact;
    }
  }
  return (
    snapshot.products
      .filter(
        (product) =>
          product.source !== "fixture" &&
          product.orderable &&
          product.contributionSupplementIds.includes(current.supplementId)
      )
      .sort(
        (left, right) =>
          left.unitPriceMinor - right.unitPriceMinor || left.productId.localeCompare(right.productId)
      )[0] ?? null
  );
}

function replenishmentLines(
  snapshot: CatalogueSnapshot,
  state: CanonicalPlanState,
  horizonDays: number
): EconomicsBaselineLine[] {
  const lines: EconomicsBaselineLine[] = [];

  for (const current of state.currentSupplements) {
    if (current.daysRemaining == null || current.daysRemaining >= horizonDays) {
      continue;
    }
    const remainingDays = horizonDays - current.daysRemaining;
    if (remainingDays <= 0) {
      continue;
    }
    const product = productForCurrent(snapshot, current);
    if (!product) {
      continue;
    }
    const servingsPerPack = servingsPerPackFromProduct(product);
    const quantity = packsThroughHorizon({
      dailyServings: 1,
      horizonDays: remainingDays,
      servingsPerPack
    });
    if (quantity == null) {
      continue;
    }
    lines.push({
      lineTotalMinor: product.unitPriceMinor * quantity,
      productId: product.productId,
      quantity,
      unitPriceMinor: product.unitPriceMinor
    });
  }

  return lines;
}

function comparisonBasisFor(
  snapshot: CatalogueSnapshot,
  state: CanonicalPlanState
): EconomicsComparisonBasis {
  return {
    baselineType: state.baseline?.type ?? "separate_direct_products",
    catalogueSnapshotId: catalogueSnapshotId(snapshot),
    costHorizonsDays: [...DEFAULT_HORIZONS],
    currency: state.currency,
    currentInventory: state.currentSupplements.map((item) => ({
      daysRemaining: item.daysRemaining ?? null,
      productId: item.productId ?? null,
      supplementId: item.supplementId
    })),
    destinationCountry: state.destinationCountry,
    orderBoundary: "order_at_H_excluded",
    rounding: "minor_unit_once"
  };
}

function baselineFromRequest(
  snapshot: CatalogueSnapshot,
  state: CanonicalPlanState
): EconomicsBaselineLine[] | null {
  if (state.baseline?.type !== "current_basket" || !state.baseline.items?.length) {
    return null;
  }

  const lines = state.baseline.items
    .map((item) => {
      const product = snapshot.products.find((row) => row.productId === item.productId);

      if (!product) {
        return null;
      }

      const quantity = Math.max(1, Math.ceil(item.quantity));
      return {
        lineTotalMinor: product.unitPriceMinor * quantity,
        productId: product.productId,
        quantity,
        unitPriceMinor: product.unitPriceMinor
      };
    })
    .filter((item): item is EconomicsBaselineLine => Boolean(item));

  return lines.length > 0 ? lines : null;
}

export function buildEconomics(input: Readonly<{
  coverage: readonly CoverageRow[];
  items: readonly BasketItem[];
  recommendedCoverage?: readonly CoverageRow[];
  recommendedItems?: readonly BasketItem[];
  snapshot: CatalogueSnapshot;
  state: CanonicalPlanState;
}>): EconomicsLedger {
  const items = input.items.map(enrichBasketPackFacts);
  const firstOrderSubtotalMinor = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const payable = payableSnapshot({ subtotalMinor: firstOrderSubtotalMinor });
  const shippingMinor = items.length > 0 ? payable.shippingMinor : 0;
  const otherCustomerCostMinor = items.length > 0 ? payable.taxMinor : 0;
  const cash30Parts = items.map((item) => lineCash(item, 30));
  const cash90Parts = items.map((item) => lineCash(item, 90));
  const consumption30Parts = items.map((item) => lineConsumption(item, 30));
  const consumption90Parts = items.map((item) => lineConsumption(item, 90));
  const productCash30 = cash30Parts.every((item) => item != null)
    ? cash30Parts.reduce((sum, item) => sum + (item ?? 0), 0)
    : null;
  const productCash90 = cash90Parts.every((item) => item != null)
    ? cash90Parts.reduce((sum, item) => sum + (item ?? 0), 0)
    : null;
  const consumption30DayMinor = consumption30Parts.every((item) => item != null)
    ? consumption30Parts.reduce((sum, item) => sum + (item ?? 0), 0)
    : null;
  const consumption90DayMinor = consumption90Parts.every((item) => item != null)
    ? consumption90Parts.reduce((sum, item) => sum + (item ?? 0), 0)
    : null;
  const addOn = items.length > 0 ? shippingMinor + otherCustomerCostMinor : 0;
  const cash30DayMinor = productCash30 == null ? null : productCash30 + addOn;
  const cash90DayMinor = productCash90 == null ? null : productCash90 + addOn;
  const replenishment = replenishmentLines(input.snapshot, input.state, HORIZON_90);
  const replenishmentCash = replenishment.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const purchasedBaseline =
    baselineFromRequest(input.snapshot, input.state) ??
    input.coverage
      .filter((row) => row.status === "covered" || row.status === "over_target")
      .map((row) => dedicatedLine(input.snapshot, input.state, row))
      .filter((item): item is EconomicsBaselineLine => Boolean(item));
  const baselineLines = [...purchasedBaseline, ...replenishment];
  const baselineSubtotal = purchasedBaseline.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const baselinePayable = payableSnapshot({ subtotalMinor: baselineSubtotal });
  const baselineCash90 =
    purchasedBaseline.length > 0 || replenishment.length > 0
      ? baselinePayable.totalPriceMinor + replenishmentCash
      : 0;
  const optionCash90 =
    cash90DayMinor == null ? null : cash90DayMinor + replenishmentCash;
  const savings90DayMinor =
    optionCash90 == null ? null : baselineCash90 - optionCash90;
  const equivalent = input.coverage.every((row) => {
    const target = input.state.targets.find((item) => item.supplementId === row.supplementId);
    const importance = target?.importance ?? "required";

    if (importance !== "core" && importance !== "required") {
      return true;
    }

    return (
      row.status === "covered" ||
      row.status === "already_covered" ||
      row.status === "over_target"
    );
  });
  const recommended = input.recommendedItems?.map(enrichBasketPackFacts) ?? items;
  const recommendedCoverage = input.recommendedCoverage ?? input.coverage;
  const complete =
    items.length > 0 &&
    items.every((item) => item.servingsPerPack != null && item.servingsPerPack > 0) &&
    cash30DayMinor != null &&
    cash90DayMinor != null &&
    consumption30DayMinor != null &&
    consumption90DayMinor != null;
  const eligibleSaving = complete && equivalent && savings90DayMinor != null;
  const savingClaim = !eligibleSaving
    ? "none"
    : savings90DayMinor > 0
      ? "positive"
      : savings90DayMinor < 0
        ? "loss"
        : "none";

  return {
    baseline: {
      cash90DayMinor: baselineCash90,
      lines: baselineLines,
      type: input.state.baseline?.type ?? "separate_direct_products"
    },
    comparisonBasis: comparisonBasisFor(input.snapshot, input.state),
    cash30DayMinor,
    cash90DayMinor: optionCash90,
    cashTotalMinor: items.length > 0 ? payable.totalPriceMinor : 0,
    complete,
    consumption30DayMinor,
    consumption90DayMinor,
    deltas: {
      administrations: administrationCount(items) - administrationCount(recommended),
      coverage: coveredCount(input.coverage) - coveredCount(recommendedCoverage),
      pills:
        items.reduce((sum, item) => sum + item.dailyPills, 0) -
        recommended.reduce((sum, item) => sum + item.dailyPills, 0),
      products: items.length - recommended.length
    },
    equivalent,
    firstOrderSubtotalMinor,
    otherCustomerCostMinor,
    savingClaim,
    savings90DayMinor: eligibleSaving ? savings90DayMinor : null,
    savings90DayPercent:
      !eligibleSaving || baselineCash90 === 0 || savings90DayMinor == null
        ? null
        : savings90DayMinor / baselineCash90,
    shippingMinor
  };
}
