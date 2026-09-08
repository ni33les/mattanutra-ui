import { formatNutrientMessage } from "@/lib/agentic/presentation/amount";
import { assessedSafetyCodes } from "@/lib/agentic/plan/safety";
import { routineTradeoff } from "@/lib/agentic/value/routine-tradeoff";
import { adviceKind } from "@/lib/agentic/value/advice-kind";
import { assessPreferences, verifiedPillLowerBound, type NumericPreferences } from "@/lib/matcher/preferences";
import { parseProductAdministration } from "@/lib/product-administration";
import { planOperationalContext } from "@/lib/agentic/value/operational-decision";
import { requestedTargetCoverage } from "@/lib/agentic/value/coverage-summary";
import { AGENTIC_CONTRACT_VERSION } from "@/lib/agentic/config";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import { payableSnapshot } from "@/lib/agentic/money";
import { MATCHER_VERSION } from "@/lib/matcher/config";
import { buildCanonicalPlanStamp } from "@/lib/agentic/value/canonical-plan";
import { buildExplanation } from "@/lib/agentic/value/explanation";
import {
  buildCompactDecision,
  planClaimIds,
  planResearchVersion
} from "@/lib/agentic/value/compact-decision";
import { selectCoverageClaimIds } from "@/lib/agentic/claims/select";
import { mergeBySemanticKey } from "@/lib/agentic/plan/merge";
import { planCompactApplicable } from "@/lib/agentic/contract/plan-result";
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

function compactPublic(
  value: unknown,
  stripEmptyArrays: boolean
): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => compactPublic(item, stripEmptyArrays))
      .filter((item) => item !== undefined);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key === "snapshotId") {
      continue;
    }
    if (key === "administration" || key === "labelledFacts" || key === "originalRequest" || key === "preferenceAssessment" || key === "matchingDiagnostics" || key === "matchingExplanation") { out[key] = nested; continue; }
    if (nested == null) {
      if (nested === null && ["highlightedAlternativeOptionId", "administration", "pills", "dailyPills", "pillsPerServing", "totalDailyPills", "pillDelta", "dailyPillsDelta", "dailyCostMinor", "supplyDays", "totalExposureAmount", "supplementId", "exposure", "threshold", "nextReplenishmentDay", "cash30DayMinor", "cash90DayMinor", "cash90DayDeltaMinor"].includes(key)) out[key] = null;
      continue;
    }
    if (stripEmptyArrays && Array.isArray(nested) && nested.length === 0) {
      continue;
    }
    const compacted = compactPublic(nested, stripEmptyArrays);
    if (compacted == null) {
      continue;
    }
    if (stripEmptyArrays && Array.isArray(compacted) && compacted.length === 0) {
      continue;
    }
    out[key === "catalogueSnapshotId" ? "catalogId" : key] = compacted;
  }
  return out;
}

function publicCanonicalStamp(stamp: ReturnType<typeof buildCanonicalPlanStamp>) {
  const snapshotId = stamp.snapshotId;
  const published = { ...stamp } as Record<string, unknown>;
  delete published.snapshotId;
  Object.defineProperty(published, "snapshotId", {
    configurable: true,
    enumerable: false,
    value: snapshotId,
    writable: false
  });
  return published;
}

export type PublicBasketNutrient = Readonly<{
  amount: number;
  name: string;
  unit: string;
}>;

export type PublicBasketItem = Readonly<{
  availableServings?: number | null;
  currency: string;
  dailyPills: number | null;
  administration?: BasketItem["administration"];
  labelledFacts?: BasketItem["labelledFacts"];
  pillCountKnown?: boolean;
  daysOfSupply?: number | null;
  fixture?: true;
  form: string;
  imageUrl?: string;
  incidentalNutrientNames?: readonly string[];
  incidentalNutrients?: readonly PublicBasketNutrient[];
  leftoverServings30?: number | null;
  leftoverServings90?: number | null;
  lineTotalMinor: number;
  pillsPerServing: number | null;
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


type RequestedTargets = Readonly<{
  nameById: ReadonlyMap<string, string>;
  names: ReadonlySet<string>;
  supplementIds: ReadonlySet<string>;
}>;

type OptionReasonCode = "balanced" | "best_available" | "fewest_pills" | "highest_coverage" | "lowest_cost" | "no_distinct_alternative";

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

function defaultSelectionReason(
  contributions: readonly PositiveContribution[],
  locale: string
): SelectionReason {
  const requestedNames = contributions.map((item) => item.name);
  const requestedSupplementIds = contributions
    .map((item) => item.supplementId)
    .filter(Boolean);
  void locale;
  const first = contributions[0];
  const gap = contributions.find((item) => item.remainingGap > 0) ?? null;

  if (contributions.length === 0) {
    return {
      code: "best_available",
      message: agenticMessage("en", "plan.selection.in_selected_stack"),
      messageKey: "plan.selection.in_selected_stack",
      requestedNames: [],
      requestedSupplementIds: []
    };
  }

  if (contributions.length >= 2) {
    return {
      code: "consolidates_targets",
      message: agenticMessage("en", "plan.selection.consolidates_targets", {
        names: joinNames(requestedNames, "en")
      }),
      messageKey: "plan.selection.consolidates_targets",
      requestedNames,
      requestedSupplementIds
    };
  }

  if (gap) {
    return {
      code: "best_available_dose",
      message: agenticMessage("en", "plan.selection.best_available_dose", {
        amount: formatDose(first.amount),
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
    message: agenticMessage("en", "plan.selection.covers_target", {
      amount: formatDose(first.amount),
      name: first.name,
      unit: first.unit
    }),
    messageKey: "plan.selection.covers_target",
    requestedNames,
    requestedSupplementIds
  };
}

function hasKnownPillCount(item: { pillCountKnown?: boolean; dailyPills?: unknown; pillsPerServing?: unknown }) {
  return item.pillCountKnown !== false && typeof item.dailyPills === "number" &&
    Number.isFinite(item.dailyPills) && item.dailyPills >= 0 && item.pillsPerServing !== null;
}

function optionPillCountKnown(option: StackOption) {
  return option.basket.every(hasKnownPillCount);
}

function comparedPillDelta(option: StackOption, selected: StackOption | null) {
  return optionPillCountKnown(option) && (!selected || optionPillCountKnown(selected))
    ? selected ? option.dailyPills - selected.dailyPills : 0
    : null;
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
  const pillWinners = options.every(optionPillCountKnown)
    ? options.filter((item) => item.dailyPills === minPills)
    : [];

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
  if (option.reason === "Target-focused option with disclosed dose and product-data uncertainty") {
    return { code: "target_focused" as const, key: "plan.option.target_focused",
      message: agenticMessage(negotiated, "plan.option.target_focused") };
  }
  if (option.noDistinctAlternative) {
    return {
      code: "no_distinct_alternative" as const,
      key: "plan.option.no_distinct_alternative",
      message: agenticMessage(negotiated, "plan.option.no_distinct_alternative")
    };
  }
  if (option.roles?.includes("closest_dose")) {
    return {
      code: "closest_dose" as const,
      key: "plan.option.closest_dose",
      message: agenticMessage(negotiated, "plan.option.closest_dose")
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
  const generatedReason = defaultSelectionReason(contributions, locale);
  const existingReason = item.selectionReason;
  const generatedNames = generatedReason.requestedNames ?? [];
  const requestedNames =
    generatedNames.length > 0 ? generatedNames : requestedNutrientNames;
  const requestedSupplementIds =
    generatedReason.requestedSupplementIds.length > 0
      ? generatedReason.requestedSupplementIds
      : existingReason?.requestedSupplementIds ?? [];
  const selectionReason: SelectionReason = {
    code: generatedReason.code,
    message: generatedReason.message,
    messageKey: generatedReason.messageKey,
    requestedNames,
    requestedSupplementIds
  };

  return {
    currency: item.currency,
    dailyPills: item.pillCountKnown === false ? null : item.dailyPills,
    administration: item.administration ?? null,
    ...(item.labelledFacts ? { labelledFacts: item.labelledFacts } : {}),
    pillCountKnown: item.pillCountKnown !== false,
    daysOfSupply,
    form: item.form,
    lineTotalMinor: item.lineTotalMinor,
    pillsPerServing: item.pillCountKnown === false ? null : item.pillsPerServing,
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    selectionReason,
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
  const totalDailyPills = basket.every(hasKnownPillCount) ? basket.reduce((sum, item) => sum + item.dailyPills, 0) : null;
  const totalPriceMinor = basket.reduce((sum, item) => sum + (Number(item.lineTotalMinor) || 0), 0);
  const supplyDays = basket.reduce((min, item) => {
    const days = item.daysOfSupply;
    if (days == null || !Number.isFinite(days) || days <= 0) {
      return 0;
    }
    return days < min ? days : min;
  }, Number.POSITIVE_INFINITY);
  const safeSupply = Number.isFinite(supplyDays) && supplyDays > 0 ? supplyDays : null;
  const dailyCostMinor = safeSupply != null ? Math.round(totalPriceMinor / safeSupply) : null;

  return {
    currency,
    dailyCostMinor,
    productCount,
    supplyDays: safeSupply,
    totalDailyPills,
    totalPriceMinor
  };
}

export function publicCoverage(row: CoverageRow, locale = "en") {
  const reference = row as CoverageRow & { referenceConfidence?: "high" | "moderate" | "low"; basisRationale?: string };
  const claimIds = row.claimIds ?? selectCoverageClaimIds({ name: row.name });
  return {
    ...(reference.referenceConfidence ? { referenceConfidence: reference.referenceConfidence } : {}),
    ...(reference.basisRationale ? { basisRationale: reference.basisRationale } : {}),
    ...(reference.referenceConfidence && reference.referenceConfidence !== "high" ? { uncertainty: agenticMessage(negotiateLocale(locale), "guidance.reference_unverified_uncertainty") } : {}),
    basis: row.basis ?? "supplemental",
    coveragePercent: Math.max(0, Math.min(100, publicAmount(row.coveragePercent))),
    ...(row.requestedTargetId ? { requestedTargetId: row.requestedTargetId } : {}),
    ...(row.unresolved ? { unresolved: row.unresolved } : {}),
    currentAmount: publicAmount(row.currentAmount),
    deliveredAmount: publicAmount(row.deliveredAmount),
    name: row.name,
    remainingGap: publicAmount(row.remainingGap),
    excess: publicAmount(row.excess ?? Math.max(0, row.currentAmount + row.deliveredAmount - row.requestedAmount)),
    ...(row.withinAgreedRange != null ? { withinAgreedRange: row.withinAgreedRange } : {}),
    requestedAmount: publicAmount(row.requestedAmount),
    status: row.status,
    supplementId: row.unresolved ? null : row.supplementId,
    totalExposureAmount: row.totalExposureComplete === false ? null : publicAmount(row.totalExposureAmount),
    quantifiedExposureAmount: publicAmount(row.totalExposureAmount),
    totalExposureComplete: row.totalExposureComplete ?? true,
    intakeCertainty: row.intakeCertainty ?? "known",
    unit: row.unit,
    ...(claimIds.length > 0 ? { claimIds } : {}),
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
  const pillDelta = comparedPillDelta(option, selected);
  const productCountDelta = option.basket.length - selected.basket.length;
  const parts: Array<{ key: string; text: string }> = [];

  if (priceDeltaMinor !== 0) {
    const key = priceDeltaMinor > 0 ? "plan.tradeoff.price_up" : "plan.tradeoff.price_down";
    parts.push({
      key,
      text: agenticMessage(negotiated, key, { baht: formatBaht(priceDeltaMinor) })
    });
  }
  if (pillDelta != null && pillDelta !== 0) {
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

  if (pillDelta == null) {
    const key = "plan.tradeoff.pills_unknown";
    parts.push({ key, text: agenticMessage(negotiated, key) });
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
      pillDelta: comparedPillDelta(option, null),
      priceDeltaMinor: 0,
      productCountDelta: 0,
      summary: copy.summary,
      summaryKey: copy.summaryKey
    };
  }

  return {
    coverageDeltaPercent: option.coveragePercent - selected.coveragePercent,
    pillDelta: comparedPillDelta(option, selected),
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
  advertised: readonly StackOption[] = [],
  preferences: NumericPreferences = {}
) {
  const currency = option.basket[0]?.currency ?? "THB";
  const group = advertised.length > 0 ? advertised : selected ? [selected, option] : [option];
  const unique = group.filter(
    (item, index, list) => list.findIndex((row) => row.optionId === item.optionId) === index
  );
  const reason = optionReasonFields(option, locale, unique);
  const pillComparisonKnown = comparedPillDelta(option, selected) != null;
  const counts = requestedTargetCoverage(option.coverage);
  const preferenceAssessment = assessPreferences(preferences, { productCount: option.basket.length,
    dailyPillsLowerBound: verifiedPillLowerBound(option.basket),
    dailyPills: option.basket.some(item => item.pillCountKnown === false || item.dailyPills == null) ? null : option.dailyPills,
    firstOrderGoodsPriceMinor: option.basket.some(item => item.incompleteCommercialFacts) ? null : option.basket.reduce((sum, item) => sum + item.lineTotalMinor, 0), currency }, locale).filter(row => row.status !== "not_requested");
  return {
    ...(preferenceAssessment.length ? { preferenceAssessment } : {}),
    coveragePercent: option.coveragePercent,
    coverageSummary: { coveragePercent: counts.coveragePercent, fullyMetCount: counts.coveredCount, requestedCount: counts.requestedCount },
    ...(option.doseFit ? { doseFit: option.doseFit } : {}),
    coverage: option.coverage.map(row => publicCoverage(row, locale)),
    basket: option.basket.map(item => publicBasketItem(item, locale)),
    ...(option.safety ? { advice: option.safety.guidance.map(item => publicSafetyGuidance(item, "not_required", option.coverage.find(row => row.supplementId === item.supplementIds[0])?.requestedAmount)) } : {}),
    optionId: option.optionId,
    reason: option.basket.length > 0 && counts.coveragePercent === 0
      ? (locale === "th" ? "ตัวเลือกนี้ไม่ครอบคลุมสารอาหารตามเป้าหมายที่ขอ" : locale === "zh-CN" ? "此选项未覆盖所请求的营养目标。" : "This option does not cover the requested targets.")
      : reason.message,
    reasonCode: reason.code,
    reasonKey: reason.key,
    recommended: Boolean(option.recommended),
    selected: Boolean(selected && option.optionId === selected.optionId),
    stackSummary: stackSummaryFor(option.basket, currency),
    tradeOffs: publicTradeOffs(option, selected, locale),
    ...(option.role ? { role: option.role } : {}),
    roles: option.roles ?? (option.recommended ? ["closest_dose"] : []),
    purchaseEligible: option.purchaseEligible ?? option.basket.length > 0,
    ...(option.cash90DayMinor != null ? { cash90DayMinor: option.cash90DayMinor } : {}),
    ...(option.tradeOff ? { tradeOff: { ...option.tradeOff, dailyPillsDelta: pillComparisonKnown ? option.tradeOff.dailyPillsDelta : null } } : {}),
    ...(option.includedTargetIds ? { includedTargetIds: option.includedTargetIds } : {}),
    ...(option.omittedTargetIds ? { omittedTargetIds: option.omittedTargetIds } : {}),
    ...(option.deferredTargetIds ? { deferredTargetIds: option.deferredTargetIds } : {}),
    ...(option.retainedCurrent ? { retainedCurrent: option.retainedCurrent } : {}),
    ...(option.economics ? { economics: { ...option.economics,
      ...(option.economics.deltas ? { deltas: { ...option.economics.deltas,
        pills: pillComparisonKnown ? option.economics.deltas.pills : null } } : {})
    } } : {})
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
  acknowledgementStatus: "acknowledged" | "not_required" | "pending" = "not_required",
  requestedAmount?: number
) {
  void acknowledgementStatus;
  const reference = row as SafetyGuidance & { referenceConfidence?: "high" | "moderate" | "low"; basisRationale?: string };
  return {
    ...(reference.referenceConfidence ? { referenceConfidence: reference.referenceConfidence } : {}),
    ...(reference.basisRationale ? { basisRationale: reference.basisRationale } : {}),
    action: "review",
    ...(row.comparator ? { comparator: row.comparator } : {}),
    ...(row.authorityUrl ? { authorityUrl: row.authorityUrl } : {}),
    ...(row.evidence ? { evidence: row.evidence } : {}),
    ...(row.uncertainty ? { uncertainty: row.uncertainty } : {}),
    ...(row.uncertaintyCodes ? { uncertaintyCodes: row.uncertaintyCodes } : {}),
    ...(row.referenceBasis ? { referenceBasis: row.referenceBasis } : {}),
    acknowledgementStatus: "not_required",
    code: row.code,
    kind: adviceKind(row),
    guidanceId: row.guidanceId,
    message: row.code === "duplicate_or_overlap" || row.kind === "overlap" ? formatNutrientMessage(row.message, row.unit, requestedAmount) : row.message,
    messageKey: row.messageKey,
    ruleId: row.ruleId,
    rulesVersion: row.rulesVersion,
    severity: row.severity,
    ...(row.nutrientName ? { nutrientName: row.nutrientName } : {}),
    ...(row.unit ? { unit: row.unit } : {}),
    ...(row.sourceScope ? { sourceScope: row.sourceScope } : {}),
    exposure: row.exposure != null ? publicAmount(row.exposure) : null,
    threshold: row.threshold != null ? publicAmount(row.threshold) : null,
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
    const deliveredAmount = publicAmount(Number(row?.deliveredAmount ?? 0));
    const remainingGap = publicAmount(row?.remainingGap ?? Math.max(0, requestedAmount - deliveredAmount));
    if (remainingGap <= 0) {
      continue;
    }
    out.push({
      name: item.name,
      ...(item.note ? { note: item.note } : {}),
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
  Partial<
    Pick<
      PlanResult,
      | "breadth"
      | "claimIds"
      | "evidenceHandle"
      | "gapReview"
      | "horizon"
      | "leftovers"
      | "matchingDiagnostics"
      | "matcherTelemetry"
      | "researchVersion"
    >
  >) {
  const legacy = result as PlanResult;
  if (legacy.refreshRequired) result = { ...result, status: "needs_input", summary: "This saved plan needs a contract refresh. Revise with requestPatch={} and the current revision; existing health information is preserved.", questions: [] };
  const selected = result.selected;
  const guidanceIds = result.safetyGuidance.map((item) => item.guidanceId);
  const snapshot =
    "requestSnapshot" in result
      ? (result as PlanResult).requestSnapshot
      : null;
  const medicationCodes = snapshot?.medicationCodes ?? [];
  const conditionCodes = snapshot?.conditionCodes ?? [];
  const acknowledgementStatus = "not_required" as const;
  const requestedTargets = requestedTargetsFrom(snapshot);
  const alternatives = result.alternatives.filter((item) => {
    if (!selected) {
      return true;
    }

    const sameProducts =
      item.optionId === selected.optionId ||
      item.basket
        .map((row) => `${row.productId}:${row.servingsPerDay}:${row.quantity}`)
        .slice()
        .sort()
        .join("|") ===
        selected.basket
          .map((row) => `${row.productId}:${row.servingsPerDay}:${row.quantity}`)
          .slice()
          .sort()
          .join("|");

    return !sameProducts;
  });

  const locale = snapshot?.locale ?? "en";
  const leftovers = publicLeftovers(result.leftovers, result.coverage);
  const { assessedMedicationCodes, assessedConditionCodes } = assessedSafetyCodes({ medicationCodes, conditionCodes }, result.safetyGuidance);
  const unassessedMedicationCodes = medicationCodes.filter(code => !assessedMedicationCodes.includes(MEDICATION_ALIASES[code] ?? code));
  const unassessedConditionCodes = conditionCodes.filter(code => !assessedConditionCodes.includes(CONDITION_ALIASES[code] ?? code));
  const acknowledgedUnassessedMedicationCodes = [
    ...new Set(snapshot?.acknowledgedUnassessedMedicationCodes ?? [])
  ];
  const acknowledgedUnassessedConditionCodes = [
    ...new Set(snapshot?.acknowledgedUnassessedConditionCodes ?? [])
  ];
  const safetyScope =
    unassessedMedicationCodes.length > 0 || unassessedConditionCodes.length > 0 || result.safetyGuidance.some(item => item.code === "incomplete_information")
      ? "partial"
      : "complete";
  const currency = result.basket[0]?.currency ?? "THB";
  const horizonUnavailable = result.horizon?.complete === false || Boolean(result.horizon?.durationUnknown);
  const horizonUnavailableReason = result.horizon?.unavailableReasons?.[0]?.reasonCode ?? (result.horizon?.durationUnknown ? "current_inventory_duration_unknown" : "current_inventory_information_incomplete");
  const horizonReasons = [...(result.horizon?.unavailableReasons ?? []), ...(selected?.economics?.unavailableReasons ?? [])].filter((item, index, all) => all.findIndex(other => JSON.stringify(other) === JSON.stringify(item)) === index);
  const { decision, matchingExplanation, tooBroad } = planOperationalContext({ ...result, alternatives });
  if (decision.status !== result.status) result = { ...result, status: decision.status,
    summary: agenticMessage(negotiateLocale(locale), `plan.summary.${decision.status}`) };
  const quoteBasket =
    result.status === "no_purchase" || result.status === "processing"
      ? []
      : (selected?.basket ?? result.basket);
  const nextActions = [decision.nextAction];
  const subtotalMinor =
    result.status === "no_purchase" || result.status === "processing"
      ? 0
      : quoteBasket.reduce((sum, item) => sum + (Number(item.lineTotalMinor) || 0), 0);
  const payable = payableSnapshot({ subtotalMinor });
  const uniqueAlternatives = mergeBySemanticKey(
    alternatives.filter(
      (item, index, list) =>
        item.optionId !== selected?.optionId &&
        list.findIndex((row) => row.optionId === item.optionId) === index
    ),
    (item) => item.optionId
  );
  const advertisedOptions = [selected, ...uniqueAlternatives]
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const compactApplicable = planCompactApplicable(result.status);
  const compactDecision = compactApplicable ? buildCompactDecision(result, decision, matchingExplanation) : null;
  const claimIds = compactApplicable ? planClaimIds(result) : [];

  const preferenceAssessment = assessPreferences(snapshot?.requirements ?? {}, { productCount: selected?.basket.length ?? 0,
    dailyPillsLowerBound: verifiedPillLowerBound(selected?.basket ?? []),
    dailyPills: selected?.basket.some(item => item.pillCountKnown === false || item.dailyPills == null) ? null : selected?.dailyPills ?? 0,
    firstOrderGoodsPriceMinor: selected?.basket.some(item => item.incompleteCommercialFacts) ? null : selected?.basket.reduce((sum, item) => sum + item.lineTotalMinor, 0) ?? 0,
    currency }, locale).filter(row => row.status !== "not_requested");
  const payload = {
    ...(preferenceAssessment.length ? { preferenceAssessment } : {}),
    ...((result as PlanResult).matchingDiagnostics ? { matchingDiagnostics: (result as PlanResult).matchingDiagnostics } : {}),
    ...(matchingExplanation ? { matchingExplanation } : {}),
    ...(compactDecision
      ? {
          compactDecision,
          claimIds,
          researchVersion: result.researchVersion ?? planResearchVersion(),
          ...(result.evidenceHandle ? { evidenceHandle: result.evidenceHandle } : {})
        }
      : {}),
    ...(result.basket.length > 0
      ? {
          basket: result.basket.map((item) =>
            publicBasketItem(item, locale, requestedTargets, result.coverage)
          )
        }
      : {}),
    ...(result.coverage.length > 0
      ? { coverage: result.coverage.map(row => publicCoverage(row, locale)) }
      : {}),
    contractVersion: AGENTIC_CONTRACT_VERSION,
    ...(legacy.sourceContractVersion ? { sourceContractVersion: legacy.sourceContractVersion, refreshRequired: Boolean(legacy.refreshRequired) } : {}),
    operationalDecision: decision,
    ...((result as PlanResult).alternativeSearch ? { alternativeSearch: (result as PlanResult).alternativeSearch } : {}),
    ...((result as PlanResult).searchSummary ? { searchSummary: (result as PlanResult).searchSummary } : {}),
    ...(selected?.doseFit ? { doseFit: selected.doseFit } : {}),
    status: result.status,
    summary: matchingExplanation && result.status === "no_purchase" ? matchingExplanation.message : decision.nextAction === "review_options" ? agenticMessage(negotiateLocale(locale), "plan.summary.review_options") : [result.summary, result.status === "ready" ? routineTradeoff(selected, advertisedOptions, locale) : ""].filter(Boolean).join(" "),
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
          scheduleComplete: !horizonUnavailable,
          nextReplenishmentDay: horizonUnavailable
            ? null
            : result.horizon.nextReplenishmentDay,
          orderSchedule: horizonUnavailable
            ? {
                "30": {
                  available: false,
                  reasonCode: horizonUnavailableReason
                },
                "90": {
                  available: false,
                  reasonCode: horizonUnavailableReason
                }
              }
            : {
                "30": result.horizon.orders.filter((item) => item.day < 30),
                "90": result.horizon.orders.filter((item) => item.day < 90)
              },
          purchaseRequiredNow: result.horizon.purchaseRequiredNow,
          ...(result.horizon.reasonCode ? { reasonCode: result.horizon.reasonCode } : {}),
          cash30DayMinor: horizonUnavailable
            ? null
            : result.horizon.orders
                .filter((item) => item.day < 30)
                .reduce((sum, item) => sum + item.totalMinor, 0),
          cash90DayMinor: horizonUnavailable
            ? null
            : result.horizon.orders
                .filter((item) => item.day < 90)
                .reduce((sum, item) => sum + item.totalMinor, 0),
          cashComplete: horizonUnavailable
            ? false
            : (selected?.economics?.cashComplete ?? true),
          consumptionComplete: selected?.economics?.consumptionComplete ?? false,
          comparisonComplete: horizonUnavailable
            ? false
            : (selected?.economics?.comparisonComplete ?? false),
          ...(horizonUnavailable ||
          horizonReasons.length > 0
            ? {
                unavailableReasons:
                  horizonReasons.length ? horizonReasons :
                  [
                    {
                      dependentCapabilities: [
                        "inventory_depletion_date",
                        "future_order_schedule",
                        "delivered_cash",
                        "savings",
                        "comparison"
                      ],
                      dimension: "schedule",
                      missingFieldNames: ["daysRemaining"],
                      reasonCode: horizonUnavailableReason
                    }
                  ]
              }
            : {})
        }
      : {}),
    summaryKey: matchingExplanation && result.status === "no_purchase" ? matchingExplanation.messageKey : tooBroad ? "plan.summary.request_too_broad" : decision.nextAction === "review_options" ? "plan.summary.review_options" : `plan.summary.${result.status}`,
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
          stackSummary: stackSummaryFor(result.basket, currency)
        }
      : {}),
    acknowledgementStatus,
    ...(result.status !== "no_purchase" &&
    result.status !== "processing" &&
    quoteBasket.length > 0 &&
    subtotalMinor > 0
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
    ...(matchingExplanation && result.status === "no_purchase" ? {
      reason: matchingExplanation.message,
      reasonCode: matchingExplanation.reasonCode,
      reasonKey: matchingExplanation.messageKey
    } : {}),
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
            publicSafetyGuidance(item, acknowledgementStatus, result.coverage.find(row => row.supplementId === item.supplementIds[0])?.requestedAmount)
          )
        }
      : {}),
    ...(guidanceIds.length > 0 ? { guidanceIds } : {}),
    ...(advertisedOptions.length > 0
      ? {
          options: advertisedOptions.map((item) =>
            publicOption(item, selected, locale, advertisedOptions, snapshot?.requirements ?? {})
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
    canonical: publicCanonicalStamp(
      buildCanonicalPlanStamp({
        inventoryDays: (snapshot?.currentSupplements ?? [])
          .map((item) => item.daysRemaining)
          .filter((item): item is number => item != null),
        leftovers: result.leftovers ?? [],
        matcherVersion: selected?.matcherVersion ?? MATCHER_VERSION,
        nextReplenishmentDay: horizonUnavailable ? null : result.horizon?.nextReplenishmentDay ?? null,
        orders: horizonUnavailable ? [] : result.horizon?.orders ?? [],
        options: advertisedOptions,
        questions: result.questions ?? [],
        reasonCode: matchingExplanation && result.status === "no_purchase" ? matchingExplanation.reasonCode : result.horizon?.reasonCode ?? (tooBroad ? "request_too_broad" : null),
        safetyGuidance: result.safetyGuidance,
        selectedOptionId: selected?.optionId ?? null,
        snapshotId:
          selected?.snapshotId ??
          result.matcherTelemetry?.snapshotId ??
          result.horizon?.snapshotId ??
          (result as { snapshotId?: string }).snapshotId ??
          "",
        status: result.status
      })
    ),
    ...(result.status === "processing"
      ? { pollAfterSeconds: 1 }
      : {}),
    ...(legacy.refreshRequired ? { reasonCode: "contract_refresh_required", summaryKey: "plan.summary.contract_refresh_required" } : {})
  };

  const compacted = compactPublic(payload, result.status === "blocked") as typeof payload;
  const pin = (payload.canonical as { snapshotId?: string } | undefined)?.snapshotId;
  if (
    compacted &&
    typeof compacted === "object" &&
    "canonical" in compacted &&
    compacted.canonical &&
    typeof compacted.canonical === "object"
  ) {
    Object.defineProperty(compacted.canonical, "snapshotId", {
      configurable: true,
      enumerable: false,
      value: pin ?? "",
      writable: false
    });
  }
  return compacted;
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
    dailyPills: rawItems.every(item => item && typeof item === "object" && hasKnownPillCount(item)) ? record.dailyPills : null,
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
        ...(!hasKnownPillCount(row) ? { pillCountKnown: false } : typeof row.pillCountKnown === "boolean" ? { pillCountKnown: row.pillCountKnown } : {}),
        administration: parseProductAdministration(row.administration),
        ...(row.labelledFacts ? { labelledFacts: row.labelledFacts } : {}),
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
