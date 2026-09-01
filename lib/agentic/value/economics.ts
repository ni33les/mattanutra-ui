import { payableSnapshot } from "@/lib/agentic/money";
import type { CatalogueProduct, CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import type {
  BasketItem,
  CanonicalPlanState,
  CoverageRow,
  EconomicsBaselineLine,
  EconomicsLedger
} from "@/lib/agentic/plan/types";
import { productIsDedicatedForTarget } from "@/lib/matcher/candidates";
import { toMatcherProduct } from "@/lib/agentic/plan/to-matcher-product";
import { packsForHorizon } from "@/lib/agentic/value/horizon-cash";
import { actualDaysSupplied, servingsPerPackFromProduct } from "@/lib/agentic/value/pack-facts";

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
  return (
    item.unitPriceMinor *
    packsThroughHorizon({
      dailyServings: item.servingsPerDay,
      horizonDays,
      servingsPerPack: item.servingsPerPack
    })
  );
}

function lineConsumption(item: BasketItem, horizonDays: number) {
  if (item.servingsPerPack == null || item.servingsPerPack <= 0 || item.servingsPerDay <= 0) {
    return 0;
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
  const quantity = packsThroughHorizon({
    dailyServings,
    horizonDays: 90,
    servingsPerPack
  });

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

  const current = state.currentSupplements.find(
    (item) => item.supplementId === coverage.supplementId && item.productId
  );
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
  const product =
    (current?.productId
      ? snapshot.products.find((item) => item.productId === current.productId)
      : null) ?? dedicated;

  if (!product) {
    return null;
  }

  return baselineLineForProduct(product, 1);
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
  const productCash30 = items.reduce((sum, item) => sum + lineCash(item, 30), 0);
  const productCash90 = items.reduce((sum, item) => sum + lineCash(item, 90), 0);
  const consumption30DayMinor = items.reduce((sum, item) => sum + lineConsumption(item, 30), 0);
  const consumption90DayMinor = items.reduce((sum, item) => sum + lineConsumption(item, 90), 0);
  const addOn = items.length > 0 ? shippingMinor + otherCustomerCostMinor : 0;
  const cash30DayMinor = productCash30 + addOn;
  const cash90DayMinor = productCash90 + addOn;
  const baselineLines =
    baselineFromRequest(input.snapshot, input.state) ??
    input.coverage
      .filter(
        (row) =>
          row.status === "covered" ||
          row.status === "already_covered" ||
          row.status === "over_target"
      )
      .map((row) => dedicatedLine(input.snapshot, input.state, row))
      .filter((item): item is EconomicsBaselineLine => Boolean(item));
  const baselineSubtotal = baselineLines.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const baselinePayable = payableSnapshot({ subtotalMinor: baselineSubtotal });
  const baselineCash90 = baselineLines.length > 0 ? baselinePayable.totalPriceMinor : 0;
  const savings90DayMinor = baselineCash90 - cash90DayMinor;
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
  const savingClaim =
    equivalent && savings90DayMinor > 0 ? "positive" : savings90DayMinor < 0 ? "loss" : "none";

  return {
    baseline: {
      cash90DayMinor: baselineCash90,
      lines: baselineLines,
      type: input.state.baseline?.type ?? "separate_direct_products"
    },
    cash30DayMinor,
    cash90DayMinor,
    cashTotalMinor: items.length > 0 ? payable.totalPriceMinor : 0,
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
    savings90DayMinor,
    savings90DayPercent: baselineCash90 === 0 ? null : savings90DayMinor / baselineCash90,
    shippingMinor
  };
}
