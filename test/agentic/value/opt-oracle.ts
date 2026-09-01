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
    .map((item) => `${item.productId}:${item.quantity}`)
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

function coversAll(option: StackOption, subjectIds: readonly string[]) {
  const covered = new Set(coveredStatuses(option.coverage));
  return subjectIds.every((id) => covered.has(id));
}

function rankTuple(option: StackOption) {
  const burden = oracleBurden(option);
  const signature = option.basket
    .map((item) => item.productId)
    .slice()
    .sort()
    .join("|");

  return [
    cash90(option),
    burden.administrationEvents,
    burden.productCount,
    burden.pills,
    incidentalCount(option),
    excessCount(option),
    signature
  ] as const;
}

function betterRank(left: StackOption, right: StackOption) {
  const a = rankTuple(left);
  const b = rankTuple(right);

  for (let index = 0; index < a.length; index += 1) {
    const av = a[index]!;
    const bv = b[index]!;

    if (av < bv) {
      return true;
    }

    if (av > bv) {
      return false;
    }
  }

  return false;
}

function pickBest(options: readonly StackOption[]) {
  return options.reduce<StackOption | null>((best, item) => {
    if (!best || betterRank(item, best)) {
      return item;
    }

    return best;
  }, null);
}

export function oracleLabelRoles(options: readonly StackOption[]) {
  const sample = options[0];
  const coverage = sample?.coverage ?? [];
  const coreIds = coverage
    .filter((row) => row.importance === "core" || row.importance === "required")
    .map((row) => row.supplementId);
  const optionalIds = coverage
    .filter((row) => row.importance === "optional")
    .map((row) => row.supplementId);
  const satisfiedConditionalIds = coverage
    .filter(
      (row) =>
        row.importance === "conditional" && row.status !== "conditional_deferred"
    )
    .map((row) => row.supplementId);
  const corePool = options.filter((item) => coversAll(item, coreIds));
  const minimumCore = pickBest(corePool);
  const completeIds = [...coreIds, ...optionalIds, ...satisfiedConditionalIds];
  const completePool = options.filter(
    (item) =>
      coversAll(item, completeIds) &&
      (!minimumCore || item.optionId !== minimumCore.optionId)
  );
  const complete = pickBest(completePool);
  const bestValuePool = options.filter((item) => {
    if (!minimumCore || item.optionId === minimumCore.optionId) {
      return false;
    }

    if (complete && item.optionId === complete.optionId) {
      return false;
    }

    const addsOptional = optionalIds.some((id) =>
      coveredStatuses(item.coverage).includes(id)
    );
    const between =
      cash90(item) > cash90(minimumCore) &&
      (complete ? cash90(item) < cash90(complete) : true);

    return addsOptional && between && !oracleDominates(minimumCore, item);
  });
  const bestValue = pickBest(bestValuePool);
  const byOptionId = new Map<string, "best_value" | "complete" | "minimum_core">();

  if (minimumCore) {
    byOptionId.set(minimumCore.optionId, "minimum_core");
  }

  if (bestValue) {
    byOptionId.set(bestValue.optionId, "best_value");
  }

  if (complete) {
    byOptionId.set(complete.optionId, "complete");
  }

  return {
    bestValue,
    byOptionId,
    complete,
    minimumCore,
    noDistinctAlternative: options.length === 1,
    recommended: minimumCore
  };
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
