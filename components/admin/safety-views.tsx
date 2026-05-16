"use client";

import { useState, type ReactNode } from "react";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions
} from "@headlessui/react";
import { SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { ChevronDownIcon as ChevronDownSolidIcon } from "@heroicons/react/20/solid";
import type {
  AdminReviewLocalizedText,
  AdminReviewQueueData,
  AdminReviewTaskRow
} from "@/lib/admin-review-queue";
import type {
  AdminSupplementRow,
  AdminSupplementsData,
  SupplementConfidence,
  SupplementListStatus
} from "@/lib/admin-supplements";
import {
  supplementSafetyFlags,
  type SupplementSafetyFlag
} from "@/lib/supplement-safety-flags";
import { supplementDoseUnits } from "@/lib/supplement-dose-units";
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
  supplementDoseSuggestionTimeoutMs,
  type AdminContent
} from "@/components/admin/dashboard-content";
import {
  BusinessStatsGrid,
  PlanIdLink,
  ReviewAgeTimer,
  businessMetricColors,
  classNames,
  foodConfidences,
  foodListStatuses,
  formatGeneratedAt,
  formatLocale,
  readableToken,
  supplementConfidences,
  supplementListStatuses,
  taskStatusClass,
  taskValueClass,
  taskValueLabel,
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
  formatSupplementSafetyFlags,
  listStatusSummary,
  nutrientProfileSummary,
  safetyMetric,
  supplementSafetyFlagLabel,
  supplementSearchText,
  supplementStatusClass,
  supplementStatusLabel,
  toggleFoodTag,
  toggleSupplementSafetyFlag,
  updateFoodNutrientProfileValue
} from "@/components/admin/safety-view-helpers";

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

export function AdminSupplementsView({
  accessToken,
  data,
  labels,
  locale
}: Readonly<{
  accessToken: string;
  data: AdminSupplementsData;
  labels: AdminContent;
  locale: Locale;
}>) {
  const [rows, setRows] = useState(data.rows);
  const [category, setCategory] = useState("");
  const [deletingAliasId, setDeletingAliasId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminSupplementRow | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const summary = listStatusSummary(rows);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    const matchesSearch =
      !normalizedSearch ||
      supplementSearchText(labels, row).includes(normalizedSearch);
    const matchesCategory = !category || row.category === category;
    const matchesStatus = !status || row.listStatus === status;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  function syncRow(row: AdminSupplementRow) {
    setRows((currentRows) =>
      currentRows.map((item) => (item.id === row.id ? row : item))
    );
    setDraft((currentDraft) =>
      currentDraft?.id === row.id ? row : currentDraft
    );
  }

  async function saveRow(row: AdminSupplementRow): Promise<boolean> {
    setSavingId(row.id);
    setErrorId(null);

    try {
      const response = await fetch(`/api/admin/supplements/${row.id}`, {
        body: JSON.stringify({
          accessToken,
          confidence: row.confidence,
          listStatus: row.listStatus,
          maxAmount: row.maxAmount,
          maxUnit: row.maxUnit,
          safetyFlags: row.safetyFlags,
          safetyNotes: row.safetyNotes
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });

      if (!response.ok) {
        throw new Error("Unable to save supplement");
      }

      const payload = (await response.json()) as { row?: AdminSupplementRow };

      syncRow(payload.row ?? row);
      return true;
    } catch {
      setErrorId(row.id);
      return false;
    } finally {
      setSavingId(null);
    }
  }

  async function deleteAssociation(row: AdminSupplementRow, aliasId: string) {
    setDeletingAliasId(aliasId);
    setErrorId(null);

    try {
      const response = await fetch(
        `/api/admin/supplements/${row.id}/aliases/${aliasId}`,
        {
          body: JSON.stringify({ accessToken }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "DELETE"
        }
      );

      if (!response.ok) {
        throw new Error("Unable to delete supplement association");
      }

      const payload = (await response.json()) as { row?: AdminSupplementRow };

      if (payload.row) {
        syncRow(payload.row);
      }
    } catch {
      setErrorId(row.id);
    } finally {
      setDeletingAliasId(null);
    }
  }

  const supplementMetrics: BusinessMetric[] = [
    safetyMetric({
      color: businessMetricColors.total,
      id: "supplementsTotal",
      label: labels.supplements.total,
      locale,
      value: summary.total
    }),
    safetyMetric({
      color: businessMetricColors.succeeded,
      id: "supplementsWhitelisted",
      label: labels.supplements.whitelisted,
      locale,
      value: summary.whitelisted
    }),
    safetyMetric({
      color: businessMetricColors.pendingReviews,
      id: "supplementsReviewRequired",
      label: labels.supplements.reviewRequired,
      locale,
      value: summary.reviewRequired
    }),
    safetyMetric({
      color: businessMetricColors.failed,
      id: "supplementsBlacklisted",
      label: labels.supplements.blacklisted,
      locale,
      value: summary.blacklisted
    }),
    safetyMetric({
      color: businessMetricColors.offline,
      id: "supplementsInactive",
      label: labels.supplements.inactive,
      locale,
      value: summary.inactive
    })
  ];

  return (
    <section className="mt-8 space-y-6">
      <BusinessStatsGrid metrics={supplementMetrics} />

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_14rem_14rem]">
          <input
            aria-label={labels.supplements.search}
            className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={labels.supplements.search}
            type="search"
            value={search}
          />
          <select
            aria-label={labels.supplements.category}
            className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) => setCategory(event.target.value)}
            value={category}
          >
            <option value="">{labels.supplements.allCategories}</option>
            {data.categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            aria-label={labels.supplements.status}
            className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="">{labels.supplements.allStatuses}</option>
            {supplementListStatuses.map((item) => (
              <option key={item} value={item}>
                {supplementStatusLabel(labels, item)}
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
              aria-label={`${labels.supplements.details}: ${row.name}`}
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
                  <p className="mt-1 text-sm text-gray-500">
                    {row.ingredientType ?? row.category}
                  </p>
                </div>
                <span
                  className={classNames(
                    supplementStatusClass(row.listStatus),
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
                  )}
                >
                  {supplementStatusLabel(labels, row.listStatus)}
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
                      key={alias.id}
                    >
                      {alias.name}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-4 min-h-6" />
              )}

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <SupplementListMeta
                  label={labels.supplements.category}
                  value={row.category}
                />
                <SupplementListMeta
                  label={labels.supplements.dose}
                  value={formatSupplementDose(row, locale)}
                />
                <SupplementListMeta
                  label={labels.supplements.safetyFlag}
                  value={formatSupplementSafetyFlags(labels, row.safetyFlags)}
                />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-white px-5 py-12 text-center text-sm font-medium text-gray-500 shadow-sm ring-1 ring-gray-200">
            {labels.supplements.empty}
        </div>
      )}

      {draft ? (
        <SupplementDetailsModal
          accessToken={accessToken}
          draft={draft}
          error={errorId === draft.id}
          labels={labels}
          locale={locale}
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
          onDeleteAssociation={(aliasId) => void deleteAssociation(draft, aliasId)}
          onSave={() => {
            void saveRow(draft).then((saved) => {
              if (saved) {
                setDraft(null);
              }
            });
          }}
          saving={savingId === draft.id}
          deletingAssociationId={deletingAliasId}
        />
      ) : null}
    </section>
  );
}

function formatSupplementDose(row: AdminSupplementRow, locale: Locale) {
  if (row.maxAmount === null && !row.maxUnit) {
    return "";
  }

  const amount =
    row.maxAmount === null
      ? ""
      : new Intl.NumberFormat(formatLocale(locale), {
          maximumFractionDigits: 2
        }).format(row.maxAmount);

  return row.maxUnit ? [amount, row.maxUnit].filter(Boolean).join(" ") : amount;
}

export function SupplementListMeta({
  label,
  value
}: Readonly<{
  label: string;
  value: ReactNode;
}>) {
  const hasValue = value !== null && value !== undefined && value !== "";

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-gray-900">
        {hasValue ? value : ""}
      </p>
    </div>
  );
}

function SupplementDetailsModal({
  accessToken,
  associatedSupplementId,
  associationOptions,
  deletingAssociationId,
  draft,
  error,
  headerNote,
  labels,
  locale,
  onAssociateSupplement,
  onChange,
  onClose,
  onDeleteAssociation,
  onSave,
  saving
}: Readonly<{
  accessToken: string;
  associatedSupplementId?: string;
  associationOptions?: AdminSupplementRow[];
  deletingAssociationId?: string | null;
  draft: AdminSupplementRow;
  error: boolean;
  headerNote?: string | null;
  labels: AdminContent;
  locale: Locale;
  onAssociateSupplement?: (supplementId: string) => void;
  onChange: (patch: Partial<AdminSupplementRow>) => void;
  onClose: () => void;
  onDeleteAssociation?: (aliasId: string) => void;
  onSave: () => void;
  saving: boolean;
}>) {
  const [suggestingDose, setSuggestingDose] = useState(false);
  const [suggestDoseError, setSuggestDoseError] = useState(false);
  const inputClass =
    "rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]";
  const associationLocked = Boolean(associatedSupplementId);
  const associationEnabled =
    Boolean(onAssociateSupplement) && Boolean(associationOptions?.length);
  const doseRequired =
    draft.listStatus === "review_required" || draft.listStatus === "whitelisted";
  const doseValid =
    !doseRequired ||
    (draft.maxAmount !== null &&
      Number.isFinite(draft.maxAmount) &&
      draft.maxAmount > 0 &&
      draft.maxUnit.trim() !== "");
  const unitOptions =
    draft.maxUnit &&
    !(supplementDoseUnits as readonly string[]).includes(draft.maxUnit)
      ? [draft.maxUnit, ...supplementDoseUnits]
      : supplementDoseUnits;

  async function suggestDose() {
    setSuggestingDose(true);
    setSuggestDoseError(false);
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      supplementDoseSuggestionTimeoutMs
    );

    try {
      const response = await fetch("/api/admin/supplements/suggest-dose", {
        body: JSON.stringify({
          accessToken,
          category: draft.category,
          confidence: draft.confidence,
          currentMaxAmount: draft.maxAmount,
          currentMaxUnit: draft.maxUnit,
          listStatus: draft.listStatus,
          primaryUseCase: draft.primaryUseCase,
          safetyFlags: draft.safetyFlags,
          safetyNotes: draft.safetyNotes,
          supplementName: draft.name
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error("Unable to suggest supplement dose");
      }

      const payload = (await response.json()) as {
        suggestion?: {
          confidence?: SupplementConfidence;
          listStatus?: SupplementListStatus;
          maxAmount?: number | null;
          maxUnit?: string;
          safetyFlags?: SupplementSafetyFlag[];
          safetyNotes?: string;
        };
      };
      const suggestion = payload.suggestion;
      const suggestedStatus = suggestion?.listStatus ?? draft.listStatus;
      const suggestedMaxAmount = suggestion?.maxAmount;
      const suggestedMaxUnit = suggestion?.maxUnit;
      const suggestedDoseRequired =
        suggestedStatus === "review_required" ||
        suggestedStatus === "whitelisted";

      if (
        !suggestion ||
        (suggestedDoseRequired &&
          (typeof suggestedMaxAmount !== "number" ||
            !Number.isFinite(suggestedMaxAmount) ||
            suggestedMaxAmount <= 0 ||
            typeof suggestedMaxUnit !== "string" ||
            !suggestedMaxUnit.trim())) ||
        (!suggestedDoseRequired &&
          suggestedMaxAmount !== null &&
          suggestedMaxAmount !== undefined &&
          (typeof suggestedMaxAmount !== "number" ||
            !Number.isFinite(suggestedMaxAmount))) ||
        (suggestedMaxUnit !== undefined && typeof suggestedMaxUnit !== "string")
      ) {
        throw new Error("Invalid supplement dose suggestion");
      }

      onChange({
        confidence: suggestion.confidence ?? draft.confidence,
        listStatus: suggestedStatus,
        maxAmount:
          suggestedMaxAmount === null
            ? null
            : typeof suggestedMaxAmount === "number"
              ? suggestedMaxAmount
              : draft.maxAmount,
        maxUnit:
          typeof suggestedMaxUnit === "string"
            ? suggestedMaxUnit
            : draft.maxUnit,
        safetyFlags: Array.isArray(suggestion.safetyFlags)
          ? suggestion.safetyFlags
          : draft.safetyFlags,
        safetyNotes:
          typeof suggestion.safetyNotes === "string" &&
          suggestion.safetyNotes.trim()
            ? suggestion.safetyNotes.trim()
            : draft.safetyNotes
      });
    } catch (suggestionError) {
      console.error("Unable to suggest supplement details", suggestionError);
      setSuggestDoseError(true);
    } finally {
      window.clearTimeout(timeout);
      setSuggestingDose(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <button
        aria-label={labels.supplements.close}
        className="fixed inset-0 cursor-default bg-gray-900/40"
        onClick={onClose}
        type="button"
      />
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <section
          aria-modal={true}
          className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-900/10"
          role="dialog"
        >
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {draft.name}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {draft.ingredientType ?? draft.category}
              </p>
              {headerNote ? (
                <p className="mt-1 text-sm text-gray-500">{headerNote}</p>
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <SupplementListMeta
                label={labels.supplements.category}
                value={draft.category}
              />
              <SupplementListMeta
                label={labels.supplements.dose}
                value={formatSupplementDose(draft, locale)}
              />
              <SupplementListMeta
                label={labels.supplements.confidence}
                value={draft.confidence}
              />
              <SupplementListMeta
                label={labels.supplements.safetyFlag}
                value={formatSupplementSafetyFlags(labels, draft.safetyFlags)}
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
                  {labels.supplements.associations}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {draft.aliases.map((alias) => (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100"
                      key={alias.id}
                    >
                      {alias.name}
                      {onDeleteAssociation ? (
                        <button
                          aria-label={`${labels.supplements.removeAssociation}: ${alias.name}`}
                          className="rounded-full p-0.5 text-emerald-500 hover:bg-white hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                          disabled={deletingAssociationId === alias.id}
                          onClick={() => onDeleteAssociation(alias.id)}
                          type="button"
                        >
                          <XMarkIcon aria-hidden={true} className="size-3.5" />
                        </button>
                      ) : null}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {associationEnabled ? (
              <SupplementAssociationPicker
                labels={labels}
                locale={locale}
                onSelect={(supplementId) =>
                  onAssociateSupplement?.(supplementId)
                }
                options={associationOptions ?? []}
                selectedId={associatedSupplementId ?? ""}
              />
            ) : null}

            <fieldset
              className={classNames(
                "space-y-6 transition-opacity",
                associationLocked ? "opacity-40" : ""
              )}
              disabled={associationLocked}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-gray-700">
                  {labels.supplements.status}
                  <select
                    className={classNames(
                      supplementStatusClass(draft.listStatus),
                      "rounded-md px-3 py-2 text-sm font-semibold ring-1 outline-none focus:ring-2 focus:ring-[#1FA77A]"
                    )}
                    onChange={(event) =>
                      onChange({
                        listStatus: event.target.value as SupplementListStatus
                      })
                    }
                    value={draft.listStatus}
                  >
                    {supplementListStatuses.map((item) => (
                      <option key={item} value={item}>
                        {supplementStatusLabel(labels, item)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-medium text-gray-700">
                  {labels.supplements.confidence}
                  <select
                    className={inputClass}
                    onChange={(event) =>
                      onChange({
                        confidence: event.target.value as SupplementConfidence
                      })
                    }
                    value={draft.confidence}
                  >
                    {supplementConfidences.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-medium text-gray-700">
                  {labels.supplements.maxAmount}
                  <input
                    aria-invalid={doseRequired && !doseValid}
                    className={classNames(
                      inputClass,
                      doseRequired && !doseValid
                        ? "ring-red-300 focus:ring-red-500"
                        : ""
                    )}
                    min="0"
                    onChange={(event) =>
                      onChange({
                        maxAmount:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value)
                      })
                    }
                    step="any"
                    type="number"
                    value={draft.maxAmount ?? ""}
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium text-gray-700">
                  {labels.supplements.maxUnit}
                  <select
                    aria-invalid={doseRequired && !doseValid}
                    className={classNames(
                      inputClass,
                      doseRequired && !doseValid
                        ? "ring-red-300 focus:ring-red-500"
                        : ""
                    )}
                    onChange={(event) =>
                      onChange({ maxUnit: event.target.value })
                    }
                    value={draft.maxUnit}
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

              <div className="grid gap-2 text-sm font-medium text-gray-700">
                {labels.supplements.safetyFlag}
                <details className="rounded-xl bg-white ring-1 ring-gray-200">
                  <summary className="cursor-pointer list-none px-3 py-2 text-sm text-gray-900 outline-none marker:hidden">
                    <span className="font-normal">
                      {formatSupplementSafetyFlags(labels, draft.safetyFlags)}
                    </span>
                  </summary>
                  <div className="grid gap-2 border-t border-gray-100 p-3 sm:grid-cols-2">
                    <label className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      <input
                        checked={draft.safetyFlags.length === 0}
                        className="size-4 rounded border-gray-300 text-[#1FA77A] focus:ring-[#1FA77A]"
                        onChange={(event) => {
                          if (event.target.checked) {
                            onChange({ safetyFlags: [] });
                          }
                        }}
                        type="checkbox"
                      />
                      {labels.supplements.none}
                    </label>
                    {supplementSafetyFlags.map((flag) => (
                      <label
                        key={flag}
                        className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <input
                          checked={draft.safetyFlags.includes(flag)}
                          className="size-4 rounded border-gray-300 text-[#1FA77A] focus:ring-[#1FA77A]"
                          onChange={() =>
                            onChange({
                              safetyFlags: toggleSupplementSafetyFlag(
                                draft.safetyFlags,
                                flag
                              )
                            })
                          }
                          type="checkbox"
                        />
                        {supplementSafetyFlagLabel(labels, flag)}
                      </label>
                    ))}
                  </div>
                </details>
              </div>

              <label className="grid gap-2 text-sm font-medium text-gray-700">
                {labels.supplements.safetyNotes}
                <textarea
                  className={classNames(inputClass, "min-h-32 resize-y")}
                  onChange={(event) =>
                    onChange({ safetyNotes: event.target.value })
                  }
                  value={draft.safetyNotes ?? ""}
                />
              </label>
            </fieldset>

            {!associationLocked && !doseValid ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
                {labels.supplements.doseValidationError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                aria-label={labels.supplements.suggestDose}
                className="inline-flex size-9 items-center justify-center rounded-md bg-[#3A7BD5] text-white shadow-sm transition hover:bg-[#2F67B8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3A7BD5] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={suggestingDose || associationLocked}
                onClick={() => void suggestDose()}
                title={labels.supplements.suggestDose}
                type="button"
              >
                <SparklesIcon
                  aria-hidden={true}
                  className={classNames(
                    "size-5",
                    suggestingDose ? "animate-pulse" : ""
                  )}
                />
              </button>
              {suggestingDose ? (
                <p className="text-sm font-medium text-[#3A7BD5]">
                  {labels.supplements.suggestDoseBusy}
                </p>
              ) : null}
              {suggestDoseError ? (
                <p className="text-sm font-medium text-red-600">
                  {labels.supplements.suggestDoseError}
                </p>
              ) : null}
              {error ? (
                <p className="text-sm font-medium text-red-600">
                  {labels.supplements.updateError}
                </p>
              ) : null}
            </div>
            <div className="flex gap-3">
              <button
                className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
                onClick={onClose}
                type="button"
              >
                {labels.supplements.close}
              </button>
              <button
                className="rounded-md bg-[#1FA77A] px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#188865] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={
                  saving ||
                  suggestingDose ||
                  (!associationLocked && !doseValid)
                }
                onClick={onSave}
                type="button"
              >
                {saving ? "..." : labels.supplements.save}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SupplementAssociationPicker({
  labels,
  locale,
  onSelect,
  options,
  selectedId
}: Readonly<{
  labels: AdminContent;
  locale: Locale;
  onSelect: (supplementId: string) => void;
  options: AdminSupplementRow[];
  selectedId: string;
}>) {
  const [query, setQuery] = useState("");
  const selectedSupplement =
    options.find((option) => option.id === selectedId) ?? null;
  const normalizedQuery = query.trim().toLowerCase();
  const matches = options
    .filter((option) => {
      if (!normalizedQuery) {
        return true;
      }

      return [
        option.name,
        option.category,
        option.ingredientType,
        option.primaryUseCase,
        option.aliases.map((alias) => alias.name).join(" ")
      ]
        .filter(Boolean)
        .some((value) =>
          value?.toLowerCase().includes(normalizedQuery)
        );
    });

  return (
    <div className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-sm font-semibold text-gray-900">
            {labels.supplements.associateExisting}
          </span>
          <p className="mt-1 text-sm leading-6 text-gray-600">
            {labels.supplements.associationHint}
          </p>
        </div>
        {selectedSupplement ? (
          <button
            className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
            onClick={() => onSelect("")}
            type="button"
          >
            {labels.supplements.clearAssociation}
          </button>
        ) : null}
      </div>

      <Combobox
        as="div"
        className="mt-4"
        onChange={(option: AdminSupplementRow | null) => {
          setQuery("");
          onSelect(option?.id ?? "");
        }}
        value={selectedSupplement}
      >
        <div className="relative mt-2">
          <ComboboxInput
            aria-label={labels.supplements.associateExisting}
            className="block w-full rounded-md bg-white py-2 pr-12 pl-3 text-sm text-gray-900 ring-1 ring-gray-200 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-[#1FA77A]"
            displayValue={(option: AdminSupplementRow | null) =>
              option?.name ?? ""
            }
            id="supplement-association-search"
            onBlur={() => setQuery("")}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={labels.supplements.searchExisting}
          />
          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none">
            <ChevronDownSolidIcon
              aria-hidden={true}
              className="size-5 text-gray-400"
            />
          </ComboboxButton>

          <ComboboxOptions
            transition={true}
            className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-sm shadow-lg outline outline-black/5 data-closed:data-leave:opacity-0 data-leave:transition data-leave:duration-100 data-leave:ease-in"
          >
            {matches.length > 0 ? (
              matches.map((option) => (
                <ComboboxOption
                  className="cursor-default px-3 py-2 text-gray-900 select-none data-focus:bg-[#1FA77A] data-focus:text-white data-focus:outline-none"
                  key={option.id}
                  value={option}
                >
                  <span className="block truncate font-semibold">
                    {option.name}
                  </span>
                  <span className="block truncate text-xs text-gray-500 data-focus:text-white/80">
                    {option.category} · {supplementStatusLabel(labels, option.listStatus)}
                  </span>
                </ComboboxOption>
              ))
            ) : (
              <p className="px-3 py-2 text-sm font-medium text-gray-500">
                {labels.supplements.noAssociationMatches}
              </p>
            )}
          </ComboboxOptions>
        </div>
      </Combobox>

      {selectedSupplement ? (
        <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-gray-200">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
            {labels.supplements.associatedWith}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={classNames(
                supplementStatusClass(selectedSupplement.listStatus),
                "rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
              )}
            >
              {supplementStatusLabel(labels, selectedSupplement.listStatus)}
            </span>
            <h3 className="text-sm font-semibold text-gray-900">
              {selectedSupplement.name}
            </h3>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {selectedSupplement.category} ·{" "}
            {formatSupplementDose(selectedSupplement, locale)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

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

function reviewScopeLabel(labels: AdminContent, row: AdminReviewTaskRow) {
  if (row.itemType === "food") {
    return row.planId ? labels.reviewQueue.planReview : "Food review";
  }

  return row.planId ? labels.reviewQueue.planReview : labels.reviewQueue.supplementReview;
}

type ReviewTaskGroup = Readonly<{
  createdAt: string;
  key: string;
  planId: string | null;
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
    listStatus: "review_required",
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
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <button
        aria-label={labels.supplements.close}
        className="fixed inset-0 cursor-default bg-gray-900/40"
        onClick={onClose}
        type="button"
      />
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <section
          aria-modal={true}
          className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-900/10"
          role="dialog"
        >
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
        </section>
      </div>
    </div>
  );
}

export function AdminReviewQueueView({
  accessToken,
  data,
  labels,
  locale,
  selectedReviewTaskId,
  supplementsData
}: Readonly<{
  accessToken: string;
  data: AdminReviewQueueData;
  labels: AdminContent;
  locale: Locale;
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
  const [dismissedReviewTaskId, setDismissedReviewTaskId] = useState<
    string | null
  >(null);
  const queueData =
    queueState.generatedAt === data.generatedAt ? queueState.data : data;
  const reviewGroups = groupReviewRows(labels, queueData.rows);

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
      value: queueData.summary.total
    }),
    safetyMetric({
      color: businessMetricColors.stuck,
      id: "reviewsUnknown",
      label: labels.reviewQueue.unknown,
      locale,
      value: queueData.summary.unknown
    }),
    safetyMetric({
      color: businessMetricColors.pendingReviews,
      id: "reviewsRequired",
      label: labels.reviewQueue.reviewRequired,
      locale,
      value: queueData.summary.reviewRequired
    })
  ];

  return (
    <section className="mt-8 space-y-6">
      <BusinessStatsGrid metrics={reviewMetrics} />

      {reviewGroups.length > 0 ? (
        <div className="space-y-7">
          {reviewGroups.map((group) => (
            <section key={group.key} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-baseline gap-x-1 text-sm font-semibold text-gray-900">
                    {group.planId ? (
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
                        {row.itemType === "food" ? "Food" : "Supp"}
                      </span>
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

      {visibleReview?.row.reviewKind === "unknown_supplement" &&
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
