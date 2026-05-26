"use client";

import { useState } from "react";
import { SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type {
  AdminReviewLocalizedText,
  AdminReviewQueueData,
  AdminReviewTaskRow
} from "@/lib/admin-review-queue";
import type { AdminProductsData } from "@/lib/admin-products";
import type {
  AdminSupplementRow,
  AdminSupplementsData
} from "@/lib/admin-supplements";
import { supplementDoseUnits } from "@/lib/supplement-dose-units";
import type { Locale } from "@/lib/i18n";
import { productDoseUnitSelectOptions } from "@/components/admin/product-view";
import {
  foodReviewSuggestionTimeoutMs,
  type AdminContent
} from "@/components/admin/dashboard-content";
import {
  BusinessStatsGrid,
  PlanIdLink,
  ReviewAgeTimer,
  businessMetricColors,
  classNames,
  formatGeneratedAt,
  formatLocale,
  readableToken,
  taskStatusClass,
  taskValueClass,
  taskValueLabel,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";
import {
  safetyMetric
} from "@/components/admin/safety-view-helpers";
import {
  SupplementDetailsModal,
  SupplementListMeta
} from "@/components/admin/supplement-view";
import { AdminModal } from "@/components/admin/ui";

function reviewKindLabel(labels: AdminContent, row: AdminReviewTaskRow) {
  if (row.reviewKind === "dose_reduced") {
    return labels.reviewQueue.doseReduced;
  }

  if (row.reviewKind === "unknown_supplement" || row.reviewKind === "unknown_food") {
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

function isProductReviewRow(row: AdminReviewTaskRow) {
  return row.itemType === "product" || row.reviewKind === "product_import";
}

function isUnknownSupplementReviewRow(row: AdminReviewTaskRow) {
  return row.itemType === "supplement" && row.reviewKind === "unknown_supplement";
}

function isUnknownFoodReviewRow(row: AdminReviewTaskRow) {
  return row.itemType === "food" && row.reviewKind === "unknown_food";
}

function isPlanReviewRow(row: AdminReviewTaskRow) {
  return (
    Boolean(row.planId) &&
    !isProductReviewRow(row) &&
    !isUnknownSupplementReviewRow(row) &&
    !isUnknownFoodReviewRow(row)
  );
}

function reviewScopeLabel(labels: AdminContent, row: AdminReviewTaskRow) {
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
    return row.planId ? labels.reviewQueue.planReview : labels.reviewQueue.foodReview;
  }

  return row.planId ? labels.reviewQueue.planReview : labels.reviewQueue.supplementReview;
}

type ReviewMetricFilter =
  | "reviewsFood"
  | "reviewsPlan"
  | "reviewsProduct"
  | "reviewsSupplement"
  | "reviewsTotal";

function reviewMatchesMetric(row: AdminReviewTaskRow, metricId: ReviewMetricFilter) {
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

function reviewMetricCounts(rows: readonly AdminReviewTaskRow[]) {
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
      total: 0
    }
  );
}

type ReviewTaskGroup = Readonly<{
  createdAt: string;
  key: string;
  planId: string | null;
  planReview: boolean;
  businessValue: number;
  rows: AdminReviewTaskRow[];
  title: string;
}>;

function sortReviewRows(
  left: AdminReviewTaskRow,
  right: AdminReviewTaskRow
) {
  const valueDifference = right.businessValue - left.businessValue;

  if (valueDifference !== 0) {
    return valueDifference;
  }

  return new Date(left.queuedAt).getTime() - new Date(right.queuedAt).getTime();
}

function groupReviewRows(
  labels: AdminContent,
  rows: AdminReviewTaskRow[]
): ReviewTaskGroup[] {
  const groups = new Map<string, ReviewTaskGroup>();

  rows.forEach((row) => {
    const key = row.taskGroupId ?? row.id;
    const existing = groups.get(key);
    const createdAt = existing ? existing.createdAt : row.queuedAt;
    const businessValue = Math.max(existing?.businessValue ?? 0, row.businessValue);

    groups.set(key, {
      businessValue,
      createdAt,
      key,
      planId: existing?.planId ?? row.planId,
      planReview: Boolean(existing?.planReview || isPlanReviewRow(row)),
      rows: [...(existing?.rows ?? []), row],
      title: existing?.title ?? row.groupLabel ?? reviewScopeLabel(labels, row)
    });
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort(sortReviewRows)
    }))
    .sort((left, right) => {
      const valueDifference = right.businessValue - left.businessValue;

      if (valueDifference !== 0) {
        return valueDifference;
      }

      return (
        new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime()
      );
    });
}

function reviewValuePill(labels: AdminContent, value: number) {
  if (value >= 500) {
    return {
      className: "bg-red-50 text-red-700 ring-red-200",
      label: labels.reviewQueue.highValue
    };
  }

  if (value >= 300) {
    return {
      className: "bg-amber-50 text-amber-800 ring-amber-200",
      label: labels.reviewQueue.mediumValue
    };
  }

  return {
    className: "bg-[#ECFDF5] text-[#126B4F] ring-[#A7F3D0]",
    label: labels.reviewQueue.lowValue
  };
}

function reviewContextText(
  labels: AdminContent,
  row: AdminReviewTaskRow
) {
  const details = [
    row.planId ? `${labels.reviewQueue.plan}: ${row.planId}` : "",
    row.originalDose
      ? `${labels.reviewQueue.originalDose}: ${row.originalDose}`
      : "",
    row.newDose ? `${labels.reviewQueue.newDose}: ${row.newDose}` : ""
  ].filter(Boolean);

  return details.length > 0 ? details.join(" · ") : null;
}

function reviewRowToSupplementDraft(
  labels: AdminContent,
  row: AdminReviewTaskRow
): AdminSupplementRow {
  const value = reviewValuePill(labels, row.businessValue);

  return {
    aliases: [],
    category: reviewKindLabel(labels, row),
    confidence:
      row.reviewKind === "unknown_supplement" || row.reviewKind === "unknown_food"
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
    updatedAt: row.queuedAt
  };
}

function formatReviewQueueDose(
  amount: number | null,
  unit: string | null,
  locale: Locale
) {
  if (amount === null && !unit) {
    return "";
  }

  const formattedAmount =
    amount === null
      ? ""
      : new Intl.NumberFormat(formatLocale(locale), {
          maximumFractionDigits: 2
        }).format(amount);

  return unit ? [formattedAmount, unit].filter(Boolean).join(" ") : formattedAmount;
}

function reviewProposedDose(row: AdminReviewTaskRow, locale: Locale) {
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

function localizedReviewValue(
  value: AdminReviewLocalizedText | null | undefined,
  locale: Locale
) {
  return value?.[locale] || value?.en || value?.th || "";
}

function localizedReviewDraft(
  value: string,
  locale: Locale,
  existing: AdminReviewLocalizedText | null | undefined
): AdminReviewLocalizedText | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return locale === "th"
    ? { en: existing?.en || trimmed, th: trimmed }
    : { en: trimmed, th: existing?.th || trimmed };
}

type FoodReviewDraftFields = Readonly<{
  frequency: AdminReviewLocalizedText | null;
  rationale: AdminReviewLocalizedText | null;
  serving: AdminReviewLocalizedText | null;
}>;

function PlanSafetyReviewModal({
  accessToken,
  error,
  labels,
  locale,
  onClose,
  onDecision,
  row,
  saving
}: Readonly<{
  accessToken: string;
  error: boolean;
  labels: AdminContent;
  locale: Locale;
  onClose: () => void;
  onDecision: (
    decision: "approve" | "disapprove",
    clientDoseAmount: number | null,
    clientDoseUnit: string,
    reviewerNote: string | null,
    foodDetails?: FoodReviewDraftFields | null
  ) => void;
  row: AdminReviewTaskRow;
  saving: boolean;
}>) {
  const [clientDoseAmount, setClientDoseAmount] = useState<number | null>(
    row.clientDoseAmount
  );
  const [clientDoseUnit, setClientDoseUnit] = useState(row.clientDoseUnit ?? "");
  const [foodFrequency, setFoodFrequency] = useState(
    localizedReviewValue(row.foodFrequency, locale)
  );
  const [foodRationale, setFoodRationale] = useState(
    localizedReviewValue(row.foodRationale, locale)
  );
  const [foodServing, setFoodServing] = useState(
    localizedReviewValue(row.foodServing, locale)
  );
  const [reviewerNote, setReviewerNote] = useState("");
  const [suggestingFoodReview, setSuggestingFoodReview] = useState(false);
  const [suggestFoodReviewError, setSuggestFoodReviewError] = useState(false);
  const inputClass =
    "rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]";
  const unitOptions =
    clientDoseUnit &&
    !(supplementDoseUnits as readonly string[]).includes(clientDoseUnit)
      ? [clientDoseUnit, ...supplementDoseUnits]
      : supplementDoseUnits;
  const foodReview = row.itemType === "food";
  const doseValid =
    foodReview ||
    clientDoseAmount !== null &&
    Number.isFinite(clientDoseAmount) &&
    clientDoseAmount > 0 &&
    clientDoseUnit.trim() !== "";
  const foodDetails = foodReview
    ? {
        frequency: localizedReviewDraft(foodFrequency, locale, row.foodFrequency),
        rationale: localizedReviewDraft(foodRationale, locale, row.foodRationale),
        serving: localizedReviewDraft(foodServing, locale, row.foodServing)
      }
    : null;

  async function suggestFoodReviewDetails() {
    setSuggestingFoodReview(true);
    setSuggestFoodReviewError(false);
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      foodReviewSuggestionTimeoutMs
    );

    try {
      const response = await fetch("/api/admin/foods/suggest-review", {
        body: JSON.stringify({
          accessToken,
          currentFrequency: foodFrequency,
          currentRationale: foodRationale,
          currentServing: foodServing,
          flagReason: row.flagReason,
          foodName: row.supplementName,
          locale,
          reviewKind: row.reviewKind
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error("Unable to suggest food review details");
      }

      const payload = (await response.json()) as {
        suggestion?: {
          frequency?: string;
          rationale?: string;
          reviewerNote?: string;
          serving?: string;
        };
      };
      const suggestion = payload.suggestion;

      if (!suggestion) {
        throw new Error("Invalid food review suggestion");
      }

      if (typeof suggestion.serving === "string" && suggestion.serving.trim()) {
        setFoodServing(suggestion.serving.trim());
      }

      if (
        typeof suggestion.frequency === "string" &&
        suggestion.frequency.trim()
      ) {
        setFoodFrequency(suggestion.frequency.trim());
      }

      if (
        typeof suggestion.rationale === "string" &&
        suggestion.rationale.trim()
      ) {
        setFoodRationale(suggestion.rationale.trim());
      }

      if (
        typeof suggestion.reviewerNote === "string" &&
        suggestion.reviewerNote.trim()
      ) {
        setReviewerNote(suggestion.reviewerNote.trim());
      }
    } catch (suggestionError) {
      console.error("Unable to suggest food review details", suggestionError);
      setSuggestFoodReviewError(true);
    } finally {
      window.clearTimeout(timeout);
      setSuggestingFoodReview(false);
    }
  }

  return (
    <AdminModal onClose={onClose} panelClassName="max-w-3xl">
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {row.supplementName}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                <span>{formatGeneratedAt(row.queuedAt, locale)}</span>
                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.08em] text-gray-600">
                  {row.itemType === "food" ? "Food" : "Supplement"}
                </span>
              </div>
            </div>
            <button
              aria-label={labels.supplements.close}
              className="rounded-md p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A]"
              onClick={onClose}
              type="button"
            >
              <XMarkIcon aria-hidden={true} className="size-5" />
            </button>
          </div>

          <div className="max-h-[75vh] space-y-6 overflow-y-auto px-6 py-6">
            {row.planId ? (
              <SupplementListMeta
                label={labels.reviewQueue.plan}
                value={<PlanIdLink locale={locale} planId={row.planId} />}
              />
            ) : null}

            {foodReview ? (
              <>
                <div className="rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700 ring-1 ring-gray-100">
                  {row.flagReason ||
                    "Review whether this food can be shown in the client guidance."}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-gray-700">
                    {labels.reviewQueue.foodServing}
                    <input
                      className={inputClass}
                      onChange={(event) => setFoodServing(event.target.value)}
                      type="text"
                      value={foodServing}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-gray-700">
                    {labels.reviewQueue.foodFrequency}
                    <input
                      className={inputClass}
                      onChange={(event) => setFoodFrequency(event.target.value)}
                      type="text"
                      value={foodFrequency}
                    />
                  </label>
                </div>

                <label className="grid gap-2 text-sm font-medium text-gray-700">
                  {labels.reviewQueue.foodRationale}
                  <textarea
                    className={classNames(inputClass, "min-h-24 resize-y")}
                    onChange={(event) => setFoodRationale(event.target.value)}
                    value={foodRationale}
                  />
                </label>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <SupplementListMeta
                    label={labels.reviewQueue.clientDose}
                    value={
                      row.clientDoseText ??
                      formatReviewQueueDose(
                        row.clientDoseAmount,
                        row.clientDoseUnit,
                        locale
                      )
                    }
                  />
                  <SupplementListMeta
                    label={labels.supplements.maxAmount}
                    value={formatReviewQueueDose(
                      row.limitAmount ?? row.maxAmount,
                      row.limitUnit ?? row.maxUnit,
                      locale
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-gray-700">
                    {labels.supplements.maxAmount}
                    <input
                      aria-invalid={!doseValid}
                      className={classNames(
                        inputClass,
                        !doseValid ? "ring-red-300 focus:ring-red-500" : ""
                      )}
                      min="0"
                      onChange={(event) =>
                        setClientDoseAmount(
                          event.target.value === ""
                            ? null
                            : Number(event.target.value)
                        )
                      }
                      step="any"
                      type="number"
                      value={clientDoseAmount ?? ""}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-gray-700">
                    {labels.supplements.maxUnit}
                    <select
                      aria-invalid={!doseValid}
                      className={classNames(
                        inputClass,
                        !doseValid ? "ring-red-300 focus:ring-red-500" : ""
                      )}
                      onChange={(event) => setClientDoseUnit(event.target.value)}
                      value={clientDoseUnit}
                    >
                      <option value="">{labels.supplements.none}</option>
                      {unitOptions.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            )}

            <label className="grid gap-2 text-sm font-medium text-gray-700">
              {labels.reviewQueue.reviewerNote}
              <textarea
                className={classNames(inputClass, "min-h-28 resize-y")}
                onChange={(event) => setReviewerNote(event.target.value)}
                value={reviewerNote}
              />
            </label>

            {error ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
                {labels.supplements.updateError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {foodReview ? (
                <button
                  aria-label={labels.reviewQueue.suggestFoodReview}
                  className="inline-flex size-9 items-center justify-center rounded-md bg-[#3A7BD5] text-white shadow-sm transition hover:bg-[#2F67B8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3A7BD5] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={saving || suggestingFoodReview}
                  onClick={() => void suggestFoodReviewDetails()}
                  title={labels.reviewQueue.suggestFoodReview}
                  type="button"
                >
                  <SparklesIcon
                    aria-hidden={true}
                    className={classNames(
                      "size-5",
                      suggestingFoodReview ? "animate-pulse" : ""
                    )}
                  />
                </button>
              ) : null}
              {suggestingFoodReview ? (
                <p className="text-sm font-medium text-[#3A7BD5]">
                  {labels.reviewQueue.suggestFoodReviewBusy}
                </p>
              ) : null}
              {suggestFoodReviewError ? (
                <p className="text-sm font-medium text-red-600">
                  {labels.reviewQueue.suggestFoodReviewError}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
              <button
                className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
                onClick={onClose}
                type="button"
              >
                {labels.supplements.close}
              </button>
              <button
                className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving}
                onClick={() =>
                  onDecision(
                    "disapprove",
                    clientDoseAmount,
                    clientDoseUnit,
                    reviewerNote.trim() || null,
                    foodReview ? foodDetails : null
                  )
                }
                type="button"
              >
                {labels.reviewQueue.disapprove}
              </button>
              <button
                className="rounded-md bg-[#1FA77A] px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#188865] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving || !doseValid}
                onClick={() =>
                  onDecision(
                    "approve",
                    foodReview ? null : clientDoseAmount,
                    foodReview ? "" : clientDoseUnit,
                    reviewerNote.trim() || null,
                    foodReview ? foodDetails : null
                  )
                }
                type="button"
              >
                {saving ? "..." : labels.reviewQueue.approve}
              </button>
            </div>
          </div>
    </AdminModal>
  );
}

type ProductImportFactDraft = {
  amount: string;
  confidence: "high" | "low" | "moderate";
  name: string;
  unit: string;
};

function ProductImportReviewModal({
  error,
  labels,
  onClose,
  onDecision,
  productsData,
  row,
  saving
}: Readonly<{
  error: boolean;
  labels: AdminContent;
  onClose: () => void;
  onDecision: (
    action: "approve_product" | "ignore_import" | "merge_product",
    mergeProductId: string | null,
    reviewerNote: string | null,
    parsedFacts?: Array<{
      amount: number | null;
      confidence: "high" | "low" | "moderate";
      name: string;
      unit: string | null;
    }>,
    description?: string | null,
    descriptionEn?: string | null,
    descriptionTh?: string | null
  ) => void;
  productsData: AdminProductsData;
  row: AdminReviewTaskRow;
  saving: boolean;
}>) {
  const [mergeProductId, setMergeProductId] = useState(
    row.productImport?.duplicateProductIds[0] ?? ""
  );
  const [description, setDescription] = useState(
    row.productImport?.description ?? ""
  );
  const [descriptionEn, setDescriptionEn] = useState(
    row.productImport?.descriptionEn ?? row.productImport?.description ?? ""
  );
  const [descriptionTh, setDescriptionTh] = useState(
    row.productImport?.descriptionTh ?? ""
  );
  const [facts, setFacts] = useState<ProductImportFactDraft[]>(() =>
    (row.productImport?.parsedFacts ?? []).map((fact) => ({
      amount: fact.amount === null ? "" : String(fact.amount),
      confidence:
        fact.confidence === "high" || fact.confidence === "low"
          ? fact.confidence
          : "moderate" as const,
      name: fact.name,
      unit: fact.unit ?? ""
    }))
  );
  const [reviewerNote, setReviewerNote] = useState("");
  const sourceUrl = row.productImport?.sourceUrl;
  const imageUrl = row.productImport?.imageUrls[0] ?? null;
  const duplicateOptions = productsData.rows.filter((product) =>
    row.productImport?.duplicateProductIds.includes(product.id)
  );
  const mergeOptions = duplicateOptions.length > 0
    ? duplicateOptions
    : productsData.rows.slice(0, 80);
  const inputClass =
    "rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]";
  const parsedFacts = facts.flatMap((fact) => {
    const name = fact.name.trim();

    if (!name) {
      return [];
    }

    const amount = fact.amount.trim() ? Number(fact.amount) : null;

    return [{
      amount: amount !== null && Number.isFinite(amount) && amount >= 0
        ? amount
        : null,
      confidence: fact.confidence,
      name,
      unit: fact.unit.trim() || null
    }];
  });

  return (
    <AdminModal onClose={onClose} panelClassName="max-w-3xl">
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-gray-900">
                {row.supplementName}
              </h2>
              {row.productImport?.fdaApprovalNumber ? (
                <p className="mt-1 text-sm text-gray-500">
                  FDA {row.productImport.fdaApprovalNumber}
                </p>
              ) : null}
            </div>
            <button
              aria-label={labels.supplements.close}
              className="rounded-md p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A]"
              onClick={onClose}
              type="button"
            >
              <XMarkIcon aria-hidden={true} className="size-5" />
            </button>
          </div>

          <div className="max-h-[75vh] space-y-6 overflow-y-auto px-6 py-6">
            <div className="flex gap-4">
              {imageUrl ? (
                <img
                  alt=""
                  className="size-24 rounded-xl object-cover ring-1 ring-gray-200"
                  src={imageUrl}
                />
              ) : (
                <div className="flex size-24 items-center justify-center rounded-xl bg-gray-50 text-xs font-semibold text-gray-400 ring-1 ring-gray-200">
                  Product
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-2 text-sm text-gray-600">
                {sourceUrl ? (
                  <a
                    className="block truncate font-semibold text-[#2563EB] hover:text-[#1D4ED8]"
                    href={sourceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {sourceUrl}
                  </a>
                ) : null}
                <p>
                  Review the imported label facts before this product can be
                  recommended.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Description EN
                <textarea
                  className={classNames(inputClass, "min-h-24 resize-y")}
                  onChange={(event) => {
                    setDescriptionEn(event.target.value);
                    setDescription(event.target.value);
                  }}
                  value={descriptionEn}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Description TH
                <textarea
                  className={classNames(inputClass, "min-h-24 resize-y")}
                  onChange={(event) => setDescriptionTh(event.target.value)}
                  value={descriptionTh}
                />
              </label>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  Parsed facts
                </h3>
                <button
                  className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-[#126B4F] ring-1 ring-emerald-200 hover:bg-emerald-50"
                  onClick={() =>
                    setFacts((current) => [
                      ...current,
                      {
                        amount: "",
                        confidence: "moderate",
                        name: "",
                        unit: ""
                      }
                    ])
                  }
                  type="button"
                >
                  Add fact
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {facts.length ? facts.map((fact, index) => (
                  <div
                    className="grid gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3 sm:grid-cols-[minmax(0,1fr)_6rem_6rem_8rem_auto]"
                    key={`${index}:${fact.name}`}
                  >
                    <input
                      className={inputClass}
                      onChange={(event) =>
                        setFacts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, name: event.target.value }
                              : item
                          )
                        )
                      }
                      placeholder="Ingredient"
                      value={fact.name}
                    />
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      onChange={(event) =>
                        setFacts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, amount: event.target.value }
                              : item
                          )
                        )
                      }
                      placeholder="Amount"
                      value={fact.amount}
                    />
                    <select
                      className={inputClass}
                      onChange={(event) =>
                        setFacts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, unit: event.target.value }
                              : item
                          )
                        )
                      }
                      value={fact.unit}
                    >
                      <option value="">Unit</option>
                      {productDoseUnitSelectOptions(fact.unit).map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                    <select
                      className={inputClass}
                      onChange={(event) =>
                        setFacts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  confidence: event.target.value as "high" | "low" | "moderate"
                                }
                              : item
                          )
                        )
                      }
                      value={fact.confidence}
                    >
                      <option value="high">High</option>
                      <option value="moderate">Moderate</option>
                      <option value="low">Low</option>
                    </select>
                    <button
                      className="rounded-md bg-white px-2.5 py-2 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50"
                      onClick={() =>
                        setFacts((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index)
                        )
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                )) : (
                  <span className="text-sm text-amber-700">No parsed facts yet.</span>
                )}
              </div>
            </div>

            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Duplicate of existing product
              <select
                className={inputClass}
                onChange={(event) => setMergeProductId(event.target.value)}
                value={mergeProductId}
              >
                <option value="">Select product</option>
                {mergeOptions.map((product) => (
                  <option key={product.id} value={product.id}>
                    {[product.title, product.brandName].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Reviewer note
              <textarea
                className={classNames(inputClass, "min-h-24 resize-y")}
                onChange={(event) => setReviewerNote(event.target.value)}
                value={reviewerNote}
              />
            </label>

            {error ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
                {labels.supplements.updateError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 border-t border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
              onClick={onClose}
              type="button"
            >
              {labels.supplements.close}
            </button>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-[#126B4F] ring-1 ring-emerald-200 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving || !mergeProductId}
                onClick={() =>
                  onDecision(
                    "merge_product",
                    mergeProductId,
                    reviewerNote.trim() || null
                  )
                }
                type="button"
              >
                Mark duplicate
              </button>
              <span className="isolate inline-flex rounded-md shadow-xs">
                <button
                  className="relative inline-flex items-center rounded-l-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 focus:z-10 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={saving}
                  onClick={() =>
                    onDecision("ignore_import", null, reviewerNote.trim() || null)
                  }
                  type="button"
                >
                  Ignore
                </button>
                <button
                  className="relative -ml-px inline-flex items-center rounded-r-md bg-[#1FA77A] px-3.5 py-2.5 text-sm font-semibold text-white ring-1 ring-[#1FA77A] hover:bg-[#188865] focus:z-10 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={saving}
                  onClick={() =>
                    onDecision(
                      "approve_product",
                      null,
                      reviewerNote.trim() || null,
                      parsedFacts,
                      description.trim() || descriptionEn.trim() || descriptionTh.trim() || null,
                      descriptionEn.trim() || null,
                      descriptionTh.trim() || null
                    )
                  }
                  type="button"
                >
                  {saving ? "..." : "Approve"}
                </button>
              </span>
            </div>
          </div>
    </AdminModal>
  );
}

export function AdminReviewQueueView({
  accessToken,
  data,
  labels,
  locale,
  productsData,
  selectedReviewTaskId,
  supplementsData
}: Readonly<{
  accessToken: string;
  data: AdminReviewQueueData;
  labels: AdminContent;
  locale: Locale;
  productsData: AdminProductsData;
  selectedReviewTaskId?: string | null;
  supplementsData: AdminSupplementsData;
}>) {
  const [queueState, setQueueState] = useState<{
    data: AdminReviewQueueData;
    generatedAt: string;
  }>({
    data,
    generatedAt: data.generatedAt
  });
  const [errorReviewId, setErrorReviewId] = useState<string | null>(null);
  const [savingReviewId, setSavingReviewId] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<{
    associatedSupplementId: string;
    draft: AdminSupplementRow;
    queuedLabel: string;
    row: AdminReviewTaskRow;
  } | null>(null);
  const [selectedReviewMetricId, setSelectedReviewMetricId] =
    useState<ReviewMetricFilter>("reviewsTotal");
  const [dismissedReviewTaskId, setDismissedReviewTaskId] = useState<
    string | null
  >(null);
  const queueData =
    queueState.generatedAt === data.generatedAt ? queueState.data : data;
  const reviewMetricSummary = reviewMetricCounts(queueData.rows);
  const visibleReviewRows = queueData.rows.filter((row) =>
    reviewMatchesMetric(row, selectedReviewMetricId)
  );
  const reviewGroups = groupReviewRows(labels, visibleReviewRows);

  function setLocalQueueData(
    next:
      | AdminReviewQueueData
      | ((currentData: AdminReviewQueueData) => AdminReviewQueueData)
  ) {
    setQueueState((currentState) => {
      const currentData =
        currentState.generatedAt === data.generatedAt
          ? currentState.data
          : data;

      return {
        data:
          typeof next === "function"
            ? next(currentData)
            : next,
        generatedAt: data.generatedAt
      };
    });
  }

  async function saveReview(
    row: AdminSupplementRow,
    associatedSupplementId: string
  ) {
    setSavingReviewId(row.id);
    setErrorReviewId(null);

    try {
      const response = await fetch(`/api/admin/review-tasks/${row.id}`, {
        body: JSON.stringify({
          accessToken,
          action: "resolve",
          associatedSupplementId: associatedSupplementId || null,
          category: row.category,
          confidence: row.confidence,
          listStatus: row.listStatus,
          maxAmount: row.maxAmount,
          maxUnit: row.maxUnit,
          safetyFlags: row.safetyFlags,
          safetyNotes: row.safetyNotes,
          supplementName: row.name
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;

        throw new Error(
          errorPayload?.message ?? "Unable to resolve review task"
        );
      }

      const payload = (await response.json()) as {
        data?: AdminReviewQueueData;
        result?: {
          removedTaskIds?: string[];
        };
      };

      if (payload.data) {
        setLocalQueueData(payload.data);
      } else {
        const removedTaskIds = new Set(
          payload.result?.removedTaskIds?.length
            ? payload.result.removedTaskIds
            : [row.id]
        );

        setLocalQueueData((currentData) => {
          const rows = currentData.rows.filter(
            (item) => !removedTaskIds.has(item.id)
          );

          return {
            ...currentData,
            rows,
            summary: {
              doseReduced: rows.filter(
                (item) => item.reviewKind === "dose_reduced"
              ).length,
              reviewRequired: rows.filter(
                (item) =>
                  item.reviewKind !== "dose_reduced" &&
                  item.reviewKind !== "unknown_supplement" &&
                  item.reviewKind !== "unknown_food"
              ).length,
              total: rows.length,
              unknown: rows.filter(
                (item) =>
                  item.reviewKind === "unknown_supplement" ||
                  item.reviewKind === "unknown_food"
              ).length
            }
          };
        });
      }

      setDismissedReviewTaskId(row.id);
      setSelectedReview(null);
    } catch (saveError) {
      console.error("Unable to resolve review task", saveError);
      setErrorReviewId(row.id);
    } finally {
      setSavingReviewId(null);
    }
  }

  async function decidePlanReview(
    row: AdminReviewTaskRow,
    decision: "approve" | "disapprove",
    clientDoseAmount: number | null,
    clientDoseUnit: string,
    reviewerNote: string | null,
    foodDetails?: FoodReviewDraftFields | null
  ) {
    setSavingReviewId(row.id);
    setErrorReviewId(null);

    try {
      const response = await fetch(`/api/admin/review-tasks/${row.id}`, {
        body: JSON.stringify({
          accessToken,
          action: decision,
          clientDoseAmount,
          clientDoseUnit,
          foodFrequency: foodDetails?.frequency ?? null,
          foodRationale: foodDetails?.rationale ?? null,
          foodServing: foodDetails?.serving ?? null,
          reviewerNote
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;

        throw new Error(
          errorPayload?.message ?? "Unable to update plan review"
        );
      }

      const payload = (await response.json()) as {
        data?: AdminReviewQueueData;
        result?: {
          removedTaskIds?: string[];
        };
      };

      if (payload.data) {
        setLocalQueueData(payload.data);
      } else {
        const removedTaskIds = new Set(
          payload.result?.removedTaskIds?.length
            ? payload.result.removedTaskIds
            : [row.id]
        );

        setLocalQueueData((currentData) => {
          const rows = currentData.rows.filter(
            (item) => !removedTaskIds.has(item.id)
          );

          return {
            ...currentData,
            rows,
            summary: {
              doseReduced: rows.filter(
                (item) => item.reviewKind === "dose_reduced"
              ).length,
              reviewRequired: rows.filter(
                (item) =>
                  item.reviewKind !== "dose_reduced" &&
                  item.reviewKind !== "unknown_supplement" &&
                  item.reviewKind !== "unknown_food"
              ).length,
              total: rows.length,
              unknown: rows.filter(
                (item) =>
                  item.reviewKind === "unknown_supplement" ||
                  item.reviewKind === "unknown_food"
              ).length
            }
          };
        });
      }

      setDismissedReviewTaskId(row.id);
      setSelectedReview(null);
    } catch (decisionError) {
      console.error("Unable to update plan review", decisionError);
      setErrorReviewId(row.id);
    } finally {
      setSavingReviewId(null);
    }
  }

  async function decideProductImportReview(
    row: AdminReviewTaskRow,
    action: "approve_product" | "ignore_import" | "merge_product",
    mergeProductId: string | null,
    reviewerNote: string | null,
    parsedFacts?: Array<{
      amount: number | null;
      confidence: "high" | "low" | "moderate";
      name: string;
      unit: string | null;
    }>,
    description?: string | null,
    descriptionEn?: string | null,
    descriptionTh?: string | null
  ) {
    setSavingReviewId(row.id);
    setErrorReviewId(null);

    try {
      const response = await fetch(`/api/admin/review-tasks/${row.id}`, {
        body: JSON.stringify({
          accessToken,
          action,
          description,
          descriptionEn,
          descriptionTh,
          mergeProductId,
          parsedFacts,
          reviewerNote
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;

        throw new Error(
          errorPayload?.message ?? "Unable to update product import review"
        );
      }

      const payload = (await response.json()) as {
        result?: {
          removedTaskIds?: string[];
        };
      };
      const removedTaskIds = new Set(
        payload.result?.removedTaskIds?.length
          ? payload.result.removedTaskIds
          : [row.id]
      );

      setLocalQueueData((currentData) => {
        const rows = currentData.rows.filter(
          (item) => !removedTaskIds.has(item.id)
        );

        return {
          ...currentData,
          rows,
          summary: {
            doseReduced: rows.filter(
              (item) => item.reviewKind === "dose_reduced"
            ).length,
            reviewRequired: rows.filter(
              (item) =>
                item.reviewKind !== "dose_reduced" &&
                item.reviewKind !== "unknown_supplement" &&
                item.reviewKind !== "unknown_food"
            ).length,
            total: rows.length,
            unknown: rows.filter(
              (item) =>
                item.reviewKind === "unknown_supplement" ||
                item.reviewKind === "unknown_food"
            ).length
          }
        };
      });

      setDismissedReviewTaskId(row.id);
      setSelectedReview(null);
    } catch (decisionError) {
      console.error("Unable to update product import review", decisionError);
      setErrorReviewId(row.id);
    } finally {
      setSavingReviewId(null);
    }
  }

  function selectReview(row: AdminReviewTaskRow) {
    setDismissedReviewTaskId(null);
    setSelectedReview({
      associatedSupplementId: "",
      draft: reviewRowToSupplementDraft(labels, row),
      queuedLabel: formatGeneratedAt(row.queuedAt, locale),
      row
    });
  }

  const linkedReviewRow =
    selectedReviewTaskId && dismissedReviewTaskId !== selectedReviewTaskId
      ? queueData.rows.find((item) => item.id === selectedReviewTaskId) ?? null
      : null;
  const visibleReview =
    selectedReview ??
    (linkedReviewRow
      ? {
          associatedSupplementId: "",
          draft: reviewRowToSupplementDraft(labels, linkedReviewRow),
          queuedLabel: formatGeneratedAt(linkedReviewRow.queuedAt, locale),
          row: linkedReviewRow
        }
      : null);

  function closeReviewModal() {
    setDismissedReviewTaskId(selectedReviewTaskId ?? visibleReview?.row.id ?? null);
    setSelectedReview(null);
  }

  const reviewMetrics: BusinessMetric[] = [
    safetyMetric({
      color: businessMetricColors.total,
      id: "reviewsTotal",
      label: labels.reviewQueue.total,
      locale,
      value: reviewMetricSummary.total
    }),
    safetyMetric({
      color: businessMetricColors.pendingReviews,
      id: "reviewsPlan",
      label: labels.reviewQueue.plan,
      locale,
      value: reviewMetricSummary.plan
    }),
    safetyMetric({
      color: businessMetricColors.succeeded,
      id: "reviewsSupplement",
      label: labels.pageTitles.supplements,
      locale,
      value: reviewMetricSummary.supplement
    }),
    safetyMetric({
      color: businessMetricColors.queued,
      id: "reviewsFood",
      label: labels.pageTitles.foods,
      locale,
      value: reviewMetricSummary.food
    }),
    safetyMetric({
      color: businessMetricColors.active,
      id: "reviewsProduct",
      label: labels.pageTitles.products,
      locale,
      value: reviewMetricSummary.product
    })
  ];

  return (
    <section className="mt-8 space-y-6">
      <BusinessStatsGrid
        metrics={reviewMetrics}
        onMetricSelect={(metricId) =>
          setSelectedReviewMetricId(metricId as ReviewMetricFilter)
        }
        selectedMetricId={selectedReviewMetricId}
      />

      {reviewGroups.length > 0 ? (
        <div className="space-y-7">
          {reviewGroups.map((group) => (
            <section key={group.key} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-baseline gap-x-1 text-sm font-semibold text-gray-900">
                    {group.planReview && group.planId ? (
                      <>
                        <span>Review nutrition safety for plan</span>
                        <PlanIdLink
                          className="break-all"
                          locale={locale}
                          planId={group.planId}
                        />
                      </>
                    ) : (
                      group.title
                    )}
                  </h3>
                  <p className="mt-0.5 text-xs font-medium text-gray-500">
                    <ReviewAgeTimer
                      createdAt={group.createdAt}
                      initialNow={queueData.generatedAt}
                      locale={locale}
                    />
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={classNames(
                      taskValueClass(group.businessValue),
                      "w-max rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                    )}
                  >
                    {taskValueLabel(group.businessValue, locale)}
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                {group.rows.map((row) => (
                  <article
                    key={row.id}
                    className="grid w-full cursor-pointer gap-3 rounded-2xl bg-white px-5 py-3 text-left shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A] sm:grid-cols-[8rem_8rem_9rem_minmax(0,1fr)_8rem_7rem] sm:items-center"
                    onClick={() => selectReview(row)}
                    onKeyDown={(event) => {
                      if (
                        event.target instanceof HTMLElement &&
                        event.target.closest("a")
                      ) {
                        return;
                      }

                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectReview(row);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <span
                      className={classNames(
                        taskStatusClass(row.status),
                        "w-max rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                      )}
                    >
                      {readableToken(row.status)}
                    </span>
                    <span
                      className={classNames(
                        taskValueClass(row.businessValue),
                        "w-max rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                      )}
                    >
                      {taskValueLabel(row.businessValue, locale)}
                    </span>
                    <span className="w-max rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                      {reviewScopeLabel(labels, row)}
                    </span>
                    <h3 className="min-w-0 truncate text-sm font-semibold text-gray-900 sm:text-base">
                      <span className="mr-2 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">
                      {row.itemType === "food"
                        ? "Food"
                        : row.itemType === "product"
                          ? "Product"
                          : "Supp"}
                      </span>{" "}
                      {row.supplementName}
                    </h3>
                    {row.planId ? (
                      <span className="truncate text-sm font-semibold text-gray-700">
                        {reviewProposedDose(row, locale)}
                      </span>
                    ) : (
                      <span className="hidden sm:block" />
                    )}
                    {row.planId ? (
                      <PlanIdLink
                        className="truncate text-sm sm:justify-self-end"
                        compact={true}
                        locale={locale}
                        planId={row.planId}
                        stopPropagation={true}
                      />
                    ) : (
                      <span className="hidden sm:block" />
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-white px-5 py-12 text-center text-sm font-medium text-gray-500 shadow-sm ring-1 ring-gray-200">
          {labels.reviewQueue.empty}
        </div>
      )}

      {visibleReview?.row.reviewKind === "product_import" &&
      visibleReview.row.itemType === "product" ? (
        <ProductImportReviewModal
          error={errorReviewId === visibleReview.row.id}
          labels={labels}
          onClose={closeReviewModal}
          onDecision={(action, mergeProductId, reviewerNote, parsedFacts, description, descriptionEn, descriptionTh) =>
            void decideProductImportReview(
              visibleReview.row,
              action,
              mergeProductId,
              reviewerNote,
              parsedFacts,
              description,
              descriptionEn,
              descriptionTh
            )
          }
          productsData={productsData}
          row={visibleReview.row}
          saving={savingReviewId === visibleReview.row.id}
        />
      ) : visibleReview?.row.reviewKind === "unknown_supplement" &&
      visibleReview.row.itemType === "supplement" ? (
        <SupplementDetailsModal
          accessToken={accessToken}
          associatedSupplementId={visibleReview.associatedSupplementId}
          associationOptions={supplementsData.rows}
          draft={visibleReview.draft}
          error={errorReviewId === visibleReview.draft.id}
          headerNote={visibleReview.queuedLabel}
          labels={labels}
          locale={locale}
          onAssociateSupplement={(supplementId) =>
            setSelectedReview((currentReview) =>
              currentReview
                ? {
                    ...currentReview,
                    associatedSupplementId: supplementId
                  }
                : currentReview
            )
          }
          onChange={(patch) =>
            setSelectedReview((currentReview) =>
              currentReview
                ? {
                    ...currentReview,
                    draft: { ...currentReview.draft, ...patch }
                  }
                : currentReview
            )
          }
          onClose={closeReviewModal}
          onSave={() =>
            void saveReview(
              visibleReview.draft,
              visibleReview.associatedSupplementId
            )
          }
          saving={savingReviewId === visibleReview.draft.id}
        />
      ) : visibleReview ? (
        <PlanSafetyReviewModal
          key={visibleReview.row.id}
          accessToken={accessToken}
          error={errorReviewId === visibleReview.row.id}
          labels={labels}
          locale={locale}
          onClose={closeReviewModal}
          onDecision={(
            decision,
            clientDoseAmount,
            clientDoseUnit,
            reviewerNote,
            foodDetails
          ) =>
            void decidePlanReview(
              visibleReview.row,
              decision,
              clientDoseAmount,
              clientDoseUnit,
              reviewerNote,
              foodDetails
            )
          }
          row={visibleReview.row}
          saving={savingReviewId === visibleReview.row.id}
        />
      ) : null}
    </section>
  );
}
