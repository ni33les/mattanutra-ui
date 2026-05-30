import type {
  AdminReviewLocalizedText,
  AdminReviewTaskRow,
} from "@/lib/admin-review-queue";
import type { AdminFoodsData } from "@/lib/admin-foods";
import {
  adminLocalizedFoodText,
  adminLocalizedProductText,
  adminLocalizedSupplementText,
} from "@/lib/admin-localized-display";
import type { AdminProductsData } from "@/lib/admin-products";
import type {
  AdminSupplementRow,
  AdminSupplementsData,
} from "@/lib/admin-supplements";
import type { Locale } from "@/lib/i18n";
import type { AdminContent } from "@/components/admin/dashboard-content";
import { formatLocale } from "@/components/admin/dashboard-shared";

export type ReviewMetricFilter =
  | "reviewsFood"
  | "reviewsPlan"
  | "reviewsProduct"
  | "reviewsSupplement"
  | "reviewsTotal";

export type ReviewTaskGroup = Readonly<{
  businessValue: number;
  createdAt: string;
  key: string;
  planId: string | null;
  planReview: boolean;
  rows: AdminReviewTaskRow[];
  title: string;
}>;

export type FoodReviewDraftFields = Readonly<{
  frequency: AdminReviewLocalizedText | null;
  rationale: AdminReviewLocalizedText | null;
  serving: AdminReviewLocalizedText | null;
}>;

export type ProductImportFactDraft = {
  amount: string;
  confidence: "high" | "low" | "moderate";
  name: string;
  unit: string;
};

export function reviewDisplayName(
  row: AdminReviewTaskRow,
  locale: Locale,
  productsData: AdminProductsData,
  supplementsData: AdminSupplementsData,
  foodsData: AdminFoodsData,
) {
  const normalizedName = row.supplementName.trim().toLowerCase();

  if (row.itemType === "product") {
    const product = productsData.rows.find(
      (item) =>
        item.id === row.productImport?.productImportId ||
        item.productImportId === row.productImport?.productImportId ||
        item.title.trim().toLowerCase() === normalizedName,
    );

    if (product) {
      return adminLocalizedProductText(product, locale).title.value;
    }

    const translatedTitle =
      row.productImport?.translations?.[locale]?.title ??
      row.productImport?.translations?.en?.title;

    return translatedTitle?.trim() || row.supplementName;
  }

  if (row.itemType === "food") {
    const food = foodsData.rows.find(
      (item) =>
        item.name.trim().toLowerCase() === normalizedName ||
        item.aliases.some(
          (alias) => alias.trim().toLowerCase() === normalizedName,
        ),
    );

    return food
      ? adminLocalizedFoodText(food, locale).name.value
      : row.supplementName;
  }

  const supplement = supplementsData.rows.find(
    (item) =>
      item.name.trim().toLowerCase() === normalizedName ||
      item.aliases.some(
        (alias) => alias.name.trim().toLowerCase() === normalizedName,
      ),
  );

  return supplement
    ? adminLocalizedSupplementText(supplement, locale).name.value
    : row.supplementName;
}

export function reviewKindLabel(labels: AdminContent, row: AdminReviewTaskRow) {
  if (row.reviewKind === "dose_reduced") {
    return labels.reviewQueue.doseReduced;
  }

  if (
    row.reviewKind === "unknown_supplement" ||
    row.reviewKind === "unknown_food"
  ) {
    return labels.reviewQueue.unknown;
  }

  if (row.reviewKind === "condition_review") {
    return labels.reviewQueue.reviewRequired;
  }

  if (row.reviewKind === "dose_unverified") {
    return labels.reviewQueue.doseUnverified;
  }

  return labels.reviewQueue.reviewRequired;
}

export function isProductReviewRow(row: AdminReviewTaskRow) {
  return row.itemType === "product" || row.reviewKind === "product_import";
}

export function isUnknownSupplementReviewRow(row: AdminReviewTaskRow) {
  return (
    row.itemType === "supplement" && row.reviewKind === "unknown_supplement"
  );
}

export function isUnknownFoodReviewRow(row: AdminReviewTaskRow) {
  return row.itemType === "food" && row.reviewKind === "unknown_food";
}

export function isPlanReviewRow(row: AdminReviewTaskRow) {
  return (
    Boolean(row.planId) &&
    !isProductReviewRow(row) &&
    !isUnknownSupplementReviewRow(row) &&
    !isUnknownFoodReviewRow(row)
  );
}

export function reviewScopeLabel(labels: AdminContent, row: AdminReviewTaskRow) {
  if (isProductReviewRow(row)) {
    return labels.reviewQueue.productReview;
  }

  if (isUnknownSupplementReviewRow(row)) {
    return labels.reviewQueue.supplementReview;
  }

  if (isUnknownFoodReviewRow(row)) {
    return labels.reviewQueue.foodReview;
  }

  if (row.itemType === "food") {
    return row.planId
      ? labels.reviewQueue.planReview
      : labels.reviewQueue.foodReview;
  }

  return row.planId
    ? labels.reviewQueue.planReview
    : labels.reviewQueue.supplementReview;
}

export function reviewMatchesMetric(
  row: AdminReviewTaskRow,
  metricId: ReviewMetricFilter,
) {
  if (metricId === "reviewsTotal") {
    return true;
  }

  if (metricId === "reviewsProduct") {
    return isProductReviewRow(row);
  }

  if (metricId === "reviewsPlan") {
    return isPlanReviewRow(row);
  }

  if (metricId === "reviewsFood") {
    return row.itemType === "food" && !isPlanReviewRow(row);
  }

  return row.itemType === "supplement" && !isPlanReviewRow(row);
}

export function reviewMetricCounts(rows: readonly AdminReviewTaskRow[]) {
  return rows.reduce(
    (counts, row) => {
      counts.total += 1;

      if (isProductReviewRow(row)) {
        counts.product += 1;
      } else if (isPlanReviewRow(row)) {
        counts.plan += 1;
      } else if (row.itemType === "food") {
        counts.food += 1;
      } else {
        counts.supplement += 1;
      }

      return counts;
    },
    {
      food: 0,
      plan: 0,
      product: 0,
      supplement: 0,
      total: 0,
    },
  );
}

export function sortReviewRows(
  left: AdminReviewTaskRow,
  right: AdminReviewTaskRow,
) {
  const valueDifference = right.businessValue - left.businessValue;

  if (valueDifference !== 0) {
    return valueDifference;
  }

  return new Date(left.queuedAt).getTime() - new Date(right.queuedAt).getTime();
}

export function groupReviewRows(
  labels: AdminContent,
  rows: AdminReviewTaskRow[],
): ReviewTaskGroup[] {
  const groups = new Map<string, ReviewTaskGroup>();

  rows.forEach((row) => {
    const key = row.taskGroupId ?? row.id;
    const existing = groups.get(key);
    const createdAt = existing ? existing.createdAt : row.queuedAt;
    const businessValue = Math.max(
      existing?.businessValue ?? 0,
      row.businessValue,
    );

    groups.set(key, {
      businessValue,
      createdAt,
      key,
      planId: existing?.planId ?? row.planId,
      planReview: Boolean(existing?.planReview || isPlanReviewRow(row)),
      rows: [...(existing?.rows ?? []), row],
      title: existing?.title ?? row.groupLabel ?? reviewScopeLabel(labels, row),
    });
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort(sortReviewRows),
    }))
    .sort((left, right) => {
      const valueDifference = right.businessValue - left.businessValue;

      if (valueDifference !== 0) {
        return valueDifference;
      }

      return (
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      );
    });
}

export function reviewValuePill(labels: AdminContent, value: number) {
  if (value >= 500) {
    return {
      className: "bg-red-50 text-red-700 ring-red-200",
      label: labels.reviewQueue.highValue,
    };
  }

  if (value >= 300) {
    return {
      className: "bg-amber-50 text-amber-800 ring-amber-200",
      label: labels.reviewQueue.mediumValue,
    };
  }

  return {
    className: "bg-[#ECFDF5] text-[#126B4F] ring-[#A7F3D0]",
    label: labels.reviewQueue.lowValue,
  };
}

export function reviewContextText(labels: AdminContent, row: AdminReviewTaskRow) {
  const details = [
    row.planId ? `${labels.reviewQueue.plan}: ${row.planId}` : "",
    row.originalDose
      ? `${labels.reviewQueue.originalDose}: ${row.originalDose}`
      : "",
    row.newDose ? `${labels.reviewQueue.newDose}: ${row.newDose}` : "",
  ].filter(Boolean);

  return details.length > 0 ? details.join(" · ") : null;
}

export function reviewRowToSupplementDraft(
  labels: AdminContent,
  row: AdminReviewTaskRow,
): AdminSupplementRow {
  const value = reviewValuePill(labels, row.businessValue);

  return {
    aliases: [],
    category: reviewKindLabel(labels, row),
    confidence:
      row.reviewKind === "unknown_supplement" ||
      row.reviewKind === "unknown_food"
        ? "low"
        : "moderate",
    id: row.id,
    ingredientType: `${reviewKindLabel(labels, row)} · ${value.label}`,
    listStatus: "active",
    maxAmount: row.maxAmount,
    maxUnit: row.maxUnit ?? "",
    name: row.supplementName,
    primaryUseCase: null,
    safetyFlags: [],
    safetyNotes: reviewContextText(labels, row),
    sourceStatus: "recommended_add",
    translations: {},
    updatedAt: row.queuedAt,
  };
}

export function formatReviewQueueDose(
  amount: number | null,
  unit: string | null,
  locale: Locale,
) {
  if (amount === null && !unit) {
    return "";
  }

  const formattedAmount =
    amount === null
      ? ""
      : new Intl.NumberFormat(formatLocale(locale), {
          maximumFractionDigits: 2,
        }).format(amount);

  return unit
    ? [formattedAmount, unit].filter(Boolean).join(" ")
    : formattedAmount;
}

export function reviewProposedDose(row: AdminReviewTaskRow, locale: Locale) {
  if (row.itemType === "product") {
    return row.productImport?.fdaApprovalNumber ?? "";
  }

  if (row.itemType === "food") {
    return localizedReviewValue(row.foodServing, locale);
  }

  return (
    row.clientDoseText ??
    formatReviewQueueDose(row.clientDoseAmount, row.clientDoseUnit, locale)
  );
}

export function localizedReviewValue(
  value: AdminReviewLocalizedText | null | undefined,
  locale: Locale,
) {
  return value?.[locale] || value?.en || value?.th || "";
}

export function localizedReviewDraft(
  value: string,
  locale: Locale,
  existing: AdminReviewLocalizedText | null | undefined,
): AdminReviewLocalizedText | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (locale === "th") {
    return {
      en: existing?.en || trimmed,
      th: trimmed,
      "zh-CN": existing?.["zh-CN"] || existing?.en || trimmed,
    };
  }

  if (locale === "zh-CN") {
    return {
      en: existing?.en || trimmed,
      th: existing?.th || existing?.en || trimmed,
      "zh-CN": trimmed,
    };
  }

  return {
    en: trimmed,
    th: existing?.th || trimmed,
    "zh-CN": existing?.["zh-CN"] || trimmed,
  };
}
