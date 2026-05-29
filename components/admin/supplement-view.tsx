"use client";

import { useState, type ReactNode } from "react";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions
} from "@headlessui/react";
import { PlusIcon, SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type {
  AdminSupplementRow,
  AdminSupplementsData,
  SupplementConfidence,
  SupplementListStatus
} from "@/lib/admin-supplements";
import {
  adminLocalizedFallbackLabel,
  adminLocalizedSupplementText
} from "@/lib/admin-localized-display";
import {
  supplementSafetyFlags,
  type SupplementSafetyFlag
} from "@/lib/supplement-safety-flags";
import { supplementDoseUnits } from "@/lib/supplement-dose-units";
import type { Locale } from "@/lib/i18n";
import {
  supplementDoseSuggestionTimeoutMs,
  type AdminContent
} from "@/components/admin/dashboard-content";
import {
  BusinessStatsGrid,
  businessMetricColors,
  classNames,
  formatLocale,
  supplementConfidences,
  supplementListStatuses,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";
import { AdminModal } from "@/components/admin/ui";
import {
  formatSupplementSafetyFlags,
  listStatusSummary,
  safetyMetric,
  supplementSafetyFlagLabel,
  supplementSearchText,
  supplementStatusClass,
  supplementStatusLabel,
  toggleSupplementSafetyFlag
} from "@/components/admin/safety-view-helpers";
import { ChevronDownIcon as ChevronDownSolidIcon } from "@heroicons/react/20/solid";

function LocalizedFallbackBadge({
  label
}: Readonly<{
  label: string | null;
}>) {
  return label ? (
    <span className="inline-flex w-max rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
      {label}
    </span>
  ) : null;
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
  const [addingAliasForId, setAddingAliasForId] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [createCategory, setCreateCategory] = useState("");
  const [createError, setCreateError] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingAliasId, setDeletingAliasId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminSupplementRow | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const summary = listStatusSummary(rows);
  const categories = [...new Set(rows.map((row) => row.category))].sort();
  const selectedSupplementMetricId =
    status === "active"
      ? "supplementsActive"
      : status === "blocked"
        ? "supplementsBlocked"
        : "supplementsTotal";
  const normalizedSearch = search.trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    const matchesSearch =
      !normalizedSearch ||
      supplementSearchText(labels, row, locale).includes(normalizedSearch);
    const matchesCategory = !category || row.category === category;
    const matchesStatus = !status || row.listStatus === status;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  function syncRow(row: AdminSupplementRow) {
    setRows((currentRows) =>
      currentRows.some((item) => item.id === row.id)
        ? currentRows.map((item) => (item.id === row.id ? row : item))
        : [...currentRows, row].sort((left, right) =>
            left.name.localeCompare(right.name)
          )
    );
    setDraft((currentDraft) =>
      currentDraft?.id === row.id ? row : currentDraft
    );
  }

  function selectSupplementMetric(metricId: BusinessMetric["id"]) {
    if (metricId === "supplementsActive") {
      setStatus("active");
      return;
    }

    if (metricId === "supplementsBlocked") {
      setStatus("blocked");
      return;
    }

    setStatus("");
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
      const nextRow = payload.row
        ? { ...payload.row, selectionStats: row.selectionStats }
        : row;

      syncRow(nextRow);
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
        syncRow({ ...payload.row, selectionStats: row.selectionStats });
      }
    } catch {
      setErrorId(row.id);
    } finally {
      setDeletingAliasId(null);
    }
  }

  async function addAssociation(
    row: AdminSupplementRow,
    alias: string
  ): Promise<boolean> {
    setAddingAliasForId(row.id);
    setErrorId(null);

    try {
      const response = await fetch(`/api/admin/supplements/${row.id}/aliases`, {
        body: JSON.stringify({ accessToken, alias }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        throw new Error("Unable to add supplement association");
      }

      const payload = (await response.json()) as { row?: AdminSupplementRow };

      if (payload.row) {
        syncRow({ ...payload.row, selectionStats: row.selectionStats });
      }

      return true;
    } catch {
      setErrorId(row.id);
      return false;
    } finally {
      setAddingAliasForId(null);
    }
  }

  async function createSupplement(): Promise<boolean> {
    const name = createName.trim();

    if (!name || creating) {
      return false;
    }

    setCreating(true);
    setCreateError(false);
    setErrorId(null);

    try {
      const response = await fetch("/api/admin/supplements", {
        body: JSON.stringify({
          accessToken,
          category: createCategory,
          name
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        throw new Error("Unable to create supplement");
      }

      const payload = (await response.json()) as { row?: AdminSupplementRow };

      if (!payload.row) {
        throw new Error("Supplement create response was empty");
      }

      syncRow(payload.row);
      setDraft(payload.row);
      setCreateName("");
      setCreateCategory("");
      setCreateOpen(false);
      return true;
    } catch {
      setCreateError(true);
      return false;
    } finally {
      setCreating(false);
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
      id: "supplementsActive",
      label: labels.supplements.active,
      locale,
      value: summary.active
    }),
    safetyMetric({
      color: businessMetricColors.offline,
      id: "supplementsBlocked",
      label: labels.supplements.blocked,
      locale,
      value: summary.blocked
    })
  ];

  return (
    <section className="mt-8 space-y-6">
      <BusinessStatsGrid
        metrics={supplementMetrics}
        onMetricSelect={selectSupplementMetric}
        selectedMetricId={selectedSupplementMetricId}
      />

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_14rem_14rem_auto]">
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
            {categories.map((item) => (
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
          <button
            aria-label={labels.supplements.addSupplement}
            className="inline-flex items-center justify-center rounded-md bg-[#1FA77A] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#188865] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A] focus-visible:ring-offset-2"
            onClick={() => {
              setCreateOpen(true);
              setCreateError(false);
            }}
            type="button"
          >
            <PlusIcon aria-hidden={true} className="size-5" />
          </button>
        </div>
      </div>

      {filteredRows.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filteredRows.map((row) => {
            const localized = adminLocalizedSupplementText(row, locale);
            const fallbackLabel = adminLocalizedFallbackLabel(
              localized.name,
              locale
            );

            return (
            <button
              key={row.id}
              aria-label={`${labels.supplements.details}: ${localized.name.value}`}
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
                    {localized.name.value}
                  </h3>
                  <LocalizedFallbackBadge label={fallbackLabel} />
                  <p className="mt-1 text-sm text-gray-500">
                    {row.ingredientType ?? localized.category.value}
                  </p>
                  {localized.name.canonicalValue &&
                  localized.name.canonicalValue !== localized.name.value ? (
                    <p className="mt-0.5 text-xs text-gray-400">
                      {labels.supplements.name}: {localized.name.canonicalValue}
                    </p>
                  ) : null}
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

              {localized.primaryUseCase.value ? (
                <p className="mt-4 line-clamp-2 min-h-12 text-sm leading-6 text-gray-600">
                  {localized.primaryUseCase.value}
                </p>
              ) : (
                <div className="mt-4 min-h-12" />
              )}

              {localized.aliases.length > 0 ? (
                <div className="mt-4 flex min-h-6 flex-wrap gap-1.5">
                  {localized.aliases.map((alias) => (
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

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <SupplementListMeta
                  label={labels.supplements.category}
                  value={localized.category.value}
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
              {row.selectionStats?.chosenPlanCount ? (
                <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-100">
                  {supplementSelectionSummary(row, locale)}
                </p>
              ) : null}
            </button>
            );
          })}
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
          onAddAssociation={(alias) => addAssociation(draft, alias)}
          onDeleteAssociation={(aliasId) => void deleteAssociation(draft, aliasId)}
          onSave={() => {
            void saveRow(draft).then((saved) => {
              if (saved) {
                setDraft(null);
              }
            });
          }}
          saving={savingId === draft.id}
          addingAssociation={addingAliasForId === draft.id}
          deletingAssociationId={deletingAliasId}
        />
      ) : null}
      {createOpen ? (
        <CreateSupplementModal
          category={createCategory}
          categories={categories}
          error={createError}
          labels={labels}
          name={createName}
          onCategoryChange={setCreateCategory}
          onClose={() => {
            if (!creating) {
              setCreateOpen(false);
              setCreateError(false);
            }
          }}
          onCreate={() => void createSupplement()}
          onNameChange={setCreateName}
          saving={creating}
        />
      ) : null}
    </section>
  );
}

function CreateSupplementModal({
  categories,
  category,
  error,
  labels,
  name,
  onCategoryChange,
  onClose,
  onCreate,
  onNameChange,
  saving
}: Readonly<{
  categories: string[];
  category: string;
  error: boolean;
  labels: AdminContent;
  name: string;
  onCategoryChange: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
  onNameChange: (value: string) => void;
  saving: boolean;
}>) {
  const canCreate = name.trim().length > 0 && !saving;
  const categoryListId = "supplement-category-options";
  const inputClass =
    "rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]";

  return (
    <AdminModal
      closeDisabled={saving}
      onClose={onClose}
      panelClassName="max-w-lg"
    >
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {labels.supplements.newSupplement}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {labels.supplements.newSupplementHint}
              </p>
            </div>
            <button
              aria-label={labels.supplements.close}
              className="rounded-md p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              onClick={onClose}
              type="button"
            >
              <XMarkIcon aria-hidden={true} className="size-5" />
            </button>
          </div>

          <form
            className="space-y-5 px-6 py-6"
            onSubmit={(event) => {
              event.preventDefault();
              if (canCreate) {
                onCreate();
              }
            }}
          >
            <label className="grid gap-2 text-sm font-medium text-gray-700">
              {labels.supplements.name}
              <input
                autoFocus={true}
                className={inputClass}
                disabled={saving}
                onChange={(event) => onNameChange(event.target.value)}
                value={name}
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-gray-700">
              {labels.supplements.category}
              <input
                className={inputClass}
                disabled={saving}
                list={categoryListId}
                onChange={(event) => onCategoryChange(event.target.value)}
                placeholder={labels.supplements.categoryPlaceholder}
                value={category}
              />
              <datalist id={categoryListId}>
                {categories.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </label>

            {error ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-100">
                {labels.supplements.createError}
              </p>
            ) : null}

            <div className="flex justify-end gap-3">
              <button
                className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving}
                onClick={onClose}
                type="button"
              >
                {labels.supplements.close}
              </button>
              <button
                className="rounded-md bg-[#1FA77A] px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#188865] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canCreate}
                type="submit"
              >
                {saving ? "..." : labels.supplements.create}
              </button>
            </div>
          </form>
    </AdminModal>
  );
}

export function formatSupplementDose(row: AdminSupplementRow, locale: Locale) {
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

function supplementSelectionSummary(row: AdminSupplementRow, locale: Locale) {
  const stats = row.selectionStats;

  if (!stats) {
    return "";
  }

  const formatter = new Intl.NumberFormat(formatLocale(locale));
  const topDose = stats.topDoses[0]?.label;
  const chosen = formatter.format(stats.chosenPlanCount);

  if (locale === "th") {
    return topDose
      ? `ถูกเลือกใน ${chosen} แผน · ขนาดที่พบบ่อย ${topDose}`
      : `ถูกเลือกใน ${chosen} แผน`;
  }

  if (locale === "zh-CN") {
    return topDose
      ? `已在 ${chosen} 个计划中选择 · 常见剂量 ${topDose}`
      : `已在 ${chosen} 个计划中选择`;
  }

  return topDose
    ? `Chosen in ${chosen} plans · top dose ${topDose}`
    : `Chosen in ${chosen} plans`;
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
      <p className="text-xs font-semibold tracking-normal text-gray-400">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-gray-900">
        {hasValue ? value : ""}
      </p>
    </div>
  );
}

export function SupplementDetailsModal({
  accessToken,
  addingAssociation,
  associatedSupplementId,
  associationOptions,
  deletingAssociationId,
  draft,
  error,
  headerNote,
  labels,
  locale,
  onAssociateSupplement,
  onAddAssociation,
  onChange,
  onClose,
  onDeleteAssociation,
  onSave,
  saving
}: Readonly<{
  accessToken: string;
  addingAssociation?: boolean;
  associatedSupplementId?: string;
  associationOptions?: AdminSupplementRow[];
  deletingAssociationId?: string | null;
  draft: AdminSupplementRow;
  error: boolean;
  headerNote?: string | null;
  labels: AdminContent;
  locale: Locale;
  onAssociateSupplement?: (supplementId: string) => void;
  onAddAssociation?: (alias: string) => Promise<boolean>;
  onChange: (patch: Partial<AdminSupplementRow>) => void;
  onClose: () => void;
  onDeleteAssociation?: (aliasId: string) => void;
  onSave: () => void;
  saving: boolean;
}>) {
  const [newAlias, setNewAlias] = useState("");
  const [suggestingDose, setSuggestingDose] = useState(false);
  const [suggestDoseError, setSuggestDoseError] = useState(false);
  const inputClass =
    "rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]";
  const associationLocked = Boolean(associatedSupplementId);
  const associationEnabled =
    Boolean(onAssociateSupplement) && Boolean(associationOptions?.length);
  const doseRequired = draft.listStatus === "active";
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
  const trimmedNewAlias = newAlias.trim();
  const localized = adminLocalizedSupplementText(draft, locale);
  const fallbackLabel = adminLocalizedFallbackLabel(localized.name, locale);

  async function addAssociation() {
    if (!onAddAssociation || !trimmedNewAlias || addingAssociation) {
      return;
    }

    const added = await onAddAssociation(trimmedNewAlias);

    if (added) {
      setNewAlias("");
    }
  }

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
          locale,
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
      const suggestedDoseRequired = suggestedStatus === "active";

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
    <AdminModal onClose={onClose} panelClassName="max-w-3xl">
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {localized.name.value}
              </h2>
              <LocalizedFallbackBadge label={fallbackLabel} />
              <p className="mt-1 text-sm text-gray-500">
                {draft.ingredientType ?? localized.category.value}
              </p>
              {localized.name.canonicalValue &&
              localized.name.canonicalValue !== localized.name.value ? (
                <p className="mt-1 text-xs text-gray-400">
                  {labels.supplements.name}: {localized.name.canonicalValue}
                </p>
              ) : null}
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
                value={localized.category.value}
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

            {draft.selectionStats ? (
              <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
                <p className="text-xs font-semibold tracking-normal text-emerald-700">
                  {locale === "th"
                    ? "การเลือกโดย AI"
                    : locale === "zh-CN"
                      ? "AI 选择"
                      : "AI selections"}
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <SupplementListMeta
                    label={locale === "th" ? "แผนที่เลือก" : locale === "zh-CN" ? "已选计划" : "Chosen plans"}
                    value={new Intl.NumberFormat(formatLocale(locale)).format(
                      draft.selectionStats.chosenPlanCount
                    )}
                  />
                  <SupplementListMeta
                    label={locale === "th" ? "ซ่อนเพื่อความปลอดภัย" : locale === "zh-CN" ? "因安全隐藏" : "Safety hidden"}
                    value={new Intl.NumberFormat(formatLocale(locale)).format(
                      draft.selectionStats.safetyHiddenCount
                    )}
                  />
                  <SupplementListMeta
                    label={locale === "th" ? "ล่าสุด" : locale === "zh-CN" ? "最近选择" : "Last chosen"}
                    value={
                      draft.selectionStats.lastSelectedAt
                        ? new Intl.DateTimeFormat(formatLocale(locale), {
                            dateStyle: "medium"
                          }).format(new Date(draft.selectionStats.lastSelectedAt))
                        : ""
                    }
                  />
                </div>
                {draft.selectionStats.topDoses.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {draft.selectionStats.topDoses.map((dose) => (
                      <span
                        className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100"
                        key={dose.label}
                      >
                        {dose.label} · {dose.count}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {localized.primaryUseCase.value ? (
              <div className="rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700 ring-1 ring-gray-100">
                {localized.primaryUseCase.value}
              </div>
            ) : null}

            {draft.aliases.length > 0 || onAddAssociation ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold tracking-normal text-gray-400">
                    {labels.supplements.associations}
                  </p>
                </div>
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
                {onAddAssociation ? (
                  <form
                    className="flex flex-col gap-2 sm:flex-row"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void addAssociation();
                    }}
                  >
                    <input
                      aria-label={labels.supplements.associationPlaceholder}
                      className={classNames(inputClass, "min-w-0 flex-1")}
                      disabled={addingAssociation}
                      onChange={(event) => setNewAlias(event.target.value)}
                      placeholder={labels.supplements.associationPlaceholder}
                      value={newAlias}
                    />
                    <button
                      className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={!trimmedNewAlias || addingAssociation}
                      type="submit"
                    >
                      {addingAssociation ? "..." : labels.supplements.addAssociation}
                    </button>
                  </form>
                ) : null}
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
    </AdminModal>
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
          <p className="text-xs font-semibold tracking-normal text-gray-400">
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
