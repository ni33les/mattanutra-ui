import { AGENTIC_POLL_AFTER_SECONDS } from "@/lib/agentic/config";
import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import {
  CONDITION_ALIASES,
  MEDICATION_ALIASES
} from "@/lib/agentic/catalogue/names";
import type {
  BasketItem,
  CoverageContributor,
  CoverageRow,
  PlanResult,
  SafetyGuidance,
  SelectionReason,
  StackOption
} from "@/lib/agentic/plan/types";

export const PUBLIC_NUTRIENT_NAME_LIMIT = 12;

export type PublicBasketNutrient = Readonly<{
  amount: number;
  name: string;
  unit: string;
}>;

export type PublicBasketItem = Readonly<{
  currency: string;
  dailyPills: number;
  daysOfSupply?: number | null;
  fixture?: true;
  form: string;
  imageUrl?: string;
  incidentalNutrientNames: readonly string[];
  incidentalNutrients: readonly PublicBasketNutrient[];
  lineTotalMinor: number;
  pillsPerServing: number;
  productId: string;
  productName: string;
  quantity: number;
  requestedNutrientNames: readonly string[];
  requestedNutrients?: readonly PublicBasketNutrient[];
  selectionReason?: SelectionReason;
  servingsPerDay: number;
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
    out.push({ amount, name, unit });

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
  "fewest_pills",
  "highest_coverage",
  "lowest_cost"
] as const;

function defaultSelectionReason(item: BasketItem, locale: string): SelectionReason {
  const requestedNames = boundedNames(item.requestedNutrientNames);
  const requestedSupplementIds = item.contributionSupplementIds.filter((id) =>
    id.startsWith("sup_")
  );
  const negotiated = negotiateLocale(locale);
  const base = item.selectionReason ?? {
    code: "covers_target" as const,
    message: agenticMessage(negotiated, "plan.selection.covers_target"),
    messageKey: "plan.selection.covers_target",
    requestedSupplementIds
  };

  return {
    ...base,
    requestedNames: base.requestedNames ?? requestedNames,
    requestedSupplementIds: base.requestedSupplementIds.length
      ? base.requestedSupplementIds
      : requestedSupplementIds
  };
}

function optionReasonFields(option: StackOption, locale: string) {
  const negotiated = negotiateLocale(locale);
  for (const code of OPTION_REASON_CODES) {
    const key = `plan.option.${code}`;
    const message = agenticMessage(negotiated, key);
    if (option.reason === message || option.reason === key) {
      return { code, key, message };
    }
  }

  return {
    code: "fewest_pills" as const,
    key: "plan.option.fewest_pills",
    message:
      clientReason(option.reason) ||
      agenticMessage(negotiateLocale(locale), "plan.option.fewest_pills")
  };
}

export function publicBasketItem(item: BasketItem, locale = "en"): PublicBasketItem {
  const imageUrl = item.imageUrl?.trim() || null;
  const daysOfSupply = item.daysOfSupply ?? 30;

  return {
    currency: item.currency,
    dailyPills: item.dailyPills,
    daysOfSupply,
    form: item.form,
    incidentalNutrientNames: boundedNames(item.incidentalNutrientNames),
    incidentalNutrients: boundedNutrients(item.incidentalNutrients),
    lineTotalMinor: item.lineTotalMinor,
    pillsPerServing: item.pillsPerServing,
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    requestedNutrientNames: boundedNames(item.requestedNutrientNames),
    ...(item.requestedNutrients && item.requestedNutrients.length > 0
      ? { requestedNutrients: boundedNutrients(item.requestedNutrients) }
      : {}),
    selectionReason: defaultSelectionReason(item, locale),
    servingsPerDay: item.servingsPerDay,
    unitPriceMinor: item.unitPriceMinor,
    ...(imageUrl ? { imageUrl } : {}),
    ...(item.fixture || item.source === "fixture"
      ? { fixture: true as const, source: "fixture" as const }
      : {})
  };
}

export function stackSummaryFor(basket: readonly BasketItem[], currency: string) {
  const productCount = basket.length;
  const totalDailyPills = basket.reduce((sum, item) => sum + (Number(item.dailyPills) || 0), 0);
  const totalPriceMinor = basket.reduce((sum, item) => sum + (Number(item.lineTotalMinor) || 0), 0);
  const supplyDays = basket.reduce((min, item) => {
    const days = Number(item.daysOfSupply ?? 30);
    return days > 0 && days < min ? days : min;
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
    coveragePercent: row.coveragePercent,
    currentAmount: row.currentAmount,
    deliveredAmount: row.deliveredAmount,
    name: row.name,
    remainingGap: row.remainingGap,
    requestedAmount: row.requestedAmount,
    status: row.status,
    supplementId: row.supplementId,
    totalExposureAmount: row.totalExposureAmount,
    unit: row.unit,
    ...(row.contributors && row.contributors.length > 0
      ? {
          contributors: row.contributors.map(publicContributor)
        }
      : {}),
    ...(row.upperLimitAmount != null
      ? {
          percentOfUpperLimit: row.percentOfUpperLimit,
          upperLimitAmount: row.upperLimitAmount
        }
      : {})
  };
}

const INTERNAL_TRADEOFF =
  /\b(beam|snapshot|tie[-\s]?break|catalogueVersion|guidanceRulesVersion|optimizationEvidence)\b/i;

function clientTradeOffSummary(
  option: StackOption,
  selected: StackOption | null,
  parts: readonly string[]
) {
  if (parts.length > 0) {
    return parts.join("; ");
  }

  if (!selected || option.optionId === selected.optionId) {
    return "Selected stack";
  }

  return "No material difference versus the selected stack";
}

function clientReason(reason: string) {
  if (!reason.trim() || INTERNAL_TRADEOFF.test(reason)) {
    return "Selected stack";
  }

  return reason;
}

export function publicTradeOffs(
  option: StackOption,
  selected: StackOption | null
) {
  const productCount = option.basket.length;

  if (!selected) {
    return {
      coverageDeltaPercent: 0,
      pillDelta: 0,
      priceDeltaMinor: 0,
      productCountDelta: 0,
      summary: clientTradeOffSummary(option, null, [])
    };
  }

  const priceDeltaMinor = option.totalPriceMinor - selected.totalPriceMinor;
  const coverageDeltaPercent = option.coveragePercent - selected.coveragePercent;
  const pillDelta = option.dailyPills - selected.dailyPills;
  const productCountDelta = productCount - selected.basket.length;
  const parts: string[] = [];

  if (priceDeltaMinor !== 0) {
    parts.push(`${priceDeltaMinor > 0 ? "+" : ""}${priceDeltaMinor} satang`);
  }
  if (coverageDeltaPercent !== 0) {
    parts.push(`${coverageDeltaPercent > 0 ? "+" : ""}${coverageDeltaPercent}% coverage`);
  }
  if (pillDelta !== 0) {
    parts.push(`${pillDelta > 0 ? "+" : ""}${pillDelta} pills`);
  }
  if (productCountDelta !== 0) {
    parts.push(`${productCountDelta > 0 ? "+" : ""}${productCountDelta} products`);
  }

  return {
    coverageDeltaPercent,
    pillDelta,
    priceDeltaMinor,
    productCountDelta,
    summary: clientTradeOffSummary(option, selected, parts)
  };
}

export function publicOption(
  option: StackOption,
  selected: StackOption | null,
  locale = "en"
) {
  const currency = option.basket[0]?.currency ?? "THB";
  const reason = optionReasonFields(option, locale);
  return {
    coveragePercent: option.coveragePercent,
    optionId: option.optionId,
    reason: reason.message,
    reasonCode: reason.code,
    reasonKey: reason.key,
    selected: Boolean(selected && option.optionId === selected.optionId),
    stackSummary: stackSummaryFor(option.basket, currency),
    tradeOffs: publicTradeOffs(option, selected)
  };
}

function publicContributor(item: CoverageContributor) {
  return {
    amount: item.amount,
    productName: item.productName,
    unit: item.unit,
    ...(item.productId ? { productId: item.productId } : {}),
    ...(item.source ? { source: item.source } : {})
  };
}

export function publicSafetyGuidance(row: SafetyGuidance) {
  return {
    action: row.action,
    code: row.code,
    guidanceId: row.guidanceId,
    message: row.message,
    messageKey: row.messageKey,
    requiresSafetyAcknowledgement: row.action === "acknowledge" || row.action === "block",
    ruleId: row.ruleId,
    rulesVersion: row.rulesVersion,
    severity: row.severity,
    ...(row.nutrientName ? { nutrientName: row.nutrientName } : {}),
    ...(row.unit ? { unit: row.unit } : {}),
    ...(row.sourceScope ? { sourceScope: row.sourceScope } : {}),
    ...(row.exposure != null ? { exposure: row.exposure } : {}),
    ...(row.threshold != null ? { threshold: row.threshold } : {}),
    ...(row.productIds.length > 0 ? { productIds: row.productIds } : {}),
    ...(row.supplementIds.length > 0 ? { supplementIds: row.supplementIds } : {}),
    contributors: row.contributors.map(publicContributor)
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
    questionId: question.questionId
  }));
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
  Partial<Pick<PlanResult, "leftovers" | "matcherTelemetry">>) {
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
  const requiresSafetyAcknowledgement = acknowledgementStatus === "pending";
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
  const assessedMedicationCodes = [
    ...new Set(medicationCodes.map((code) => MEDICATION_ALIASES[code]).filter(Boolean) as string[])
  ];
  const unassessedMedicationCodes = medicationCodes.filter((code) => !MEDICATION_ALIASES[code]);
  const assessedConditionCodes = [
    ...new Set(conditionCodes.map((code) => CONDITION_ALIASES[code]).filter(Boolean) as string[])
  ];
  const unassessedConditionCodes = conditionCodes.filter((code) => !CONDITION_ALIASES[code]);
  const acknowledgedUnassessed = [
    ...new Set([
      ...(snapshot?.acknowledgedUnassessedMedicationCodes ?? []),
      ...(snapshot?.acknowledgedUnassessedConditionCodes ?? [])
    ])
  ];
  const safetyScope =
    unassessedMedicationCodes.length > 0 || unassessedConditionCodes.length > 0
      ? "partial"
      : "complete";
  const nextActions =
    result.status === "processing"
      ? ["poll_plan"]
      : result.status === "needs_input"
        ? ["answer_questions"]
        : result.status === "ready"
          ? ["confirm_with_user"]
          : ["change_request"];
  const currency = result.basket[0]?.currency ?? "THB";

  return {
    ...(result.basket.length > 0
      ? { basket: result.basket.map((item) => publicBasketItem(item, locale)) }
      : {}),
    ...(result.coverage.length > 0
      ? { coverage: result.coverage.map(publicCoverage) }
      : {}),
    productCount: result.basket.length,
    status: result.status,
    summary: result.summary,
    summaryKey: `plan.summary.${result.status}`,
    locale,
    nextActions,
    safetyScope,
    assessedMedicationCodes,
    unassessedMedicationCodes,
    assessedConditionCodes,
    unassessedConditionCodes,
    ...(acknowledgedUnassessed.length > 0
      ? { acknowledgedUnassessed }
      : {}),
    ...(result.basket.length > 0 ? { stackSummary: stackSummaryFor(result.basket, currency) } : {}),
    acknowledgementStatus,
    ...(selected
      ? {
          optionId: selected.optionId,
          reason: optionReasonFields(selected, locale).message,
          reasonCode: optionReasonFields(selected, locale).code,
          reasonKey: optionReasonFields(selected, locale).key
        }
      : {}),
    ...(result.questions.length > 0
      ? { questions: publicQuestions(result.questions) }
      : {}),
    ...(result.safetyGuidance.length > 0
      ? { safetyGuidance: result.safetyGuidance.map(publicSafetyGuidance) }
      : {}),
    ...(guidanceIds.length > 0 ? { guidanceIds } : {}),
    ...(requiresSafetyAcknowledgement ? { requiresSafetyAcknowledgement: true } : {}),
    ...(selected || alternatives.length > 0
      ? {
          options: [selected, ...alternatives]
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
            .filter(
              (item, index, list) =>
                list.findIndex((row) => row.optionId === item.optionId) === index
            )
            .slice(0, 3)
            .map((item) => publicOption(item, selected, locale))
        }
      : {}),
    ...(result.leftovers && result.leftovers.length > 0
      ? { leftovers: result.leftovers }
      : {}),
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
  return items.map(publicBasketItem);
}

export function publicFrozenOrder(frozen: unknown) {
  if (!frozen || typeof frozen !== "object") {
    return frozen;
  }

  const record = frozen as Record<string, unknown>;
  const rawItems = Array.isArray(record.items) ? record.items : [];

  return {
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
    planRevision: record.planRevision,
    shippingMinor: record.shippingMinor,
    subtotalMinor: record.subtotalMinor,
    taxMinor: record.taxMinor,
    totalPriceMinor: record.totalPriceMinor
  };
}
