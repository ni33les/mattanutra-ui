"use client";

import { useState, type ReactNode } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { ChevronDownIcon as ChevronDownSolidIcon } from "@heroicons/react/20/solid";
import type {
  AdminFoodRow,
  AdminFoodsData,
  FoodConfidence,
  FoodListStatus
} from "@/lib/admin-foods";
import { foodNutrientCatalog } from "@/lib/food-nutrients";
import {
  foodBenefitTags,
  foodNutrientTags,
  foodTagLabel
} from "@/lib/food-tags";
import type { Locale } from "@/lib/i18n";
import {
  foodReviewSuggestionTimeoutMs,
  type AdminContent
} from "@/components/admin/dashboard-content";
import {
  BusinessStatsGrid,
  businessMetricColors,
  classNames,
  foodConfidences,
  foodListStatuses,
  formatLocale,
  readableToken,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";
import {
  defaultServingValue,
  foodAdminLabels,
  foodSearchText,
  foodStatusClass,
  foodStatusLabel,
  formatFoodFlags,
  formatFoodTags,
  listStatusSummary,
  nutrientProfileSummary,
  safetyMetric,
  toggleFoodTag,
  updateFoodNutrientProfileValue
} from "@/components/admin/safety-view-helpers";
import { SupplementListMeta } from "@/components/admin/supplement-view";

export { AdminProductsView } from "@/components/admin/product-view";
export { SupplementListMeta } from "@/components/admin/supplement-view";

export function AdminFoodsView({
  accessToken,
  data,
  locale
}: Readonly<{
  accessToken: string;
  data: AdminFoodsData;
  locale: Locale;
}>) {
  const labels = foodAdminLabels(locale);
  const [rows, setRows] = useState(data.rows);
  const [category, setCategory] = useState("");
  const [draft, setDraft] = useState<AdminFoodRow | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const summary = listStatusSummary(rows);
  const filteredRows = rows.filter((row) => {
    const matchesSearch =
      !normalizedSearch || foodSearchText(row).includes(normalizedSearch);
    const matchesCategory = !category || row.category === category;
    const matchesStatus = !status || row.listStatus === status;

    return matchesSearch && matchesCategory && matchesStatus;
  });
  const foodMetrics: BusinessMetric[] = [
    safetyMetric({
      color: businessMetricColors.total,
      id: "foodsTotal",
      label: labels.total,
      locale,
      value: summary.total
    }),
    safetyMetric({
      color: businessMetricColors.succeeded,
      id: "foodsWhitelisted",
      label: labels.whitelisted,
      locale,
      value: summary.whitelisted
    }),
    safetyMetric({
      color: businessMetricColors.pendingReviews,
      id: "foodsReviewRequired",
      label: labels.reviewRequired,
      locale,
      value: summary.reviewRequired
    }),
    safetyMetric({
      color: businessMetricColors.failed,
      id: "foodsBlacklisted",
      label: labels.blacklisted,
      locale,
      value: summary.blacklisted
    }),
    safetyMetric({
      color: businessMetricColors.offline,
      id: "foodsInactive",
      label: labels.inactive,
      locale,
      value: summary.inactive
    })
  ];

  function syncRow(row: AdminFoodRow) {
    setRows((currentRows) =>
      currentRows.map((item) => (item.id === row.id ? row : item))
    );
    setDraft((currentDraft) =>
      currentDraft?.id === row.id ? row : currentDraft
    );
  }

  async function saveRow(row: AdminFoodRow): Promise<boolean> {
    setSavingId(row.id);
    setErrorId(null);

    try {
      const response = await fetch(`/api/admin/foods/${row.id}`, {
        body: JSON.stringify({
          accessToken,
          benefitTags: row.benefitTags,
          confidence: row.confidence,
          defaultServing: row.defaultServing,
          listStatus: row.listStatus,
          nutrientProfile: row.nutrientProfile,
          nutrientTags: row.nutrientTags,
          safetyNotes: row.safetyNotes
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });

      if (!response.ok) {
        throw new Error("Unable to save food");
      }

      const payload = (await response.json()) as { row?: AdminFoodRow };

      syncRow(payload.row ?? row);
      return true;
    } catch {
      setErrorId(row.id);
      return false;
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="mt-8 space-y-6">
      <BusinessStatsGrid metrics={foodMetrics} />

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_14rem_14rem]">
          <input
            aria-label={labels.search}
            className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={labels.search}
            type="search"
            value={search}
          />
          <select
            aria-label={labels.category}
            className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) => setCategory(event.target.value)}
            value={category}
          >
            <option value="">{labels.allCategories}</option>
            {data.categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            aria-label={labels.status}
            className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="">{labels.allStatuses}</option>
            {foodListStatuses.map((item) => (
              <option key={item} value={item}>
                {foodStatusLabel(labels, item)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredRows.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filteredRows.map((row) => (
            <button
              key={row.id}
              aria-label={`${labels.details}: ${row.name}`}
              className="rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A]"
              onClick={() => {
                setDraft(row);
                setErrorId(null);
              }}
              type="button"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-gray-900">
                    {row.name}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">{row.category}</p>
                </div>
                <span
                  className={classNames(
                    foodStatusClass(row.listStatus),
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                  )}
                >
                  {foodStatusLabel(labels, row.listStatus)}
                </span>
              </div>

              {row.primaryUseCase ? (
                <p className="mt-4 line-clamp-2 min-h-12 text-sm leading-6 text-gray-600">
                  {row.primaryUseCase}
                </p>
              ) : (
                <div className="mt-4 min-h-12" />
              )}

              {row.aliases.length > 0 ? (
                <div className="mt-4 flex min-h-6 flex-wrap gap-1.5">
                  {row.aliases.map((alias) => (
                    <span
                      className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100"
                      key={alias}
                    >
                      {alias}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-4 min-h-6" />
              )}

              <div className="mt-4 flex min-h-6 flex-wrap gap-1.5">
                {[...row.benefitTags, ...row.nutrientTags].slice(0, 5).map((tag) => (
                  <span
                    className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-sky-100"
                    key={tag}
                  >
                    {foodTagLabel(tag)}
                  </span>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SupplementListMeta
                  label={labels.category}
                  value={row.category}
                />
                <SupplementListMeta
                  label={labels.confidence}
                  value={readableToken(row.confidence)}
                />
                <SupplementListMeta
                  label={labels.defaultServing}
                  value={defaultServingValue(row)}
                />
                <SupplementListMeta
                  label={labels.nutrientProfile}
                  value={nutrientProfileSummary(row)}
                />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-white px-5 py-12 text-center text-sm font-medium text-gray-500 shadow-sm ring-1 ring-gray-200">
          {labels.empty}
        </div>
      )}

      {draft ? (
        <FoodDetailsModal
          draft={draft}
          error={errorId === draft.id}
          labels={labels}
          onChange={(patch) =>
            setDraft((currentDraft) =>
              currentDraft ? { ...currentDraft, ...patch } : currentDraft
            )
          }
          onClose={() => {
            if (savingId !== draft.id) {
              setDraft(null);
              setErrorId(null);
            }
          }}
          onSave={() => {
            void saveRow(draft).then((saved) => {
              if (saved) {
                setDraft(null);
              }
            });
          }}
          saving={savingId === draft.id}
        />
      ) : null}
    </section>
  );
}

function FoodDetailsModal({
  draft,
  error,
  labels,
  onChange,
  onClose,
  onSave,
  saving
}: Readonly<{
  draft: AdminFoodRow;
  error: boolean;
  labels: ReturnType<typeof foodAdminLabels>;
  onChange: (patch: Partial<AdminFoodRow>) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}>) {
  const inputClass =
    "rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <button
        aria-label={labels.close}
        className="fixed inset-0 cursor-default bg-gray-900/40"
        onClick={onClose}
        type="button"
      />
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <section
          aria-modal={true}
          className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-900/10"
          role="dialog"
        >
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {draft.name}
              </h2>
              <p className="mt-1 text-sm text-gray-500">{draft.category}</p>
            </div>
            <button
              aria-label={labels.close}
              className="rounded-md p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A]"
              onClick={onClose}
              type="button"
            >
              <XMarkIcon aria-hidden={true} className="size-5" />
            </button>
          </div>

          <div className="max-h-[75vh] space-y-6 overflow-y-auto px-6 py-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <SupplementListMeta
                label={labels.category}
                value={draft.category}
              />
              <SupplementListMeta
                label={labels.confidence}
                value={readableToken(draft.confidence)}
              />
              <SupplementListMeta
                label={labels.status}
                value={foodStatusLabel(labels, draft.listStatus)}
              />
              <SupplementListMeta
                label={labels.defaultServing}
                value={defaultServingValue(draft)}
              />
              <SupplementListMeta
                label={labels.allergenFlags}
                value={formatFoodFlags(labels, draft.allergenFlags)}
              />
              <SupplementListMeta
                label={labels.conditionFlags}
                value={formatFoodFlags(labels, draft.conditionFlags)}
              />
              <SupplementListMeta
                label={labels.benefits}
                value={formatFoodTags(labels, draft.benefitTags)}
              />
              <SupplementListMeta
                label={labels.nutrients}
                value={formatFoodTags(labels, draft.nutrientTags)}
              />
              <SupplementListMeta
                label={labels.nutrientProfile}
                value={nutrientProfileSummary(draft)}
              />
            </div>

            {draft.primaryUseCase ? (
              <div className="rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700 ring-1 ring-gray-100">
                {draft.primaryUseCase}
              </div>
            ) : null}

            {draft.aliases.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                  {labels.aliases}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {draft.aliases.map((alias) => (
                    <span
                      className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100"
                      key={alias}
                    >
                      {alias}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                {labels.status}
                <select
                  className={classNames(
                    foodStatusClass(draft.listStatus),
                    "rounded-md px-3 py-2 text-sm font-semibold ring-1 outline-none focus:ring-2 focus:ring-[#1FA77A]"
                  )}
                  onChange={(event) =>
                    onChange({
                      listStatus: event.target.value as FoodListStatus
                    })
                  }
                  value={draft.listStatus}
                >
                  {foodListStatuses.map((item) => (
                    <option key={item} value={item}>
                      {foodStatusLabel(labels, item)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                {labels.confidence}
                <select
                  className={inputClass}
                  onChange={(event) =>
                    onChange({
                      confidence: event.target.value as FoodConfidence
                    })
                  }
                  value={draft.confidence}
                >
                  {foodConfidences.map((item) => (
                    <option key={item} value={item}>
                      {readableToken(item)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                {labels.defaultServing}
                <input
                  className={inputClass}
                  onChange={(event) =>
                    onChange({
                      defaultServing: {
                        grams: draft.defaultServing?.grams ?? 100,
                        isDefault: true,
                        label: event.target.value,
                        source: draft.defaultServing?.source ?? "admin"
                      }
                    })
                  }
                  value={draft.defaultServing?.label ?? ""}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                {labels.grams}
                <input
                  className={inputClass}
                  min={0.1}
                  onChange={(event) =>
                    onChange({
                      defaultServing: {
                        grams: Math.max(0.1, Number(event.target.value) || 0.1),
                        isDefault: true,
                        label: draft.defaultServing?.label || "Serving",
                        source: draft.defaultServing?.source ?? "admin"
                      }
                    })
                  }
                  step={0.1}
                  type="number"
                  value={draft.defaultServing?.grams ?? ""}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <fieldset className="rounded-xl bg-white p-3 ring-1 ring-gray-200">
                <legend className="px-1 text-sm font-semibold text-gray-700">
                  {labels.benefits}
                </legend>
                <div className="mt-3 grid gap-2">
                  {foodBenefitTags.map((tag) => (
                    <label
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      key={tag}
                    >
                      <input
                        checked={draft.benefitTags.includes(tag)}
                        className="size-4 rounded border-gray-300 text-[#1FA77A] focus:ring-[#1FA77A]"
                        onChange={() =>
                          onChange({
                            benefitTags: toggleFoodTag(draft.benefitTags, tag)
                          })
                        }
                        type="checkbox"
                      />
                      {foodTagLabel(tag)}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="rounded-xl bg-white p-3 ring-1 ring-gray-200">
                <legend className="px-1 text-sm font-semibold text-gray-700">
                  {labels.nutrients}
                </legend>
                <div className="mt-3 grid gap-2">
                  {foodNutrientTags.map((tag) => (
                    <label
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      key={tag}
                    >
                      <input
                        checked={draft.nutrientTags.includes(tag)}
                        className="size-4 rounded border-gray-300 text-[#1FA77A] focus:ring-[#1FA77A]"
                        onChange={() =>
                          onChange({
                            nutrientTags: toggleFoodTag(draft.nutrientTags, tag)
                          })
                        }
                        type="checkbox"
                      />
                      {foodTagLabel(tag)}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <fieldset className="rounded-xl bg-white p-3 ring-1 ring-gray-200">
              <legend className="px-1 text-sm font-semibold text-gray-700">
                {labels.nutrientProfile}
              </legend>
              <div className="mt-3 space-y-5">
                {[...new Set(foodNutrientCatalog.map((item) => item.category))].map(
                  (categoryName) => {
                    const nutrients = draft.nutrientProfile.filter(
                      (nutrient) => nutrient.category === categoryName
                    );

                    return (
                      <div key={categoryName}>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                          {categoryName}
                        </p>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {nutrients.map((nutrient) => (
                            <label
                              className="grid gap-1 text-xs font-semibold text-gray-600"
                              key={nutrient.nutrientId}
                            >
                              {nutrient.label} ({nutrient.unit})
                              <input
                                className={classNames(inputClass, "text-right")}
                                min={0}
                                onChange={(event) =>
                                  onChange({
                                    nutrientProfile: updateFoodNutrientProfileValue(
                                      draft.nutrientProfile,
                                      nutrient.nutrientId,
                                      event.target.value
                                    )
                                  })
                                }
                                step="any"
                                type="number"
                                value={nutrient.amountPer100g ?? ""}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </fieldset>

            <label className="grid gap-2 text-sm font-medium text-gray-700">
              {labels.safetyNotes}
              <textarea
                className={classNames(inputClass, "min-h-28")}
                onChange={(event) =>
                  onChange({
                    safetyNotes: event.target.value
                  })
                }
                value={draft.safetyNotes ?? ""}
              />
            </label>

            {error ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
                {labels.updateError}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
            <button
              className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
              disabled={saving}
              onClick={onClose}
              type="button"
            >
              {labels.close}
            </button>
            <button
              className="rounded-md bg-[#126B4F] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0F5A43] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              onClick={onSave}
              type="button"
            >
              {saving ? `${labels.save}...` : labels.save}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export { AdminSupplementsView } from "@/components/admin/supplement-view";
export { AdminReviewQueueView } from "@/components/admin/review-queue-view";
