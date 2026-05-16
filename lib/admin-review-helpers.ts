export type AdminReviewLocalizedText = Readonly<{
  en: string;
  th: string;
}>;

export function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function textArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function numberOrNull(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function localizedText(value: unknown) {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  const record = recordOrNull(value);

  if (!record) {
    return null;
  }

  return textOrNull(record.en) ?? textOrNull(record.th);
}

export function localizedReviewText(
  value: unknown
): AdminReviewLocalizedText | null {
  if (typeof value === "string") {
    const trimmed = value.trim();

    return trimmed ? { en: trimmed, th: trimmed } : null;
  }

  const record = recordOrNull(value);

  if (!record) {
    return null;
  }

  const en = textOrNull(record.en);
  const th = textOrNull(record.th);
  const fallback = en ?? th;

  return fallback ? { en: en ?? fallback, th: th ?? fallback } : null;
}

export function formatReviewDose(amount: number | null, unit: string | null) {
  if (amount === null) {
    return null;
  }

  const formatted = Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(2).replace(/\.?0+$/g, "");

  return `${formatted} ${unit ?? ""}`.trim();
}

export function preferredClientDoseUnit(
  suggestedUnit: string | null,
  fallbackUnit: string | null
) {
  if (
    suggestedUnit &&
    fallbackUnit &&
    !suggestedUnit.includes("/") &&
    fallbackUnit.toLowerCase().startsWith(`${suggestedUnit.toLowerCase()}/`)
  ) {
    return fallbackUnit;
  }

  return suggestedUnit ?? fallbackUnit;
}

export function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function supplementCategory(value: string | null | undefined) {
  if (
    !value ||
    [
      "Dose reduced",
      "Dose unverified",
      "Review required",
      "Unknown supplement",
      "ลดขนาดแล้ว",
      "ยังตรวจขนาดไม่ได้",
      "ต้องรีวิว",
      "อาหารเสริมใหม่"
    ].includes(value)
  ) {
    return "Admin review";
  }

  return value;
}

function localized(en: string) {
  return { en, th: en };
}

export function clientDoseText(amount: number | null, unit: string | null) {
  const dose = formatReviewDose(amount, unit);

  if (!dose) {
    throw new Error("Client dose is required");
  }

  return dose;
}

function ingredientMatchesReview(
  ingredient: Record<string, unknown>,
  input: {
    reviewId: string | null;
    reviewTaskId: string;
    supplementName: string;
  }
) {
  const safety = recordOrNull(ingredient.safety);
  const supplementName = localizedText(ingredient.supplement);

  return (
    safety?.reviewTaskId === input.reviewTaskId ||
    safety?.reviewId === input.reviewId ||
    (supplementName !== null &&
      normalizeName(supplementName) === normalizeName(input.supplementName))
  );
}

function approvedIngredientFromSuggestion(input: {
  aiSuggestion: Record<string, unknown> | null;
  clientDoseAmount: number | null;
  clientDoseUnit: string | null;
  reviewId: string | null;
  reviewTaskId: string;
  supplementName: string;
}) {
  const suggestion = input.aiSuggestion;

  if (!suggestion) {
    return null;
  }

  const suggestedStatus = textOrNull(suggestion.status);
  const suggestionSupplementText = localizedText(suggestion.supplement);
  const suggestedSupplement =
    recordOrNull(suggestion.supplement) ??
    localized(suggestionSupplementText ?? input.supplementName);

  return {
    ...suggestion,
    dailyDose: localized(
      clientDoseText(input.clientDoseAmount, input.clientDoseUnit)
    ),
    safety: {
      ...(recordOrNull(suggestion.safety) ?? {}),
      action: "human_review",
      message: localized("Approved by MattaNutra human review."),
      reviewId: input.reviewId ?? undefined,
      reviewTaskId: input.reviewTaskId,
      visibility: "visible"
    },
    status: suggestedStatus === "review" ? "add" : suggestedStatus ?? "add",
    supplement: suggestedSupplement
  };
}

function foodItemMatchesReview(
  item: Record<string, unknown>,
  input: {
    foodName: string;
    reviewId: string | null;
    reviewTaskId: string;
  }
) {
  const safety = recordOrNull(item.safety);
  const foodName = localizedText(item.food);

  return (
    safety?.reviewTaskId === input.reviewTaskId ||
    safety?.reviewId === input.reviewId ||
    (foodName !== null &&
      normalizeName(foodName) === normalizeName(input.foodName))
  );
}

function approvedFoodFromSuggestion(input: {
  aiSuggestion: Record<string, unknown> | null;
  foodFrequency?: AdminReviewLocalizedText | null;
  foodName: string;
  foodRationale?: AdminReviewLocalizedText | null;
  foodServing?: AdminReviewLocalizedText | null;
  reviewId: string | null;
  reviewTaskId: string;
}) {
  const suggestion = input.aiSuggestion;

  if (!suggestion) {
    return null;
  }

  const suggestedStatus = textOrNull(suggestion.status);
  const suggestionFoodText = localizedText(suggestion.food);
  const suggestedFood =
    recordOrNull(suggestion.food) ?? localized(suggestionFoodText ?? input.foodName);

  return {
    ...suggestion,
    ...(input.foodFrequency ? { frequency: input.foodFrequency } : {}),
    ...(input.foodRationale ? { rationale: input.foodRationale } : {}),
    ...(input.foodServing ? { serving: input.foodServing } : {}),
    food: suggestedFood,
    safety: {
      ...(recordOrNull(suggestion.safety) ?? {}),
      action: "human_review",
      message: localized("Approved by MattaNutra human review."),
      reviewId: input.reviewId ?? undefined,
      reviewTaskId: input.reviewTaskId,
      visibility: "visible"
    },
    status: suggestedStatus === "review" ? "add" : suggestedStatus ?? "add"
  };
}

export function applyReviewDecisionToFormulation(
  formulation: Record<string, unknown>,
  input: {
    aiSuggestion: Record<string, unknown> | null;
    clientDoseAmount: number | null;
    clientDoseUnit: string | null;
    decision: "approve" | "disapprove";
    reviewId: string | null;
    reviewTaskId: string;
    supplementName: string;
  }
) {
  const supplementBreakdown = Array.isArray(formulation.supplementBreakdown)
    ? formulation.supplementBreakdown
    : [];
  let changedCount = 0;
  let nextBreakdown = supplementBreakdown.flatMap((item) => {
    const ingredient = recordOrNull(item);

    if (!ingredient || !ingredientMatchesReview(ingredient, input)) {
      return [item];
    }

    changedCount += 1;

    if (input.decision === "disapprove") {
      return [];
    }

    return [
      {
        ...ingredient,
        dailyDose: localized(
          clientDoseText(input.clientDoseAmount, input.clientDoseUnit)
        ),
        safety: {
          ...(recordOrNull(ingredient.safety) ?? {}),
          action: "human_review",
          message: localized("Approved by MattaNutra human review."),
          reviewId: input.reviewId ?? undefined,
          reviewTaskId: input.reviewTaskId,
          visibility: "visible"
        },
        status: ingredient.status === "review" ? "add" : ingredient.status
      }
    ];
  });

  if (changedCount < 1) {
    if (input.decision === "approve") {
      const approvedIngredient = approvedIngredientFromSuggestion(input);

      if (!approvedIngredient) {
        throw new Error("Reviewed supplement was not found in formulation");
      }

      nextBreakdown = [...nextBreakdown, approvedIngredient];
    }

    changedCount = 1;
  }

  const summary = recordOrNull(formulation.safetySummary);
  const nextSummary = summary
    ? {
        ...summary,
        hiddenCount: Math.max(0, Number(summary.hiddenCount ?? 0) - changedCount),
        removedCount:
          input.decision === "disapprove"
            ? Number(summary.removedCount ?? 0) + changedCount
            : Number(summary.removedCount ?? 0),
        reviewCount: Math.max(0, Number(summary.reviewCount ?? 0) - changedCount)
      }
    : summary;

  return {
    ...formulation,
    safetySummary: nextSummary,
    supplementBreakdown: nextBreakdown
  };
}

export function applyReviewDecisionToFoodGuidance(
  foodGuidance: Record<string, unknown>,
  input: {
    aiSuggestion: Record<string, unknown> | null;
    decision: "approve" | "disapprove";
    foodFrequency?: AdminReviewLocalizedText | null;
    foodName: string;
    foodRationale?: AdminReviewLocalizedText | null;
    foodServing?: AdminReviewLocalizedText | null;
    reviewId: string | null;
    reviewTaskId: string;
  }
) {
  const guidanceItems = Array.isArray(foodGuidance.foodGuidance)
    ? foodGuidance.foodGuidance
    : [];
  let changedCount = 0;
  let nextGuidance = guidanceItems.flatMap((item) => {
    const foodItem = recordOrNull(item);

    if (!foodItem || !foodItemMatchesReview(foodItem, input)) {
      return [item];
    }

    changedCount += 1;

    if (input.decision === "disapprove") {
      return [];
    }

    return [
      {
        ...foodItem,
        ...(input.foodFrequency ? { frequency: input.foodFrequency } : {}),
        ...(input.foodRationale ? { rationale: input.foodRationale } : {}),
        ...(input.foodServing ? { serving: input.foodServing } : {}),
        safety: {
          ...(recordOrNull(foodItem.safety) ?? {}),
          action: "human_review",
          message: localized("Approved by MattaNutra human review."),
          reviewId: input.reviewId ?? undefined,
          reviewTaskId: input.reviewTaskId,
          visibility: "visible"
        },
        status: foodItem.status === "review" ? "add" : foodItem.status
      }
    ];
  });

  if (changedCount < 1) {
    if (input.decision === "approve") {
      const approvedFood = approvedFoodFromSuggestion(input);

      if (!approvedFood) {
        throw new Error("Reviewed food was not found in food guidance");
      }

      nextGuidance = [...nextGuidance, approvedFood];
    }

    changedCount = 1;
  }

  const summary = recordOrNull(foodGuidance.foodSafetySummary);
  const nextSummary = summary
    ? {
        ...summary,
        hiddenCount: Math.max(0, Number(summary.hiddenCount ?? 0) - changedCount),
        removedCount:
          input.decision === "disapprove"
            ? Number(summary.removedCount ?? 0) + changedCount
            : Number(summary.removedCount ?? 0),
        reviewCount: Math.max(0, Number(summary.reviewCount ?? 0) - changedCount)
      }
    : summary;

  return {
    ...foodGuidance,
    foodGuidance: nextGuidance,
    foodSafetySummary: nextSummary
  };
}
