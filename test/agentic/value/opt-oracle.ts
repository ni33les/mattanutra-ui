/** Independent OPT arithmetic. Do not import production matching or economics. */

import type { BasketItem, CoverageRow, StackOption } from "../../../lib/agentic/plan/types.ts";

const NON_PILL_FORM = /powder|liquid|sachet|oil|drops|\bml\b/i;
const COVERED = new Set(["already_covered", "covered", "over_target"]);

export type OracleBurden = Readonly<{
  administrationEvents: number;
  administrations: number;
  gummies: number;
  nonPillTotal: number;
  pills: number;
  productCount: number;
  softgels: number;
  tablets: number;
}>;

function coveredStatuses(coverage: readonly CoverageRow[]) {
  return coverage
    .filter((row) => COVERED.has(row.status))
    .map((row) => row.supplementId)
    .slice()
    .sort();
}

export function oracleOptionSignature(option: StackOption) {
  const products = option.basket
    .map((item) => `${item.productId}:${item.servingsPerDay}:${item.quantity}`)
    .slice()
    .sort()
    .join("|");
  const targets = option.coverage
    .map((row) => `${row.supplementId}:${row.status}`)
    .slice()
    .sort()
    .join("|");
  return `${products}#${targets}`;
}

function formUnits(item: BasketItem) {
  return Math.max(item.dailyPills, item.servingsPerDay, 1);
}

export function oracleBurden(option: StackOption): OracleBurden {
  let administrations = 0;
  let gummies = 0;
  let pills = 0;
  let softgels = 0;
  let tablets = 0;

  for (const item of option.basket) {
    const form = item.form.toLowerCase();
    const units = formUnits(item);

    if (NON_PILL_FORM.test(form)) {
      administrations += Math.max(1, item.servingsPerDay);
      continue;
    }

    if (/softgel/.test(form)) {
      softgels += units;
      continue;
    }

    if (/tablet/.test(form)) {
      tablets += units;
      continue;
    }

    if (/gumm/.test(form)) {
      gummies += units;
      continue;
    }

    pills += units;
  }

  const retained = option.retainedCurrent?.length ?? 0;

  return {
    administrationEvents: administrations,
    administrations,
    gummies,
    nonPillTotal: administrations,
    pills: pills + softgels + tablets + gummies,
    productCount: option.basket.length + retained,
    softgels,
    tablets
  };
}

function cash90(option: StackOption) {
  return option.economics?.cash90DayMinor ?? option.cash90DayMinor ?? option.totalPriceMinor;
}

function incidentalCount(option: StackOption) {
  return option.basket.reduce(
    (sum, item) => sum + (item.incidentalNutrientNames?.length ?? 0),
    0
  );
}

function excessCount(option: StackOption) {
  return option.coverage.filter((row) => row.status === "over_target").length;
}

export function oracleDominates(left: StackOption, right: StackOption) {
  const leftBurden = oracleBurden(left);
  const rightBurden = oracleBurden(right);
  const leftCoverage = coveredStatuses(left.coverage).length;
  const rightCoverage = coveredStatuses(right.coverage).length;
  const dims = [
    rightCoverage - leftCoverage,
    cash90(left) - cash90(right),
    leftBurden.pills - rightBurden.pills,
    leftBurden.productCount - rightBurden.productCount,
    leftBurden.administrationEvents - rightBurden.administrationEvents,
    incidentalCount(left) - incidentalCount(right),
    excessCount(left) - excessCount(right)
  ];

  if (dims.some((delta) => delta > 0)) {
    return false;
  }

  return dims.some((delta) => delta < 0);
}

export function oracleHasDominatedPair(options: readonly StackOption[]) {
  for (const left of options) {
    for (const right of options) {
      if (left.optionId === right.optionId) {
        continue;
      }

      if (oracleDominates(left, right)) {
        return true;
      }
    }
  }

  return false;
}

// This fixture has point estimates. Derive proportional target loss directly
// from exposure and requested amount; do not call the production scorer.
function penalty(option: StackOption) {
  const target = option.coverage.filter(row => row.status !== "conditional_deferred")
    .reduce((total, row) => total + Math.abs(row.currentAmount + row.deliveredAmount - row.requestedAmount) / row.requestedAmount, 0);
  const limits = (option.doseFit?.perLimit ?? []).reduce((total, row) =>
    total + Math.max(0, (row.conservativeExposure - row.limit) / row.limit), 0);
  return target + 2 * limits;
}

export function oracleLabelRoles(options: readonly StackOption[]) {
  const firstOrderGoods = (option: StackOption) => option.basket.reduce((sum, row) => sum + row.unitPriceMinor * row.quantity, 0);
  // These fixtures explicitly request lowest_cost, with no numerical preferences
  // and verified administration. Recalculate its launch policy from basket facts.
  const practical = (option: StackOption) => penalty(option) + option.dailyPills / 60 + option.basket.length / 20 +
    firstOrderGoods(option) / 500000 + option.basket.reduce((sum, row) => sum + Math.max(0, row.servingsPerDay - 1) ** 2 / 20, 0);
  const stable = (a: StackOption, b: StackOption) => a.dailyPills - b.dailyPills || a.basket.length - b.basket.length ||
    firstOrderGoods(a) - firstOrderGoods(b) || oracleOptionSignature(a).localeCompare(oracleOptionSignature(b));
  const compareFit = (a: StackOption, b: StackOption) => penalty(a) - penalty(b) || stable(a, b);
  const comparePractical = (a: StackOption, b: StackOption) => practical(a) - practical(b) || compareFit(a, b);
  const requestedObjective = [...options].sort(comparePractical)[0] ?? null;
  const closest = [...options].sort(compareFit)[0];
  const eligible = options.filter(option => option.basket.length > 0 && option.purchaseEligible !== false);
  const lowerCost = [...eligible].sort((a, b) => firstOrderGoods(a) - firstOrderGoods(b) || comparePractical(a, b))[0];
  const simpler = [...eligible].sort((a, b) => a.basket.length - b.basket.length || a.dailyPills - b.dailyPills || comparePractical(a, b))[0];
  const concerns = (option: StackOption) => option.coverage.reduce((sum, row) =>
    sum + Math.max(0, (row.currentAmount + row.deliveredAmount - row.requestedAmount) / row.requestedAmount), 0) +
    (option.doseFit?.perLimit ?? []).reduce((sum, row) => sum + Math.max(0, row.conservativeExposure / row.limit - 1), 0);
  const fewerConcerns = requestedObjective ? [...eligible].sort(compareFit).find(option => concerns(option) < concerns(requestedObjective) &&
    requestedObjective.coverage.every(reference => (option.coverage.find(row => row.supplementId === reference.supplementId)?.coveragePercent ?? 0) >= reference.coveragePercent)) : undefined;
  const fallback = requestedObjective?.basket.length === 0 ? [...eligible].sort(compareFit)[0] : undefined;
  const rolesByOptionId = new Map<string, string[]>();
  for (const [option, role] of [[requestedObjective, "best_match"], [closest, "closest_dose"], [lowerCost, "lower_cost"], [simpler, "simpler"], [fewerConcerns, "fewer_concerns"], [fallback, "purchase_fallback"]] as const) {
    if (option) rolesByOptionId.set(option.optionId, [...(rolesByOptionId.get(option.optionId) ?? []), role]);
  }
  const byOptionId = new Map(options.map(option => [option.optionId,
    option.optionId === requestedObjective?.optionId ? "requested_objective" : rolesByOptionId.get(option.optionId)?.includes("fewer_concerns") ? "fewer_concerns" : "best_value"] as const));
  return { byOptionId, rolesByOptionId, noDistinctAlternative: options.length === 1, recommended: requestedObjective, requestedObjective };
}

export function oracleAcceptedTargetIds(coverage: readonly CoverageRow[]) {
  return new Set(
    coverage
      .filter((row) => row.status !== "conditional_deferred")
      .map((row) => row.supplementId)
  );
}

export function oracleProductServesAccepted(
  item: BasketItem,
  acceptedIds: ReadonlySet<string>
) {
  return item.contributionSupplementIds.some((id) => acceptedIds.has(id));
}
