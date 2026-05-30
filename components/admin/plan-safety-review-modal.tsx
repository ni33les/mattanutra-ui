"use client";

import { useState } from "react";
import type { AdminReviewTaskRow } from "@/lib/admin-review-queue";
import { supplementDoseUnits } from "@/lib/supplement-dose-units";
import type { Locale } from "@/lib/i18n";
import {
  foodReviewSuggestionTimeoutMs,
  type AdminContent,
} from "@/components/admin/dashboard-content";
import {
  PlanIdLink,
  adminLocaleTextClass,
  classNames,
  formatGeneratedAt,
} from "@/components/admin/dashboard-shared";
import { SupplementListMeta } from "@/components/admin/supplement-view";
import { AdminModal } from "@/components/admin/ui";
import {
  formatReviewQueueDose,
  localizedReviewDraft,
  localizedReviewValue,
  type FoodReviewDraftFields,
} from "@/components/admin/review-queue-helpers";

export function PlanSafetyReviewModal({
  accessToken,
  displayName,
  error,
  labels,
  locale,
  onClose,
  onDecision,
  row,
  saving,
}: Readonly<{
  accessToken: string;
  displayName: string;
  error: boolean;
  labels: AdminContent;
  locale: Locale;
  onClose: () => void;
  onDecision: (
    decision: "approve" | "disapprove",
    clientDoseAmount: number | null,
    clientDoseUnit: string,
    reviewerNote: string | null,
    foodDetails?: FoodReviewDraftFields | null,
  ) => void;
  row: AdminReviewTaskRow;
  saving: boolean;
}>) {
  const [clientDoseAmount, setClientDoseAmount] = useState<number | null>(
    row.clientDoseAmount,
  );
  const [clientDoseUnit, setClientDoseUnit] = useState(
    row.clientDoseUnit ?? "",
  );
  const [foodFrequency, setFoodFrequency] = useState(
    localizedReviewValue(row.foodFrequency, locale),
  );
  const [foodRationale, setFoodRationale] = useState(
    localizedReviewValue(row.foodRationale, locale),
  );
  const [foodServing, setFoodServing] = useState(
    localizedReviewValue(row.foodServing, locale),
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
    (clientDoseAmount !== null &&
      Number.isFinite(clientDoseAmount) &&
      clientDoseAmount > 0 &&
      clientDoseUnit.trim() !== "");
  const foodDetails = foodReview
    ? {
        frequency: localizedReviewDraft(
          foodFrequency,
          locale,
          row.foodFrequency,
        ),
        rationale: localizedReviewDraft(
          foodRationale,
          locale,
          row.foodRationale,
        ),
        serving: localizedReviewDraft(foodServing, locale, row.foodServing),
      }
    : null;

  async function suggestFoodReviewDetails() {
    setSuggestingFoodReview(true);
    setSuggestFoodReviewError(false);
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      foodReviewSuggestionTimeoutMs,
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
          reviewKind: row.reviewKind,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
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
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5 pr-14">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{displayName}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span>{formatGeneratedAt(row.queuedAt, locale)}</span>
            <span
              className={classNames(
                "rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600",
                locale === "en"
                  ? "uppercase tracking-[0.08em]"
                  : adminLocaleTextClass(locale, "label"),
              )}
            >
              {row.itemType === "food"
                ? labels.reviewQueue.foodItem
                : labels.reviewQueue.suppItem}
            </span>
          </div>
        </div>
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
              {row.flagReason || labels.reviewQueue.foodReviewHint}
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
                    locale,
                  )
                }
              />
              <SupplementListMeta
                label={labels.supplements.maxAmount}
                value={formatReviewQueueDose(
                  row.limitAmount ?? row.maxAmount,
                  row.limitUnit ?? row.maxUnit,
                  locale,
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
                    !doseValid ? "ring-red-300 focus:ring-red-500" : "",
                  )}
                  min="0"
                  onChange={(event) =>
                    setClientDoseAmount(
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
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
                    !doseValid ? "ring-red-300 focus:ring-red-500" : "",
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
              className="inline-flex min-h-9 items-center justify-center rounded-md bg-[#3A7BD5] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2F67B8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3A7BD5] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving || suggestingFoodReview}
              onClick={() => void suggestFoodReviewDetails()}
              title={labels.reviewQueue.suggestFoodReview}
              type="button"
            >
              {labels.reviewQueue.suggestFoodReview}
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
                foodReview ? foodDetails : null,
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
                foodReview ? foodDetails : null,
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
