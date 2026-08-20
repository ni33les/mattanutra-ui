import type {
  BasketItem,
  CoverageRow,
  PlanResult,
  SafetyGuidance,
  StackOption
} from "@/lib/agentic/plan/types";

export type PublicBasketItem = Readonly<{
  currency: "THB";
  dailyPills: number;
  form: string;
  lineTotalMinor: number;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceMinor: number;
}>;

export function publicBasketItem(item: BasketItem): PublicBasketItem {
  return {
    currency: "THB",
    dailyPills: item.dailyPills,
    form: item.form,
    lineTotalMinor: item.lineTotalMinor,
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    unitPriceMinor: item.unitPriceMinor
  };
}

export function publicCoverage(row: CoverageRow) {
  return {
    coveragePercent: row.coveragePercent,
    currentAmount: row.currentAmount,
    deliveredAmount: row.deliveredAmount,
    name: row.name,
    requestedAmount: row.requestedAmount,
    status: row.status,
    supplementId: row.supplementId,
    totalExposureAmount: row.totalExposureAmount,
    unit: row.unit,
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
    coverage: option.coverage.map(publicCoverage),
    coveragePercent: option.coveragePercent,
    dailyPills: option.dailyPills,
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
    severity: row.severity,
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
>) {
  const selected = result.selected;
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
          optionId: selected.optionId,
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
    ...(result.unmetRequirements.length > 0
      ? { unmetRequirements: result.unmetRequirements }
      : {}),
    ...(alternatives.length > 0
      ? {
          alternatives: alternatives.map((item) => publicOption(item, selected))
        }
      : {})
  };
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
        currency: "THB",
        dailyPills: Number(row.dailyPills) || 0,
        deliveryWindow: null,
        form: String(row.form ?? ""),
        incompleteCommercialFacts: false,
        lineTotalMinor: Number(row.lineTotalMinor) || 0,
        productId: String(row.productId ?? ""),
        productName: String(row.productName ?? ""),
        quantity: Number(row.quantity) || 1,
        retailerSku: "",
        sellerId: "",
        sellerName: "",
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
