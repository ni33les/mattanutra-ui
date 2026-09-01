import { AGENTIC_POLL_AFTER_SECONDS } from "@/lib/agentic/config";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import { payableSnapshot } from "@/lib/agentic/money";
import { MATCHER_VERSION } from "@/lib/matcher/config";
import { buildCanonicalPlanStamp } from "@/lib/agentic/value/canonical-plan";
import { buildExplanation } from "@/lib/agentic/value/explanation";
import {
  CONDITION_ALIASES,
  MEDICATION_ALIASES
} from "@/lib/agentic/catalogue/names";
import type {
  BasketItem,
  CoverageContributor,
  CoverageRow,
  PlanLeftover,
  PlanResult,
  SafetyGuidance,
  SelectionReason,
  StackOption
} from "@/lib/agentic/plan/types";

export const PUBLIC_NUTRIENT_NAME_LIMIT = 8;

export type PublicBasketNutrient = Readonly<{
  amount: number;
  name: string;
  unit: string;
}>;

export type PublicBasketItem = Readonly<{
  availableServings?: number | null;
  currency: string;
  dailyPills: number;
  daysOfSupply?: number | null;
  fixture?: true;
  form: string;
  imageUrl?: string;
  incidentalNutrientNames?: readonly string[];
  incidentalNutrients?: readonly PublicBasketNutrient[];
  leftoverServings30?: number | null;
  leftoverServings90?: number | null;
  lineTotalMinor: number;
  pillsPerServing: number;
  productId: string;
  productName: string;
  quantity: number;
  replenishmentDay?: number | null;
  requestedNutrientNames?: readonly string[];
  requestedNutrients?: readonly PublicBasketNutrient[];
  selectionReason?: SelectionReason;
  servingsPerDay: number;
  servingsPerPack?: number | null;
  source?: "fixture" | "retail";
  unitPriceMinor: number;
}>;

function boundedNutrients(items: BasketItem["incidentalNutrients"] | undefined) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const out: PublicBasketNutrient[] = [];

  for (const item of items) {
    const name = String(item?.name ?? "").trim();
    const unit = String(item?.unit ?? "").trim();
    const amount = Number(item?.amount);

    if (!name || !unit || !Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    const key = name.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push({ amount: publicAmount(amount), name, unit });

    if (out.length >= PUBLIC_NUTRIENT_NAME_LIMIT) {
      break;
    }
  }

  return out;
}

function boundedNames(names: readonly string[] | undefined) {
  if (!Array.isArray(names) || names.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const out: string[] = [];

  for (const name of names) {
    const trimmed = String(name ?? "").trim();

    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(trimmed);

    if (out.length >= PUBLIC_NUTRIENT_NAME_LIMIT) {
      break;
    }
  }

  return out;
}

const OPTION_REASON_CODES = [
  "balanced",
  "best_available",
  "fewest_pills",
  "highest_coverage",
  "lowest_cost",
  "no_distinct_alternative"
] as const;

type RequestedTargets = Readonly<{
  nameById: ReadonlyMap<string, string>;
  names: ReadonlySet<string>;
  supplementIds: ReadonlySet<string>;
}>;

type OptionReasonCode = (typeof OPTION_REASON_CODES)[number];

function requestedTargetsFrom(
  snapshot: PlanResult["requestSnapshot"] | null | undefined
): RequestedTargets {
  const nameById = new Map<string, string>();
  const names = new Set<string>();
  const supplementIds = new Set<string>();

  for (const item of snapshot?.targets ?? []) {
    const id = String(item.supplementId ?? "").trim();
    const name = String(item.name ?? "").trim();
    if (name) {
      names.add(name.toLowerCase());
    }
    if (id) {
      supplementIds.add(id);
      if (name && !nameById.has(id)) {
        nameById.set(id, name);
      }
    }
  }

  return { nameById, names, supplementIds };
}

function incidentalNameSet(item: BasketItem) {
  return new Set(
    [
      ...boundedNames(item.incidentalNutrientNames),
      ...boundedNutrients(item.incidentalNutrients).map((row) => row.name)
    ].map((name) => name.toLowerCase())
  );
}

type PositiveContribution = Readonly<{
  amount: number;
  name: string;
  remainingGap: number;
  supplementId: string;
  unit: string;
}>;

function isRequestedTarget(row: CoverageRow, targets: RequestedTargets) {
  if (targets.supplementIds.size === 0 && targets.names.size === 0) {
    return true;
  }
  return (
    (row.supplementId && targets.supplementIds.has(row.supplementId)) ||
    targets.names.has(row.name.trim().toLowerCase())
  );
}

function positiveContributions(
  item: BasketItem,
  coverage: readonly CoverageRow[],
  targets: RequestedTargets
): PositiveContribution[] {
  const out: PositiveContribution[] = [];
  const seen = new Set<string>();
  for (const row of coverage) {
    if (!isRequestedTarget(row, targets)) {
      continue;
    }
    const hit = (row.contributors ?? []).find(
      (contributor) =>
        contributor.productId === item.productId &&
        Number(contributor.amount) > 0 &&
        String(contributor.unit || row.unit || "").length > 0
    );
    if (!hit) {
      continue;
    }
    const key = row.supplementId || row.name.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({
      amount: publicAmount(Number(hit.amount)),
      name: row.name,
      remainingGap: publicAmount(Number(row.remainingGap) || 0),
      supplementId: row.supplementId,
      unit: String(hit.unit || row.unit)
    });
  }
  return out;
}

function joinNames(names: readonly string[], locale: string) {
  if (names.length <= 1) {
    return names[0] ?? "";
  }

  const lead = names.slice(0, -1).join(", ");
  const last = names[names.length - 1] ?? "";
  if (locale === "th") {
    return `${lead} และ ${last}`;
  }
  if (locale === "zh-CN") {
    return names.join("、");
  }
  return `${lead} and ${last}`;
}

export function publicAmount(value: number) {
  if (!Number.isFinite(value)) {
    return value;
  }
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatDose(amount: number) {
  const rounded = publicAmount(amount);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function lineCoverage(
  item: BasketItem,
  coverage: readonly CoverageRow[],
  supplementId?: string
) {
  const rows = coverage.filter((row) =>
    supplementId ? row.supplementId === supplementId : true
  );
  for (const row of rows) {
    const hit = row.contributors?.find(
      (contributor) => contributor.productId === item.productId
    );
    if (hit) {
      return {
        amount: hit.amount,
        name: row.name,
        remainingGap: row.remainingGap,
        unit: hit.unit || row.unit
      };
    }
  }

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    amount: row.deliveredAmount,
    name: row.name,
    remainingGap: row.remainingGap,
    unit: row.unit
  };
}

function defaultSelectionReason(
  contributions: readonly PositiveContribution[],
  locale: string
): SelectionReason {
  const requestedNames = contributions.map((item) => item.name);
  const requestedSupplementIds = contributions
    .map((item) => item.supplementId)
    .filter(Boolean);
  const negotiated = negotiateLocale(locale);
  const first = contributions[0];
  const gap = contributions.find((item) => item.remainingGap > 0) ?? null;

  if (contributions.length === 0) {
    return {
      code: "best_available",
      message: agenticMessage(negotiated, "plan.selection.in_selected_stack"),
      messageKey: "plan.selection.in_selected_stack",
      requestedNames: [],
      requestedSupplementIds: []
    };
  }

  if (contributions.length >= 2) {
    return {
      code: "consolidates_targets",
      message: agenticMessage(negotiated, "plan.selection.consolidates_targets", {
        names: joinNames(requestedNames, negotiated)
      }),
      messageKey: "plan.selection.consolidates_targets",
      requestedNames,
      requestedSupplementIds
    };
  }

  if (gap) {
    return {
      code: "best_available_dose",
      message: agenticMessage(negotiated, "plan.selection.best_available_dose", {
        gap: formatDose(gap.remainingGap),
        name: first.name,
        unit: gap.unit
      }),
      messageKey: "plan.selection.best_available_dose",
      requestedNames,
      requestedSupplementIds
    };
  }

  return {
    code: "covers_target",
    message: agenticMessage(negotiated, "plan.selection.covers_target", {
      amount: formatDose(first.amount),
      name: first.name,
      unit: first.unit
    }),
    messageKey: "plan.selection.covers_target",
    requestedNames,
    requestedSupplementIds
  };
}

function truthfulReasonMap(options: readonly StackOption[]) {
  const assigned = new Map<string, OptionReasonCode>();
  if (options.length === 0) {
    return assigned;
  }

  const maxCoverage = Math.max(...options.map((item) => item.coveragePercent));
  const minCost = Math.min(...options.map((item) => item.totalPriceMinor));
  const minPills = Math.min(...options.map((item) => item.dailyPills));
  const coverageWinners = options.filter((item) => item.coveragePercent === maxCoverage);
  const costWinners = options.filter((item) => item.totalPriceMinor === minCost);
  const pillWinners = options.filter((item) => item.dailyPills === minPills);

  if (coverageWinners.length === 1) {
    assigned.set(coverageWinners[0]!.optionId, "highest_coverage");
  }
  if (costWinners.length === 1 && !assigned.has(costWinners[0]!.optionId)) {
    assigned.set(costWinners[0]!.optionId, "lowest_cost");
  }
  if (pillWinners.length === 1 && !assigned.has(pillWinners[0]!.optionId)) {
    assigned.set(pillWinners[0]!.optionId, "fewest_pills");
  }
  for (const option of options) {
    if (!assigned.has(option.optionId)) {
      assigned.set(option.optionId, "balanced");
    }
  }
  return assigned;
}

function optionReasonFields(
  option: StackOption,
  locale: string,
  advertised: readonly StackOption[] = []
) {
  const negotiated = negotiateLocale(locale);
  const group = advertised.length > 0 ? advertised : [option];
  if (option.noDistinctAlternative) {
    return {
      code: "no_distinct_alternative" as const,
      key: "plan.option.no_distinct_alternative",
      message: agenticMessage(negotiated, "plan.option.no_distinct_alternative")
    };
  }
  if (group.length < 2) {
    return {
      code: "best_available" as const,
      key: "plan.option.best_available",
      message: agenticMessage(negotiated, "plan.option.best_available")
    };
  }

  const code = truthfulReasonMap(group).get(option.optionId) ?? "balanced";
  const key = `plan.option.${code}`;
  return { code, key, message: agenticMessage(negotiated, key) };
}

export function publicBasketItem(
  item: BasketItem,
  locale = "en",
  targets: RequestedTargets = {
    nameById: new Map(),
    names: new Set(),
    supplementIds: new Set()
  },
  coverage: readonly CoverageRow[] = []
): PublicBasketItem {
  const imageUrl = item.imageUrl?.trim() || null;
  const daysOfSupply = item.daysOfSupply ?? null;
  const incidentalSourceNames =
    item.incidentalNutrientNames && item.incidentalNutrientNames.length > 0
      ? item.incidentalNutrientNames
      : (item.incidentalNutrients ?? []).map((row) => row.name);
  const incidentalNutrientNames = boundedNames(incidentalSourceNames);
  const contributions = positiveContributions(item, coverage, targets);
  const requestedNutrients =
    contributions.length > 0
      ? contributions.map((row) => ({
          amount: row.amount,
          name: row.name,
          unit: row.unit
        }))
      : (item.requestedNutrients ?? []).map((row) => ({
          amount: row.amount,
          name: row.name,
          unit: row.unit
        }));
  const requestedNutrientNames =
    requestedNutrients.length > 0
      ? requestedNutrients.map((row) => row.name)
      : Array.isArray(item.requestedNutrientNames)
        ? [...item.requestedNutrientNames]
        : [];

  return {
    currency: item.currency,
    dailyPills: item.dailyPills,
    daysOfSupply,
    form: item.form,
    lineTotalMinor: item.lineTotalMinor,
    pillsPerServing: item.pillsPerServing,
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    selectionReason: item.selectionReason ?? defaultSelectionReason(contributions, locale),
    servingsPerDay: item.servingsPerDay,
    unitPriceMinor: item.unitPriceMinor,
    ...(incidentalNutrientNames.length > 0 ? { incidentalNutrientNames } : {}),
    ...(incidentalSourceNames.length > incidentalNutrientNames.length
      ? {
          incidentalOmittedCount:
            incidentalSourceNames.length - incidentalNutrientNames.length
        }
      : {}),
    ...(requestedNutrientNames.length > 0 ? { requestedNutrientNames } : {}),
    ...(requestedNutrients.length > 0 ? { requestedNutrients } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(item.fixture || item.source === "fixture"
      ? { fixture: true as const, source: "fixture" as const }
      : {}),
    ...(item.servingsPerPack != null ? { servingsPerPack: item.servingsPerPack } : {}),
    ...(item.availableServings != null ? { availableServings: item.availableServings } : {}),
    ...(item.leftoverServings30 != null ? { leftoverServings30: item.leftoverServings30 } : {}),
    ...(item.leftoverServings90 != null ? { leftoverServings90: item.leftoverServings90 } : {}),
    ...(item.replenishmentDay != null ? { replenishmentDay: item.replenishmentDay } : {})
  };
}

export function stackSummaryFor(basket: readonly BasketItem[], currency: string) {
  const productCount = basket.length;
  const totalDailyPills = basket.reduce((sum, item) => sum + (Number(item.dailyPills) || 0), 0);
  const totalPriceMinor = basket.reduce((sum, item) => sum + (Number(item.lineTotalMinor) || 0), 0);
  const supplyDays = basket.reduce((min, item) => {
    const days = item.daysOfSupply;
    if (days == null || !Number.isFinite(days) || days <= 0) {
      return min;
    }
    return days < min ? days : min;
  }, Number.POSITIVE_INFINITY);
  const safeSupply = Number.isFinite(supplyDays) && supplyDays > 0 ? supplyDays : 0;
  const dailyCostMinor =
    safeSupply > 0 ? Math.round(totalPriceMinor / safeSupply) : 0;

  return {
    currency,
    dailyCostMinor,
    productCount,
    supplyDays: safeSupply,
    totalDailyPills,
    totalPriceMinor
  };
}

export function publicCoverage(row: CoverageRow) {
  return {
    coveragePercent: publicAmount(row.coveragePercent),
    currentAmount: publicAmount(row.currentAmount),
    deliveredAmount: publicAmount(row.deliveredAmount),
    name: row.name,
    remainingGap: publicAmount(row.remainingGap),
    requestedAmount: publicAmount(row.requestedAmount),
    status: row.status,
    supplementId: row.supplementId,
    totalExposureAmount: publicAmount(row.totalExposureAmount),
    unit: row.unit,
    ...(row.importance ? { importance: row.importance } : {}),
    ...(row.reasonCode ? { reasonCode: row.reasonCode } : {}),
    ...(row.nextAction ? { nextAction: row.nextAction } : {}),
    ...(row.contributors && row.contributors.length > 0
      ? {
          contributors: row.contributors.map(publicContributor)
        }
      : {}),
    ...(row.upperLimitAmount != null
      ? {
          upperLimitAmount: publicAmount(row.upperLimitAmount),
          ...(row.percentOfUpperLimit != null
            ? { percentOfUpperLimit: publicAmount(row.percentOfUpperLimit) }
            : {}),
          ...(row.sourceScope ? { sourceScope: row.sourceScope } : {}),
          ...(row.authorityUrl ? { authorityUrl: row.authorityUrl } : {}),
          ...(row.ruleId ? { ruleId: row.ruleId } : {}),
          ...(row.rulesVersion ? { rulesVersion: row.rulesVersion } : {}),
          ...(row.populationScope ? { populationScope: row.populationScope } : {}),
          ...(row.safetyLedgerVersion
            ? { safetyLedgerVersion: row.safetyLedgerVersion }
            : {})
        }
      : {})
  };
}

function formatBaht(minor: number) {
  const baht = Math.abs(minor) / 100;
  const raw = Number.isInteger(baht) ? String(baht) : baht.toFixed(2);
  const [whole, fraction] = raw.split(".");
  const grouped = (whole ?? raw).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

function tradeOffPresentation(
  option: StackOption,
  selected: StackOption | null,
  locale: string
) {
  const negotiated = negotiateLocale(locale);
  if (!selected || option.optionId === selected.optionId) {
    return {
      summary: agenticMessage(negotiated, "plan.tradeoff.selected"),
      summaryKey: "plan.tradeoff.selected"
    };
  }

  const priceDeltaMinor = option.totalPriceMinor - selected.totalPriceMinor;
  const coverageDeltaPercent = option.coveragePercent - selected.coveragePercent;
  const pillDelta = option.dailyPills - selected.dailyPills;
  const productCountDelta = option.basket.length - selected.basket.length;
  const parts: Array<{ key: string; text: string }> = [];

  if (priceDeltaMinor !== 0) {
    const key = priceDeltaMinor > 0 ? "plan.tradeoff.price_up" : "plan.tradeoff.price_down";
    parts.push({
      key,
      text: agenticMessage(negotiated, key, { baht: formatBaht(priceDeltaMinor) })
    });
  }
  if (pillDelta !== 0) {
    const count = Math.abs(pillDelta);
    const key =
      pillDelta > 0
        ? count === 1
          ? "plan.tradeoff.pills_up_one"
          : "plan.tradeoff.pills_up"
        : count === 1
          ? "plan.tradeoff.pills_down_one"
          : "plan.tradeoff.pills_down";
    parts.push({
      key,
      text: agenticMessage(negotiated, key, { count })
    });
  }
  if (coverageDeltaPercent !== 0) {
    const key =
      coverageDeltaPercent > 0 ? "plan.tradeoff.coverage_up" : "plan.tradeoff.coverage_down";
    parts.push({
      key,
      text: agenticMessage(negotiated, key, { percent: Math.abs(coverageDeltaPercent) })
    });
  }
  if (productCountDelta !== 0 && parts.length === 0) {
    const key =
      productCountDelta > 0 ? "plan.tradeoff.products_up" : "plan.tradeoff.products_down";
    parts.push({
      key,
      text: agenticMessage(negotiated, key, { count: Math.abs(productCountDelta) })
    });
  }

  if (parts.length === 0) {
    return {
      summary: agenticMessage(negotiated, "plan.tradeoff.same"),
      summaryKey: "plan.tradeoff.same"
    };
  }

  if (parts.length === 1) {
    return { summary: parts[0]!.text, summaryKey: parts[0]!.key };
  }

  const partsText = parts.map((item) => item.text).join("; ");
  return {
    summary: agenticMessage(negotiated, "plan.tradeoff.composed", { parts: partsText }),
    summaryKey: "plan.tradeoff.composed"
  };
}

export function publicTradeOffs(
  option: StackOption,
  selected: StackOption | null,
  locale = "en"
) {
  const productCount = option.basket.length;
  const copy = tradeOffPresentation(option, selected, locale);

  if (!selected) {
    return {
      coverageDeltaPercent: 0,
      pillDelta: 0,
      priceDeltaMinor: 0,
      productCountDelta: 0,
      summary: copy.summary,
      summaryKey: copy.summaryKey
    };
  }

  return {
    coverageDeltaPercent: option.coveragePercent - selected.coveragePercent,
    pillDelta: option.dailyPills - selected.dailyPills,
    priceDeltaMinor: option.totalPriceMinor - selected.totalPriceMinor,
    productCountDelta: productCount - selected.basket.length,
    summary: copy.summary,
    summaryKey: copy.summaryKey
  };
}

export function publicOption(
  option: StackOption,
  selected: StackOption | null,
  locale = "en",
  advertised: readonly StackOption[] = []
) {
  const currency = option.basket[0]?.currency ?? "THB";
  const group = advertised.length > 0 ? advertised : selected ? [selected, option] : [option];
  const unique = group.filter(
    (item, index, list) => list.findIndex((row) => row.optionId === item.optionId) === index
  );
  const reason = optionReasonFields(option, locale, unique);
  return {
    coveragePercent: option.coveragePercent,
    optionId: option.optionId,
    reason: reason.message,
    reasonCode: reason.code,
    reasonKey: reason.key,
    recommended: Boolean(option.recommended || (selected && option.optionId === selected.optionId)),
    selected: Boolean(selected && option.optionId === selected.optionId),
    stackSummary: stackSummaryFor(option.basket, currency),
    tradeOffs: publicTradeOffs(option, selected, locale),
    ...(option.role ? { role: option.role } : {}),
    ...(option.cash90DayMinor != null ? { cash90DayMinor: option.cash90DayMinor } : {}),
    ...(option.tradeOff ? { tradeOff: option.tradeOff } : {}),
    ...(option.includedTargetIds ? { includedTargetIds: option.includedTargetIds } : {}),
    ...(option.omittedTargetIds ? { omittedTargetIds: option.omittedTargetIds } : {}),
    ...(option.deferredTargetIds ? { deferredTargetIds: option.deferredTargetIds } : {}),
    ...(option.retainedCurrent ? { retainedCurrent: option.retainedCurrent } : {}),
    ...(option.economics ? { economics: option.economics } : {}),
    ...(option.burden ? { burden: option.burden } : {}),
    ...(option.coverage.length > 0 ? { coverage: option.coverage.map(publicCoverage) } : {}),
    ...(option.safety
      ? {
          safety: {
            assessedConditionCodes: option.safety.assessedConditionCodes,
            assessedMedicationCodes: option.safety.assessedMedicationCodes,
            guidance: option.safety.guidance.map((item) =>
              publicSafetyGuidance(item, "not_required")
            )
          }
        }
      : {}),
    productIds: option.basket.map((item) => item.productId)
  };
}

function publicContributor(item: CoverageContributor) {
  return {
    amount: publicAmount(item.amount),
    productName: item.productName,
    unit: item.unit,
    ...(item.productId ? { productId: item.productId } : {}),
    ...(item.source ? { source: item.source } : {})
  };
}

export function publicSafetyGuidance(
  row: SafetyGuidance,
  acknowledgementStatus: "acknowledged" | "not_required" | "pending" = "not_required"
) {
  const rowStatus =
    row.action === "block"
      ? "not_applicable"
      : row.action === "acknowledge"
        ? acknowledgementStatus === "acknowledged"
          ? "acknowledged"
          : "pending"
        : "not_required";
  return {
    action: row.action,
    acknowledgementStatus: rowStatus,
    code: row.code,
    guidanceId: row.guidanceId,
    message: row.message,
    messageKey: row.messageKey,
    ruleId: row.ruleId,
    rulesVersion: row.rulesVersion,
    severity: row.severity,
    ...(row.nutrientName ? { nutrientName: row.nutrientName } : {}),
    ...(row.unit ? { unit: row.unit } : {}),
    ...(row.sourceScope ? { sourceScope: row.sourceScope } : {}),
    ...(row.exposure != null ? { exposure: publicAmount(row.exposure) } : {}),
    ...(row.threshold != null ? { threshold: publicAmount(row.threshold) } : {}),
    ...(row.productIds.length > 0 ? { productIds: row.productIds } : {}),
    ...(row.supplementIds.length > 0 ? { supplementIds: row.supplementIds } : {}),
    ...(row.contributors.length > 0
      ? { contributors: row.contributors.map(publicContributor) }
      : {})
  };
}

export function publicQuestions(
  questions: PlanResult["questions"]
) {
  return questions.map((question) => ({
    choices: question.choices.map((choice) => ({
      choice: choice.choice,
      label: choice.label,
      labelKey: choice.labelKey ?? question.promptKey
    })),
    prompt: question.prompt,
    promptKey: question.promptKey,
    questionId: question.questionId,
    ...(question.targets && question.targets.length > 0
      ? { targets: question.targets }
      : {})
  }));
}

const PUBLIC_LEFTOVER_REASONS = new Set([
  "dose_gap",
  "not_in_catalogue",
  "uncovered",
  "unsupported_unit_conversion"
]);

function leftoverKey(item: Pick<PlanLeftover, "name" | "supplementId">) {
  return item.supplementId || item.name.trim().toLowerCase();
}

function coverageForLeftover(
  item: PlanLeftover,
  coverage: readonly CoverageRow[]
) {
  return coverage.find(
    (row) =>
      (item.supplementId && row.supplementId === item.supplementId) ||
      row.name.trim().toLowerCase() === item.name.trim().toLowerCase()
  );
}

function publicLeftovers(
  leftovers: readonly PlanLeftover[] | undefined,
  coverage: readonly CoverageRow[]
) {
  if (!leftovers || leftovers.length === 0) {
    return [];
  }

  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (const item of leftovers) {
    if (!PUBLIC_LEFTOVER_REASONS.has(item.reason)) {
      continue;
    }

    const key = leftoverKey(item);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    const row = coverageForLeftover(item, coverage);
    const unit = item.unit ?? row?.unit;
    if (!unit) {
      continue;
    }
    const requestedAmount = publicAmount(Number(row?.requestedAmount ?? item.amount ?? 0));
    const deliveredAmount = publicAmount(
      item.reason === "dose_gap" ? Number(row?.deliveredAmount ?? 0) : 0
    );
    const remainingGap = publicAmount(Math.max(0, requestedAmount - deliveredAmount));
    if (remainingGap <= 0) {
      continue;
    }
    out.push({
      name: item.name,
      reason: item.reason,
      unit,
      requestedAmount,
      deliveredAmount,
      remainingGap,
      ...(item.supplementId ? { supplementId: item.supplementId } : {})
    });
  }

  return out;
}

export function publicPlanFields(result: Pick<
  PlanResult,
  | "alternatives"
  | "basket"
  | "changeSummary"
  | "coverage"
  | "questions"
  | "safetyGuidance"
  | "selected"
  | "status"
  | "summary"
  | "unmetRequirements"
> &
  Partial<Pick<PlanResult, "breadth" | "gapReview" | "horizon" | "leftovers" | "matcherTelemetry">>) {
  const selected = result.selected;
  const guidanceIds = result.safetyGuidance.map((item) => item.guidanceId);
  const snapshot =
    "requestSnapshot" in result
      ? (result as PlanResult).requestSnapshot
      : null;
  const medicationCodes = snapshot?.medicationCodes ?? [];
  const conditionCodes = snapshot?.conditionCodes ?? [];
  const ackable = result.safetyGuidance.filter((item) => item.action === "acknowledge");
  const ackBound = snapshot?.safetyAcknowledgement;
  const acknowledgementStatus =
    ackable.length === 0
      ? "not_required"
      : ackBound?.confirmed === true &&
          ackable.every((item) => ackBound.guidanceIds.includes(item.guidanceId))
        ? "acknowledged"
        : "pending";
  const requestedTargets = requestedTargetsFrom(snapshot);
  const alternatives = result.alternatives.filter((item) => {
    if (!selected) {
      return true;
    }

    const sameProducts =
      item.optionId === selected.optionId ||
      item.basket
        .map((row) => row.productId)
        .slice()
        .sort()
        .join("|") ===
        selected.basket
          .map((row) => row.productId)
          .slice()
          .sort()
          .join("|");

    return !sameProducts;
  });

  const locale = snapshot?.locale ?? "en";
  const leftovers = publicLeftovers(result.leftovers, result.coverage);
  const assessedMedicationCodes = [
    ...new Set(medicationCodes.map((code) => MEDICATION_ALIASES[code]).filter(Boolean) as string[])
  ];
  const unassessedMedicationCodes = medicationCodes.filter((code) => !MEDICATION_ALIASES[code]);
  const assessedConditionCodes = [
    ...new Set(conditionCodes.map((code) => CONDITION_ALIASES[code]).filter(Boolean) as string[])
  ];
  const unassessedConditionCodes = conditionCodes.filter((code) => !CONDITION_ALIASES[code]);
  const acknowledgedUnassessedMedicationCodes = [
    ...new Set(snapshot?.acknowledgedUnassessedMedicationCodes ?? [])
  ];
  const acknowledgedUnassessedConditionCodes = [
    ...new Set(snapshot?.acknowledgedUnassessedConditionCodes ?? [])
  ];
  const safetyScope =
    unassessedMedicationCodes.length > 0 || unassessedConditionCodes.length > 0
      ? "partial"
      : "complete";
  const tooBroad = result.breadth?.reasonCode === "request_too_broad";
  const nextActions =
    result.status === "processing"
      ? ["poll_plan"]
      : tooBroad
        ? ["split_request"]
        : result.status === "needs_input"
          ? ["answer_questions"]
          : result.status === "ready"
            ? ["confirm_with_user"]
            : result.status === "no_purchase"
              ? result.horizon?.orders.some((item) => item.day > 0 && item.day < 90)
                ? ["replenish_later"]
                : []
              : ["change_request"];
  const currency = result.basket[0]?.currency ?? "THB";
  const subtotalMinor =
    selected?.totalPriceMinor ??
    result.basket.reduce((sum, item) => sum + (Number(item.lineTotalMinor) || 0), 0);
  const payable = payableSnapshot({ subtotalMinor });
  const advertisedOptions = [selected, ...alternatives]
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter(
      (item, index, list) => list.findIndex((row) => row.optionId === item.optionId) === index
    )
    .slice(0, 3);

  return {
    ...(result.basket.length > 0
      ? {
          basket: result.basket.map((item) =>
            publicBasketItem(item, locale, requestedTargets, result.coverage)
          )
        }
      : {}),
    ...(result.coverage.length > 0
      ? { coverage: result.coverage.map(publicCoverage) }
      : {}),
    status: result.status,
    summary: result.summary,
    ...(snapshot?.currentSupplements
      ? {
          comparisonBasis: {
            currentInventory: snapshot.currentSupplements.map((item) => ({
              daysRemaining: item.daysRemaining ?? null,
              productId: item.productId ?? null,
              supplementId: item.supplementId
            }))
          }
        }
      : {}),
    ...(result.horizon
      ? {
          nextReplenishmentDay: result.horizon.nextReplenishmentDay,
          orderSchedule: {
            "30": result.horizon.orders.filter((item) => item.day < 30),
            "90": result.horizon.orders.filter((item) => item.day < 90)
          },
          purchaseRequiredNow: result.horizon.purchaseRequiredNow,
          ...(result.horizon.reasonCode ? { reasonCode: result.horizon.reasonCode } : {}),
          cash30DayMinor: result.horizon.orders
            .filter((item) => item.day < 30)
            .reduce((sum, item) => sum + item.totalMinor, 0),
          cash90DayMinor: result.horizon.orders
            .filter((item) => item.day < 90)
            .reduce((sum, item) => sum + item.totalMinor, 0)
        }
      : {}),
    summaryKey: tooBroad ? "plan.summary.request_too_broad" : `plan.summary.${result.status}`,
    locale,
    nextActions,
    ...(tooBroad
      ? {
          reasonCode: "request_too_broad",
          maxTargetsPerRequest: result.breadth?.maxTargetsPerRequest ?? 10,
          suggestedGroups: result.breadth?.suggestedGroups ?? [],
          ...(result.breadth?.unsupportedTargets?.length
            ? { unsupportedTargets: result.breadth.unsupportedTargets }
            : {})
        }
      : {}),
    safetyScope,
    ...(assessedMedicationCodes.length > 0 ? { assessedMedicationCodes } : {}),
    ...(unassessedMedicationCodes.length > 0 ? { unassessedMedicationCodes } : {}),
    ...(assessedConditionCodes.length > 0 ? { assessedConditionCodes } : {}),
    ...(unassessedConditionCodes.length > 0 ? { unassessedConditionCodes } : {}),
    ...(medicationCodes.length > 0 ? { medicationCodes: [...medicationCodes] } : {}),
    ...(conditionCodes.length > 0 ? { conditionCodes: [...conditionCodes] } : {}),
    ...(acknowledgedUnassessedMedicationCodes.length > 0
      ? { acknowledgedUnassessedMedicationCodes }
      : {}),
    ...(acknowledgedUnassessedConditionCodes.length > 0
      ? { acknowledgedUnassessedConditionCodes }
      : {}),
    ...(result.basket.length > 0
      ? {
          stackSummary: {
            ...stackSummaryFor(result.basket, currency),
            ...(selected && Number.isFinite(selected.totalPriceMinor)
              ? { totalPriceMinor: selected.totalPriceMinor }
              : {})
          }
        }
      : {}),
    acknowledgementStatus,
    ...(result.status !== "processing" && (selected || result.basket.length > 0)
      ? {
          shippingMinor: payable.shippingMinor,
          estimatedOrderTotalMinor: payable.totalPriceMinor
        }
      : {}),
    ...(selected
      ? {
          optionId: selected.optionId,
          reason: optionReasonFields(selected, locale, advertisedOptions).message,
          reasonCode: optionReasonFields(selected, locale, advertisedOptions).code,
          reasonKey: optionReasonFields(selected, locale, advertisedOptions).key,
          tradeOffs: publicTradeOffs(selected, selected, locale)
        }
      : {}),
    ...(result.questions.length > 0
      ? { questions: publicQuestions(result.questions) }
      : {}),
    ...(result.gapReview?.targets?.length
      ? { gapReview: { targets: result.gapReview.targets } }
      : {}),
    ...(leftovers.length > 0 ? { leftovers } : {}),
    ...(result.safetyGuidance.length > 0
      ? {
          safetyGuidance: result.safetyGuidance.map((item) =>
            publicSafetyGuidance(item, acknowledgementStatus)
          )
        }
      : {}),
    ...(guidanceIds.length > 0 ? { guidanceIds } : {}),
    ...(advertisedOptions.length > 0
      ? {
          options: advertisedOptions.map((item) =>
            publicOption(item, selected, locale, advertisedOptions)
          )
        }
      : {}),
    ...(selected
      ? {
          explanation: buildExplanation({
            acknowledgementStatus,
            coverage: result.coverage,
            locale,
            nextActions,
            option: selected,
            status: result.status
          })
        }
      : {}),
    canonical: buildCanonicalPlanStamp({
      inventoryDays: (snapshot?.currentSupplements ?? [])
        .map((item) => item.daysRemaining)
        .filter((item): item is number => item != null),
      leftovers: result.leftovers ?? [],
      matcherVersion: selected?.matcherVersion ?? MATCHER_VERSION,
      nextReplenishmentDay: result.horizon?.nextReplenishmentDay ?? null,
      orders: result.horizon?.orders ?? [],
      options: advertisedOptions,
      questions: result.questions ?? [],
      reasonCode: result.horizon?.reasonCode ?? (tooBroad ? "request_too_broad" : null),
      safetyGuidance: result.safetyGuidance,
      selectedOptionId: selected?.optionId ?? null,
      snapshotId:
        selected?.snapshotId ??
        result.matcherTelemetry?.snapshotId ??
        result.horizon?.snapshotId ??
        (result as { snapshotId?: string }).snapshotId ??
        "",
      status: result.status
    }),
    ...(result.status === "processing"
      ? { pollAfterSeconds: AGENTIC_POLL_AFTER_SECONDS }
      : {})
  };
}

export function publicMatcherTelemetry(
  telemetry: PlanResult["matcherTelemetry"] | undefined
) {
  if (!telemetry) {
    return {};
  }

  const payload: Record<string, unknown> = {};

  if (telemetry.matcherVersion) {
    payload.matcherVersion = telemetry.matcherVersion;
  }
  if (telemetry.ackMs != null) {
    payload.ackMs = telemetry.ackMs;
  }
  if (telemetry.catalogueMs != null) {
    payload.catalogueMs = telemetry.catalogueMs;
  }
  if (telemetry.matchMs != null) {
    payload.matchMs = telemetry.matchMs;
  }
  if (telemetry.searchDeadlineMs != null) {
    payload.searchDeadlineMs = telemetry.searchDeadlineMs;
  }
  if (telemetry.searchMs != null) {
    payload.searchMs = telemetry.searchMs;
  }
  if (telemetry.serializeMs != null) {
    payload.serializeMs = telemetry.serializeMs;
  }
  if (telemetry.coveragePercent != null) {
    payload.coveragePercent = telemetry.coveragePercent;
  }
  if (telemetry.leftovers.length > 0) {
    payload.leftovers = telemetry.leftovers;
  }
  if (telemetry.productIds.length > 0) {
    payload.productIds = telemetry.productIds;
  }
  if (telemetry.requestedNames.length > 0) {
    payload.requestedNames = telemetry.requestedNames;
  }
  if (telemetry.selectedOptionId) {
    payload.selectedOptionId = telemetry.selectedOptionId;
  }
  if (telemetry.rejected && telemetry.rejected.total > 0) {
    payload.rejected = {
      counts: telemetry.rejected.counts,
      sample: telemetry.rejected.sample.map((item) => ({
        productId: item.productId,
        reason: item.reason,
        title: item.title
      })),
      total: telemetry.rejected.total
    };
  }
  if (telemetry.snapshotId) {
    payload.catalogId = telemetry.snapshotId;
  }
  if (telemetry.availabilityAsOf) {
    payload.availabilityAsOf = telemetry.availabilityAsOf;
  }
  if (telemetry.targetClassifications && telemetry.targetClassifications.length > 0) {
    payload.targetClassifications = telemetry.targetClassifications.map((item) => ({
      class: item.class,
      coveragePercent: item.coveragePercent,
      name: item.name
    }));
  }
  if (telemetry.targetSetHash) {
    payload.targetSetHash = telemetry.targetSetHash;
  }
  if (telemetry.factLedgerHash) {
    payload.factLedgerHash = telemetry.factLedgerHash;
  }
  if (telemetry.factLedger && telemetry.factLedger.length > 0) {
    payload.factLedger = telemetry.factLedger;
  }
  if (telemetry.targetFrontiers && telemetry.targetFrontiers.length > 0) {
    payload.targetFrontiers = telemetry.targetFrontiers;
  }
  if (telemetry.lossCertificates && telemetry.lossCertificates.length > 0) {
    payload.lossCertificates = telemetry.lossCertificates;
  }

  return Object.keys(payload).length > 0 ? { matcherTelemetry: payload } : {};
}

export function publicFrozenItems(items: readonly BasketItem[]) {
  return items.map((item) => publicBasketItem(item));
}

export function publicFrozenOrder(frozen: unknown) {
  if (!frozen || typeof frozen !== "object") {
    return frozen;
  }

  const record = frozen as Record<string, unknown>;
  const rawItems = Array.isArray(record.items) ? record.items : [];

  return {
    catalogueVersion: record.catalogueVersion,
    channel: record.channel === "agentic" ? "agentic" : record.channel === "web" ? "web" : record.channel,
    countryCode: record.countryCode,
    coveragePercent: record.coveragePercent,
    currency: record.currency,
    dailyPills: record.dailyPills,
    items: rawItems.map((item) => {
      if (!item || typeof item !== "object") {
        return item;
      }
      const row = item as BasketItem;
      return publicBasketItem({
        availabilityAsOf: "",
        contributionSupplementIds: [],
        currency: typeof row.currency === "string" && row.currency ? row.currency : "THB",
        dailyPills: Number(row.dailyPills) || 0,
        deliveryWindow: null,
        fixture: Boolean(row.fixture) || row.source === "fixture",
        form: String(row.form ?? ""),
        imageUrl: typeof row.imageUrl === "string" && row.imageUrl.trim() ? row.imageUrl : null,
        incidentalNutrientNames: Array.isArray(row.incidentalNutrientNames)
          ? row.incidentalNutrientNames.map(String)
          : [],
        incidentalNutrients: Array.isArray(row.incidentalNutrients)
          ? row.incidentalNutrients
          : [],
        incompleteCommercialFacts: false,
        lineTotalMinor: Number(row.lineTotalMinor) || 0,
        pillsPerServing: Number(row.pillsPerServing) || 0,
        productId: String(row.productId ?? ""),
        productName: String(row.productName ?? ""),
        quantity: Number(row.quantity) || 1,
        requestedNutrientNames: Array.isArray(row.requestedNutrientNames)
          ? row.requestedNutrientNames.map(String)
          : [],
        retailerSku: "",
        sellerId: "",
        sellerName: "",
        servingsPerDay: Number(row.servingsPerDay) || Number(row.quantity) || 1,
        source: row.source === "fixture" || Boolean(row.fixture) ? "fixture" : "retail",
        stockStatus: "in_stock",
        unitPriceMinor: Number(row.unitPriceMinor) || 0
      });
    }),
    market: record.market,
    planRevision: record.planRevision,
    safetyGuidanceIds: record.safetyGuidanceIds,
    selectedOptionId: record.selectedOptionId,
    shippingMinor: record.shippingMinor,
    snapshotId: record.snapshotId,
    subtotalMinor: record.subtotalMinor,
    taxMinor: record.taxMinor,
    totalPriceMinor: record.totalPriceMinor
  };
}
