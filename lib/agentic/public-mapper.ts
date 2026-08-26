import type {
  BasketItem,
  CoverageRow,
  PlanResult,
  SafetyGuidance,
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

export function publicBasketItem(item: BasketItem): PublicBasketItem {
  const imageUrl = item.imageUrl?.trim() || null;

  return {
    currency: item.currency,
    dailyPills: item.dailyPills,
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
    servingsPerDay: item.servingsPerDay,
    unitPriceMinor: item.unitPriceMinor,
    ...(imageUrl ? { imageUrl } : {}),
    ...(item.fixture || item.source === "fixture"
      ? { fixture: true as const, source: "fixture" as const }
      : {})
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
          contributors: row.contributors.map((item) => ({
            amount: item.amount,
            productId: item.productId,
            productName: item.productName,
            unit: item.unit
          }))
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

export function publicOption(option: StackOption, selected: StackOption | null) {
  return {
    basket: option.basket.map(publicBasketItem),
    catalogId: option.snapshotId,
    coverage: option.coverage.map(publicCoverage),
    coveragePercent: option.coveragePercent,
    dailyPills: option.dailyPills,
    matcherVersion: option.matcherVersion,
    optionId: option.optionId,
    productCount: option.basket.length,
    reason: clientReason(option.reason),
    totalPriceMinor: option.totalPriceMinor,
    tradeOffs: publicTradeOffs(option, selected)
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
    severity: row.severity,
    ...(row.nutrientName ? { nutrientName: row.nutrientName } : {}),
    ...(row.unit ? { unit: row.unit } : {}),
    ...(row.sourceScope ? { sourceScope: row.sourceScope } : {}),
    ...(row.exposure != null ? { exposure: row.exposure } : {}),
    ...(row.threshold != null ? { threshold: row.threshold } : {}),
    ...(row.productIds.length > 0 ? { productIds: row.productIds } : {}),
    ...(row.supplementIds.length > 0 ? { supplementIds: row.supplementIds } : {})
  };
}

export function publicQuestions(
  questions: PlanResult["questions"]
) {
  return questions.map((question) => ({
    choices: question.choices.map((choice) => ({
      choice: choice.choice,
      label: choice.label
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
  const requiresSafetyAcknowledgement = result.safetyGuidance.some(
    (item) => item.action === "acknowledge" || item.action === "block"
  );
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

  return {
    ...(result.basket.length > 0
      ? { basket: result.basket.map(publicBasketItem) }
      : {}),
    ...(result.coverage.length > 0
      ? { coverage: result.coverage.map(publicCoverage) }
      : {}),
    productCount: result.basket.length,
    status: result.status,
    summary: result.summary,
    ...(selected
      ? {
          catalogId: selected.snapshotId,
          matcherVersion: selected.matcherVersion,
          optionId: selected.optionId,
          reason: clientReason(selected.reason),
          tradeOffs: publicTradeOffs(selected, selected)
        }
      : {}),
    ...(result.changeSummary.length > 0
      ? { changeSummary: result.changeSummary }
      : {}),
    ...(result.questions.length > 0
      ? { questions: publicQuestions(result.questions) }
      : {}),
    ...(result.safetyGuidance.length > 0
      ? { safetyGuidance: result.safetyGuidance.map(publicSafetyGuidance) }
      : {}),
    ...(guidanceIds.length > 0 ? { guidanceIds } : {}),
    ...(requiresSafetyAcknowledgement ? { requiresSafetyAcknowledgement: true } : {}),
    ...(medicationCodes.length > 0 ? { medicationCodes } : {}),
    ...(conditionCodes.length > 0 ? { conditionCodes } : {}),
    ...(result.unmetRequirements.length > 0
      ? { unmetRequirements: result.unmetRequirements }
      : {}),
    ...(alternatives.length > 0
      ? {
          alternatives: alternatives.map((item) => publicOption(item, selected))
        }
      : {}),
    ...(result.leftovers && result.leftovers.length > 0
      ? { leftovers: result.leftovers }
      : {}),
    ...publicMatcherTelemetry(result.matcherTelemetry)
  };
}

function publicMatcherTelemetry(
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
