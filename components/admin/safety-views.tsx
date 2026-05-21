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
import type {
  AdminProductRow,
  AdminProductsData
} from "@/lib/admin-products";
import { productMatchesSearch } from "@/lib/admin-product-search";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode,
  productCountryLabel,
  productCountryOptions,
  type ProductCountryCode
} from "@/lib/product-countries";
import {
  doseAmountInLimitUnit,
  doseExceedsLimit,
  normalizeDoseUnit,
  parseDoseLimit
} from "@/lib/dose-conversion";
import { foodNutrientCatalog } from "@/lib/food-nutrients";
import {
  foodBenefitTags,
  foodNutrientTags,
  foodTagLabel
} from "@/lib/food-tags";
import type { Locale } from "@/lib/i18n";
import { productFactObservableIssueMessages } from "@/lib/product-validation";
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

const productKinds = ["supplement", "multi", "food", "other"] as const;
const productAudiences = ["both", "female", "male"] as const;
const productBusinessStates = [
  "pending_review",
  "approved",
  "ignored"
] as const;

type ProductBusinessState = (typeof productBusinessStates)[number];
type ProductMetricFilter =
  | "productsAffiliates"
  | "productsApproved"
  | "productsIgnored"
  | "productsMissingFacts"
  | "productsMissingImages"
  | "productsPendingReview"
  | "productsTotal";

function productMetricForBusinessState(
  state: ProductBusinessState | ""
): ProductMetricFilter {
  if (state === "approved") {
    return "productsApproved";
  }

  if (state === "ignored") {
    return "productsIgnored";
  }

  if (state === "pending_review") {
    return "productsPendingReview";
  }

  return "productsTotal";
}

function productBusinessStateForMetric(
  metric: ProductMetricFilter
): ProductBusinessState | "" {
  if (metric === "productsApproved") {
    return "approved";
  }

  if (metric === "productsIgnored") {
    return "ignored";
  }

  if (metric === "productsPendingReview") {
    return "pending_review";
  }

  return "";
}

function productStatusLabel(status: string) {
  if (status === "approved") {
    return "Approved";
  }

  if (status === "pending_review") {
    return "Pending Review";
  }

  if (status === "ignored") {
    return "Ignored";
  }

  if (status === "both") {
    return "Both";
  }

  if (status === "female") {
    return "Female only";
  }

  if (status === "male") {
    return "Male only";
  }

  return readableToken(status);
}

function productBusinessState(
  productOrStatus: AdminProductRow | AdminProductRow["status"]
): ProductBusinessState {
  if (typeof productOrStatus !== "string") {
    if (productOrStatus.importReviewTaskId) {
      return "pending_review";
    }

    return productBusinessState(productOrStatus.status);
  }

  if (productOrStatus === "approved") {
    return "approved";
  }

  if (productOrStatus === "ignored") {
    return "ignored";
  }

  return "pending_review";
}

function productBusinessStateLabel(state: ProductBusinessState) {
  if (state === "approved") {
    return "Approved";
  }

  if (state === "ignored") {
    return "Ignored";
  }

  return "Pending Review";
}

function productBusinessStateClass(state: ProductBusinessState) {
  if (state === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (state === "ignored") {
    return "border-gray-200 bg-gray-50 text-gray-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

function productMatchesMetricFilter(
  row: AdminProductRow,
  metric: ProductMetricFilter
) {
  if (metric === "productsApproved") {
    return productBusinessState(row) === "approved";
  }

  if (metric === "productsPendingReview") {
    return productBusinessState(row) === "pending_review";
  }

  if (metric === "productsIgnored") {
    return productBusinessState(row) === "ignored";
  }

  if (metric === "productsMissingFacts") {
    return row.validationLabel === "Missing Facts";
  }

  if (metric === "productsMissingImages") {
    return row.validationLabel === "Missing Image";
  }

  if (metric === "productsAffiliates") {
    return row.affiliateStatus === "active";
  }

  return true;
}

const unknownProductManufacturerKey = "__unknown_manufacturer__";
const unknownProductManufacturerLabel = "Unknown manufacturer";

type ProductManufacturerStat = {
  approved: number;
  ignored: number;
  key: string;
  label: string;
  pendingReview: number;
  total: number;
};

function productManufacturerLabel(row: AdminProductRow) {
  return row.brandName?.trim() || unknownProductManufacturerLabel;
}

function productManufacturerKey(row: AdminProductRow) {
  const label = productManufacturerLabel(row);

  return label === unknownProductManufacturerLabel
    ? unknownProductManufacturerKey
    : label.toLowerCase();
}

function productManufacturerStats(rows: readonly AdminProductRow[]) {
  const stats = new Map<string, ProductManufacturerStat>();

  for (const row of rows) {
    const key = productManufacturerKey(row);
    const current =
      stats.get(key) ?? {
        approved: 0,
        ignored: 0,
        key,
        label: productManufacturerLabel(row),
        pendingReview: 0,
        total: 0
      };
    const state = productBusinessState(row);

    current.total += 1;
    current.approved += state === "approved" ? 1 : 0;
    current.ignored += state === "ignored" ? 1 : 0;
    current.pendingReview += state === "pending_review" ? 1 : 0;
    stats.set(key, current);
  }

  return [...stats.values()].sort((first, second) =>
    second.total - first.total || first.label.localeCompare(second.label)
  );
}

async function adminResponseErrorMessage(
  response: Response,
  fallback: string
) {
  const payload = (await response.json().catch(() => null)) as
    | { message?: string }
    | null;

  return payload?.message ?? fallback;
}

function productFactIssueMessages(fact: AdminProductRow["facts"][number]) {
  return productFactObservableIssueMessages(fact);
}

function productFactIssueSeverity(issues: readonly string[]) {
  return issues.some((issue) => issue.toLowerCase().includes("exceeds"))
    ? "high"
    : issues.length > 0
      ? "medium"
      : "none";
}

function productFactSafetyLimitIncreaseLabel(
  fact: AdminProductRow["facts"][number]
) {
  if (fact.amount === null || fact.amount <= 0 || !fact.unit || !fact.maxUnit) {
    return null;
  }

  const doseUnit = normalizeDoseUnit(fact.unit);
  const limit = parseDoseLimit(fact.maxAmount, fact.maxUnit);

  if (!doseUnit || !limit) {
    return null;
  }

  const factDose = {
    amount: fact.amount,
    originalText: `${fact.amount} ${fact.unit}`,
    unit: doseUnit
  };
  const supplementKey = fact.normalizedName || fact.name;
  const exceedsLimit = doseExceedsLimit(
    factDose,
    limit,
    supplementKey
  );

  if (exceedsLimit !== true) {
    return null;
  }

  const nextLimitAmount = doseAmountInLimitUnit(factDose, limit, supplementKey);

  if (nextLimitAmount === null) {
    return null;
  }

  const roundedAmount = Math.ceil(nextLimitAmount * 1_000_000) / 1_000_000;

  return `Increase limit to ${Number.isInteger(roundedAmount) ? roundedAmount.toFixed(0) : roundedAmount} ${fact.maxUnit}`;
}

const productDoseUnitOptions = supplementDoseUnits.filter(
  (unit) => !unit.endsWith("/day")
);

function productDoseUnitSelectOptions(currentUnit: string | null | undefined) {
  const trimmedCurrentUnit = currentUnit?.trim();

  return trimmedCurrentUnit &&
    !productDoseUnitOptions.includes(
      trimmedCurrentUnit as (typeof productDoseUnitOptions)[number]
    )
    ? [trimmedCurrentUnit, ...productDoseUnitOptions]
    : productDoseUnitOptions;
}

function normalizedProductCountryCodes(
  countryCodes: readonly string[] | null | undefined,
  fallback: readonly string[] = [defaultProductCountryCode]
): ProductCountryCode[] {
  const codes = [
    ...new Set((countryCodes ?? [])
      .map((code) => normalizeProductCountryCode(code))
      .filter((code): code is ProductCountryCode => Boolean(code)))
  ];

  return codes.length > 0
    ? codes
    : [
        ...new Set(fallback
          .map((code) => normalizeProductCountryCode(code))
          .filter((code): code is ProductCountryCode => Boolean(code)))
      ];
}

function addProductCountryCode(
  countryCodes: readonly string[],
  countryCode: string
): ProductCountryCode[] {
  return normalizedProductCountryCodes([...countryCodes, countryCode], countryCodes);
}

function removeProductCountryCode(
  countryCodes: readonly string[],
  countryCode: string
): ProductCountryCode[] {
  if (countryCodes.length <= 1) {
    return normalizedProductCountryCodes(countryCodes);
  }

  return normalizedProductCountryCodes(
    countryCodes.filter((code) => code !== countryCode),
    [countryCodes[0] ?? defaultProductCountryCode]
  );
}

function ProductCountryManager({
  allowedCountryCodes,
  countryCodes,
  disabledReason,
  label,
  onAdd,
  onRemove
}: Readonly<{
  allowedCountryCodes?: readonly string[];
  countryCodes: readonly string[];
  disabledReason?: string | null;
  label: string;
  onAdd: (countryCode: string) => void;
  onRemove: (countryCode: string) => void;
}>) {
  const allowedSet = allowedCountryCodes
    ? new Set(allowedCountryCodes)
    : null;
  const availableOptions = productCountryOptions.filter((country) =>
    !countryCodes.includes(country.code) &&
    (!allowedSet || allowedSet.has(country.code))
  );

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
        <select
          aria-label={`Add ${label.toLowerCase()}`}
          className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={Boolean(disabledReason) || availableOptions.length < 1}
          onChange={(event) => {
            if (event.target.value) {
              onAdd(event.target.value);
              event.target.value = "";
            }
          }}
          value=""
        >
          <option value="">Add country</option>
          {availableOptions.map((country) => (
            <option key={country.code} value={country.code}>
              {country.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {countryCodes.map((countryCode) => (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700"
            key={countryCode}
          >
            {productCountryLabel(countryCode)}
            <button
              aria-label={`Remove ${productCountryLabel(countryCode)}`}
              className="rounded-full p-0.5 text-emerald-500 hover:bg-emerald-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={countryCodes.length <= 1}
              onClick={() => onRemove(countryCode)}
              type="button"
            >
              <XMarkIcon aria-hidden={true} className="size-3.5" />
            </button>
          </span>
        ))}
      </div>
      {disabledReason ? (
        <p className="mt-2 text-xs font-medium text-amber-700">
          {disabledReason}
        </p>
      ) : null}
    </div>
  );
}

export function AdminProductsView({
  accessToken,
  data,
  locale
}: Readonly<{
  accessToken: string;
  data: AdminProductsData;
  locale: Locale;
}>) {
  const [rows, setRows] = useState(data.rows);
  const [draft, setDraft] = useState<AdminProductRow | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProductBusinessState | "">("");
  const [metricFilter, setMetricFilter] =
    useState<ProductMetricFilter>("productsTotal");
  const [manufacturerFilter, setManufacturerFilter] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const productNumberFormatter = new Intl.NumberFormat(
    locale === "th" ? "th-TH" : "en-GB"
  );
  const manufacturerStats = productManufacturerStats(rows);
  const summary = rows.reduce(
    (counts, row) => {
      const state = productBusinessState(row);

      counts.total += 1;
      counts.activeAffiliate += row.affiliateStatus === "active" ? 1 : 0;
      counts.dirtyData += row.validationLabel === "Dirty Data" ? 1 : 0;
      counts.missingFacts += row.validationLabel === "Missing Facts" ? 1 : 0;
      counts.missingImage += row.validationLabel === "Missing Image" ? 1 : 0;
      counts.approved += state === "approved" ? 1 : 0;
      counts.ignored += state === "ignored" ? 1 : 0;
      counts.pendingReview += state === "pending_review" ? 1 : 0;

      return counts;
    },
    {
      activeAffiliate: 0,
      approved: 0,
      dirtyData: 0,
      ignored: 0,
      missingFacts: 0,
      missingImage: 0,
      pendingReview: 0,
      total: 0,
    }
  );
  const metrics: BusinessMetric[] = [
    safetyMetric({
      color: businessMetricColors.total,
      id: "productsTotal",
      label: "Products",
      locale,
      value: summary.total
    }),
    safetyMetric({
      color: businessMetricColors.succeeded,
      id: "productsApproved",
      label: "Approved",
      locale,
      value: summary.approved
    }),
    safetyMetric({
      color: businessMetricColors.pendingReviews,
      id: "productsPendingReview",
      label: "Pending Review",
      locale,
      value: summary.pendingReview
    }),
    safetyMetric({
      color: businessMetricColors.offline,
      id: "productsIgnored",
      label: "Ignored",
      locale,
      value: summary.ignored
    }),
    safetyMetric({
      color: businessMetricColors.failed,
      id: "productsMissingFacts",
      label: "Missing facts",
      locale,
      value: summary.missingFacts
    }),
    safetyMetric({
      color: businessMetricColors.medium,
      id: "productsMissingImages",
      label: "Missing images",
      locale,
      value: summary.missingImage
    }),
    safetyMetric({
      color: businessMetricColors.active,
      id: "productsAffiliates",
      label: "Active affiliates",
      locale,
      value: summary.activeAffiliate
    })
  ];
  function handleMetricSelect(metricId: BusinessMetric["id"]) {
    const nextMetric = metricId as ProductMetricFilter;

    setMetricFilter(nextMetric);
    setStatus(productBusinessStateForMetric(nextMetric));
  }

  function handleStatusChange(nextStatus: ProductBusinessState | "") {
    setStatus(nextStatus);
    setMetricFilter(productMetricForBusinessState(nextStatus));
  }

  const filteredRows = rows.filter((row) => {
    const matchesSearch = productMatchesSearch(row, normalizedSearch);
    const matchesMetric = productMatchesMetricFilter(row, metricFilter);
    const matchesManufacturer =
      !manufacturerFilter || productManufacturerKey(row) === manufacturerFilter;

    return matchesSearch && matchesMetric && matchesManufacturer;
  });

  async function saveProduct(row: AdminProductRow) {
    setSavingId(row.id);
    setErrorId(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/admin/products/${row.id}`, {
        body: JSON.stringify({
          accessToken,
          brandName: row.brandName,
          availableCountryCodes: row.availableCountryCodes,
          description: row.description,
          descriptionEn: row.descriptionEn,
          descriptionTh: row.descriptionTh,
          facts: row.facts.map((fact) => ({
            amount: fact.amount,
            confidence: fact.confidence,
            itemType: fact.itemType,
            name: fact.name,
            servingLabel: fact.servingLabel ?? null,
            sourceText: fact.sourceText ?? null,
            sourceUrl: fact.sourceUrl ?? null,
            supplementId: fact.supplementId ?? null,
            unit: fact.unit
          })),
          fdaApprovalNumber: row.fdaApprovalNumber,
          imageUrl: row.imageUrl,
          labelStatus: row.labelStatus,
          manufacturerCountryCodes: row.manufacturerCountryCodes,
          status: row.status,
          productAudience: row.productAudience,
          productKind: row.productKind,
          productUrl: row.productUrl,
          title: row.title,
          titleEn: row.titleEn,
          titleTh: row.titleTh
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });

      if (!response.ok) {
        throw new Error(
          await adminResponseErrorMessage(response, "Unable to save product")
        );
      }

      const payload = (await response.json()) as {
        row?: AdminProductRow;
        rows?: AdminProductRow[];
      };
      const savedRow = payload.row ?? row;
      const updatedRows = new Map(
        (payload.rows && payload.rows.length > 0 ? payload.rows : [savedRow])
          .map((item) => [item.id, item])
      );

      setRows((currentRows) =>
        currentRows.map((item) => updatedRows.get(item.id) ?? item)
      );
      setDraft((currentDraft) =>
        currentDraft?.id === row.id ? savedRow : currentDraft
      );
      return true;
    } catch (error) {
      setErrorId(row.id);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save product"
      );
      return false;
    } finally {
      setSavingId(null);
    }
  }

  async function correctProductFacts(row: AdminProductRow) {
    setSavingId(row.id);
    setErrorId(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/admin/products/${row.id}/correct-facts`, {
        body: JSON.stringify({ accessToken }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(
          await adminResponseErrorMessage(
            response,
            "Unable to correct product facts"
          )
        );
      }

      const payload = (await response.json()) as { row?: AdminProductRow };
      const correctedRow = payload.row;

      if (!correctedRow) {
        throw new Error("AI correction did not return a product row");
      }

      setRows((currentRows) =>
        currentRows.map((item) =>
          item.id === correctedRow.id ? correctedRow : item
        )
      );
      setDraft(correctedRow);

      return correctedRow;
    } catch (error) {
      setErrorId(row.id);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to correct product facts"
      );
      return null;
    } finally {
      setSavingId(null);
    }
  }

  async function increaseProductSafetyLimit(
    row: AdminProductRow,
    factId: string
  ) {
    setSavingId(row.id);
    setErrorId(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/admin/products/${row.id}/safety-limit`, {
        body: JSON.stringify({
          accessToken,
          factId
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(
          await adminResponseErrorMessage(
            response,
            "Unable to increase safety limit"
          )
        );
      }

      const payload = (await response.json()) as {
        row?: AdminProductRow;
        rows?: AdminProductRow[];
      };
      const savedRow = payload.row;

      if (!savedRow) {
        throw new Error("Safety limit update did not return a product row");
      }

      const updatedRows = new Map(
        (payload.rows && payload.rows.length > 0 ? payload.rows : [savedRow])
          .map((item) => [item.id, item])
      );

      setRows((currentRows) =>
        currentRows.map((item) => updatedRows.get(item.id) ?? item)
      );
      setDraft(savedRow);

      return true;
    } catch (error) {
      setErrorId(row.id);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to increase safety limit"
      );
      return false;
    } finally {
      setSavingId(null);
    }
  }

  async function decideProductImportFromProduct(
    row: AdminProductRow,
    action: "approve_product" | "ignore_import" | "merge_product",
    mergeProductId: string | null,
    reviewerNote: string | null
  ) {
    if (!row.importReviewTaskId) {
      return false;
    }

    setSavingId(row.id);
    setErrorId(null);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/admin/review-tasks/${row.importReviewTaskId}`,
        {
          body: JSON.stringify({
            accessToken,
            action,
            availableCountryCodes: row.availableCountryCodes,
            brandName: row.brandName,
            description: row.description,
            descriptionEn: row.descriptionEn,
            descriptionTh: row.descriptionTh,
            fdaApprovalNumber: row.fdaApprovalNumber,
            imageUrl: row.imageUrl,
            manufacturerCountryCodes: row.manufacturerCountryCodes,
            mergeProductId,
            parsedFacts: row.facts.map((fact) => ({
              amount: fact.amount,
              confidence: fact.confidence,
              itemType: fact.itemType,
              name: fact.name,
              servingLabel: fact.servingLabel ?? null,
              sourceText: fact.sourceText ?? null,
              sourceUrl: fact.sourceUrl ?? null,
              supplementId: fact.supplementId ?? null,
              unit: fact.unit
            })),
            productAudience: row.productAudience,
            productUrl: row.productUrl,
            reviewerNote,
            title: row.title,
            titleEn: row.titleEn,
            titleTh: row.titleTh
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "PATCH"
        }
      );

      if (!response.ok) {
        throw new Error(
          await adminResponseErrorMessage(
            response,
            "Unable to update product review"
          )
        );
      }

      const payload = (await response.json()) as {
        result?: {
          row?: AdminProductRow | null;
        };
      };
      const fallbackRow: AdminProductRow = {
        ...row,
        importReviewTaskId: null,
        importStatus:
          action === "approve_product"
            ? "approved"
            : action === "ignore_import"
              ? "ignored"
              : "duplicate",
        status:
          action === "approve_product"
            ? "approved"
            : action === "ignore_import"
              ? "ignored"
              : row.status
      };
      const savedRow = payload.result?.row ?? fallbackRow;

      setRows((currentRows) => {
        const nextRows = currentRows.map((item) =>
          item.id === row.id
            ? savedRow.id === row.id
              ? savedRow
              : fallbackRow
            : item.id === savedRow.id
              ? savedRow
              : item
        );

        return nextRows.some((item) => item.id === savedRow.id)
          ? nextRows
          : [savedRow, ...nextRows];
      });
      setDraft(savedRow.id === row.id ? savedRow : null);

      return true;
    } catch (error) {
      setErrorId(row.id);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update product review"
      );
      return false;
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="mt-8 space-y-6">
      <BusinessStatsGrid
        metrics={metrics}
        onMetricSelect={handleMetricSelect}
        selectedMetricId={metricFilter}
      />

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Manufacturers
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Filter products by manufacturer.
            </p>
          </div>
          {manufacturerFilter ? (
            <button
              className="rounded-md px-3 py-2 text-sm font-semibold text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
              onClick={() => setManufacturerFilter("")}
              type="button"
            >
              Clear manufacturer
            </button>
          ) : null}
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <button
            className={classNames(
              "min-w-40 rounded-lg border px-3 py-2 text-left transition focus:outline-2 focus:-outline-offset-2 focus:outline-[#1FA77A]",
              manufacturerFilter
                ? "border-gray-200 bg-white hover:bg-gray-50"
                : "border-[#1FA77A] bg-emerald-50"
            )}
            onClick={() => setManufacturerFilter("")}
            type="button"
          >
            <span className="block text-sm font-semibold text-gray-900">
              All manufacturers
            </span>
            <span className="mt-1 block text-xs text-gray-500">
              {productNumberFormatter.format(summary.total)} products
            </span>
          </button>
          {manufacturerStats.map((manufacturer) => {
            const selected = manufacturerFilter === manufacturer.key;

            return (
              <button
                className={classNames(
                  "min-w-48 rounded-lg border px-3 py-2 text-left transition focus:outline-2 focus:-outline-offset-2 focus:outline-[#1FA77A]",
                  selected
                    ? "border-[#1FA77A] bg-emerald-50"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                )}
                key={manufacturer.key}
                onClick={() => setManufacturerFilter(manufacturer.key)}
                type="button"
              >
                <span className="block truncate text-sm font-semibold text-gray-900">
                  {manufacturer.label}
                </span>
                <span className="mt-1 block text-xs text-gray-500">
                  {productNumberFormatter.format(manufacturer.total)} products
                </span>
                <span className="mt-1 block text-xs text-gray-500">
                  {productNumberFormatter.format(manufacturer.approved)} approved ·{" "}
                  {productNumberFormatter.format(manufacturer.pendingReview)} review
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_14rem]">
          <input
            aria-label="Search products"
            className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products, brands, ingredients, aliases"
            type="search"
            value={search}
          />
          <select
            aria-label="Status"
            className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              handleStatusChange(event.target.value as ProductBusinessState | "")
            }
            value={status}
          >
            <option value="">All states</option>
            {productBusinessStates.map((item) => (
              <option key={item} value={item}>
                {productBusinessStateLabel(item)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {filteredRows.map((row) => (
          <button
            className="self-start rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:shadow-md"
            key={row.id}
            onClick={() => setDraft(row)}
            type="button"
          >
            <div className="flex gap-4">
              {row.imageUrl ? (
                <img
                  alt=""
                  className="size-20 rounded-lg object-cover ring-1 ring-gray-200"
                  src={row.imageUrl}
                />
              ) : (
                <div className="flex size-20 items-center justify-center rounded-lg bg-gray-50 text-xs font-semibold text-gray-400 ring-1 ring-gray-200">
                  {row.platform.toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">
                      {row.title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {[
                        row.brandName,
                        productStatusLabel(row.productKind),
                        row.productAudience === "both"
                          ? null
                          : productStatusLabel(row.productAudience),
                        row.fdaApprovalNumber ? `FDA ${row.fdaApprovalNumber}` : null,
                        row.availableCountryCodes.length > 0
                          ? `Markets ${row.availableCountryCodes.join(", ")}`
                          : null,
                        row.priceAmount ? `${row.priceAmount} ${row.currency}` : null
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span
                    className={classNames(
                      "rounded-full border px-2.5 py-1 text-xs font-medium",
                      productBusinessStateClass(productBusinessState(row))
                    )}
                  >
                    {productBusinessStateLabel(productBusinessState(row))}
                  </span>
                </div>
                {row.facts.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {row.facts.slice(0, 6).map((fact) => (
                      <span
                        className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                        key={fact.id}
                      >
                        {fact.name}
                        {fact.amount ? ` ${fact.amount}${fact.unit ? ` ${fact.unit}` : ""}` : ""}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-amber-700">No parsed label facts yet.</p>
                )}
                <p className="mt-3 text-sm text-gray-500">
                  Chosen {row.recommendationHistory.chosenCount} times
                  {row.recommendationHistory.averageProductCoveragePercent
                    ? ` · avg ${Math.round(row.recommendationHistory.averageProductCoveragePercent)}% client fit`
                    : ""}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {draft ? (
        <ProductModal
          accessToken={accessToken}
          draft={draft}
          error={errorId === draft.id}
          errorMessage={errorId === draft.id ? errorMessage : null}
          onImportDecision={decideProductImportFromProduct}
          onCorrectFacts={correctProductFacts}
          onIncreaseSafetyLimit={increaseProductSafetyLimit}
          onClose={() => {
            setDraft(null);
            setErrorId(null);
            setErrorMessage(null);
          }}
          onSave={saveProduct}
          products={rows}
          saving={savingId === draft.id}
          setDraft={setDraft}
        />
      ) : null}
    </section>
  );
}

function ProductModal({
  accessToken,
  draft,
  error,
  errorMessage,
  onImportDecision,
  onCorrectFacts,
  onIncreaseSafetyLimit,
  onClose,
  onSave,
  products,
  saving,
  setDraft
}: Readonly<{
  accessToken: string;
  draft: AdminProductRow;
  error: boolean;
  errorMessage: string | null;
  onImportDecision: (
    row: AdminProductRow,
    action: "approve_product" | "ignore_import" | "merge_product",
    mergeProductId: string | null,
    reviewerNote: string | null
  ) => Promise<boolean>;
  onCorrectFacts: (row: AdminProductRow) => Promise<AdminProductRow | null>;
  onIncreaseSafetyLimit: (
    row: AdminProductRow,
    factId: string
  ) => Promise<boolean>;
  onClose: () => void;
  onSave: (row: AdminProductRow) => Promise<boolean>;
  products: AdminProductRow[];
  saving: boolean;
  setDraft: (row: AdminProductRow) => void;
}>) {
  const [newOfferUrl, setNewOfferUrl] = useState("");
  const [newOfferCommissionRate, setNewOfferCommissionRate] = useState("");
  const [offerBusy, setOfferBusy] = useState(false);
  const [mergeProductId, setMergeProductId] = useState(
    draft.productImportDuplicateProductIds.find((id) => id !== draft.id) ?? ""
  );
  const [reviewerNote, setReviewerNote] = useState("");
  const hasOpenImportReview = Boolean(draft.importReviewTaskId);
  const approvalBlockedMessage =
    draft.validation.status !== "pass"
      ? `Approval is blocked until validation passes: ${draft.validation.summary}`
      : null;
  const duplicateOptions = products.filter((product) =>
    draft.productImportDuplicateProductIds.includes(product.id) &&
    product.id !== draft.id
  );
  const currentBusinessState = productBusinessState(draft);
  const approveDisabled =
    saving || currentBusinessState === "approved" || Boolean(approvalBlockedMessage);
  const mergeOptions = duplicateOptions.length > 0
    ? duplicateOptions
    : products.filter((product) => product.id !== draft.id).slice(0, 80);
  const manufacturerCountryCodes = normalizedProductCountryCodes(
    draft.manufacturerCountryCodes
  );
  const productCountryCodes = normalizedProductCountryCodes(
    draft.availableCountryCodes,
    manufacturerCountryCodes
  ).filter((countryCode) => manufacturerCountryCodes.includes(countryCode));
  const safeProductCountryCodes = productCountryCodes.length > 0
    ? productCountryCodes
    : [manufacturerCountryCodes[0] ?? defaultProductCountryCode];

  function addManufacturerCountry(countryCode: string) {
    setDraft({
      ...draft,
      manufacturerCountryCodes: addProductCountryCode(
        manufacturerCountryCodes,
        countryCode
      )
    });
  }

  function removeManufacturerCountry(countryCode: string) {
    const nextManufacturerCountryCodes = removeProductCountryCode(
      manufacturerCountryCodes,
      countryCode
    );
    const nextProductCountryCodes = safeProductCountryCodes.filter((code) =>
      nextManufacturerCountryCodes.includes(code)
    );

    setDraft({
      ...draft,
      availableCountryCodes: nextProductCountryCodes.length > 0
        ? nextProductCountryCodes
        : [nextManufacturerCountryCodes[0] ?? defaultProductCountryCode],
      manufacturerCountryCodes: nextManufacturerCountryCodes
    });
  }

  function addAvailableCountry(countryCode: string) {
    const normalizedCountryCode = normalizeProductCountryCode(countryCode);

    if (!normalizedCountryCode || !manufacturerCountryCodes.includes(normalizedCountryCode)) {
      return;
    }

    setDraft({
      ...draft,
      availableCountryCodes: addProductCountryCode(
        safeProductCountryCodes,
        normalizedCountryCode
      )
    });
  }

  function removeAvailableCountry(countryCode: string) {
    setDraft({
      ...draft,
      availableCountryCodes: removeProductCountryCode(
        safeProductCountryCodes,
        countryCode
      )
    });
  }

  async function addOffer() {
    const url = newOfferUrl.trim();

    if (!url) {
      return;
    }

    setOfferBusy(true);

    try {
      const response = await fetch(
        `/api/admin/products/${draft.id}/offers`,
        {
          body: JSON.stringify({
            accessToken,
            commissionRate: newOfferCommissionRate
              ? Number(newOfferCommissionRate) / 100
              : null,
            linkType: "affiliate",
            url
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );

      if (!response.ok) {
        throw new Error("Unable to add offer");
      }

      const payload = (await response.json()) as { row?: AdminProductRow };

      if (payload.row) {
        setDraft(payload.row);
        setNewOfferUrl("");
        setNewOfferCommissionRate("");
      }
    } finally {
      setOfferBusy(false);
    }
  }

  async function removeOffer(offerId: string) {
    setOfferBusy(true);

    try {
      const response = await fetch(
        `/api/admin/products/${draft.id}/offers/${offerId}`,
        {
          body: JSON.stringify({ accessToken }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "DELETE"
        }
      );

      if (!response.ok) {
        throw new Error("Unable to remove offer");
      }

      const payload = (await response.json()) as { row?: AdminProductRow };

      if (payload.row) {
        setDraft(payload.row);
      }
    } finally {
      setOfferBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-950/40 px-4 py-8">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-xl ring-1 ring-gray-200">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold text-gray-900">{draft.title}</h2>
              <span
                className={classNames(
                  "rounded-full border px-2.5 py-1 text-xs font-medium",
                  productBusinessStateClass(currentBusinessState)
                )}
              >
                {productBusinessStateLabel(currentBusinessState)}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {[
                draft.brandName,
                productStatusLabel(draft.productKind),
                draft.productAudience === "both"
                  ? null
                  : productStatusLabel(draft.productAudience),
                safeProductCountryCodes.length > 0
                  ? `Markets ${safeProductCountryCodes.join(", ")}`
                  : draft.region
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <button
            aria-label="Close"
            className="rounded-full p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
            onClick={onClose}
            type="button"
          >
            <XMarkIcon className="size-5" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
          {draft.validationCacheStatus === "stale" ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-sky-200 bg-white px-2.5 py-1 text-xs font-medium text-sky-800">
                Validation stale
              </span>
              <span className="text-xs text-gray-500">
                Saved validation cache differs from current facts and limits.
              </span>
            </div>
          ) : null}
          {draft.validation.status !== "pass" ? (
            <div>
              <p className="font-semibold text-gray-900">Validation blockers</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {draft.validation.reasons.map((reason) => (
                  <span
                    className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-amber-800"
                    key={reason}
                  >
                    {readableToken(reason)}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-sm text-gray-600">
                {draft.validation.summary}
              </p>
            </div>
          ) : null}
          {draft.aiCorrectionNotes ? (
            <p>
              <span className="font-semibold text-gray-900">AI notes: </span>
              {draft.aiCorrectionNotes}
            </p>
          ) : null}
          {draft.sourceEvidence.sourceUrl ? (
            <p>
              <span className="font-semibold text-gray-900">Source: </span>
              <a
                className="text-[#2563EB] hover:text-[#1D4ED8]"
                href={draft.sourceEvidence.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                {draft.sourceEvidence.sourceUrl}
              </a>
            </p>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <ProductCountryManager
            countryCodes={manufacturerCountryCodes}
            label="Manufacturer countries"
            onAdd={addManufacturerCountry}
            onRemove={removeManufacturerCountry}
          />
          <ProductCountryManager
            allowedCountryCodes={manufacturerCountryCodes}
            countryCodes={safeProductCountryCodes}
            disabledReason={
              manufacturerCountryCodes.length < 1
                ? "Add a manufacturer country first."
                : null
            }
            label="Product countries"
            onAdd={addAvailableCountry}
            onRemove={removeAvailableCountry}
          />
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            Product name
            <input
              className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  title: event.target.value
                })
              }
              type="text"
              value={draft.title}
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Brand
            <input
              className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  brandName: event.target.value.trim() || null
                })
              }
              type="text"
              value={draft.brandName ?? ""}
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Title EN
            <input
              className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  titleEn: event.target.value.trim() || null
                })
              }
              type="text"
              value={draft.titleEn ?? ""}
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Title TH
            <input
              className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  titleTh: event.target.value.trim() || null
                })
              }
              type="text"
              value={draft.titleTh ?? ""}
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Product URL
            <input
              className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  productUrl: event.target.value
                })
              }
              type="url"
              value={draft.productUrl}
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Image URL
            <input
              className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  imageUrl: event.target.value.trim() || null
                })
              }
              type="url"
              value={draft.imageUrl ?? ""}
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Product type
            <select
              className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  productKind: event.target.value as AdminProductRow["productKind"]
                })
              }
              value={draft.productKind}
            >
              {productKinds.map((item) => (
                <option key={item} value={item}>
                  {productStatusLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Audience
            <select
              className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  productAudience: event.target.value as AdminProductRow["productAudience"]
                })
              }
              value={draft.productAudience}
            >
              {productAudiences.map((item) => (
                <option key={item} value={item}>
                  {productStatusLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            FDA approval number
            <input
              className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  fdaApprovalNumber: event.target.value.trim() || null
                })
              }
              type="text"
              value={draft.fdaApprovalNumber ?? ""}
            />
          </label>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-gray-700">
            Description EN
            <textarea
              className="min-h-24 resize-y rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
              onChange={(event) => {
                const value = event.target.value;

                setDraft({
                  ...draft,
                  description: value || null,
                  descriptionEn: value || null
                });
              }}
              value={draft.descriptionEn ?? draft.description ?? ""}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-gray-700">
            Description TH
            <textarea
              className="min-h-24 resize-y rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  descriptionTh: event.target.value || null
                })
              }
              value={draft.descriptionTh ?? ""}
            />
          </label>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-900">Parsed facts</h3>
            <button
              className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-[#126B4F] ring-1 ring-emerald-200 hover:bg-emerald-50"
              onClick={() =>
                setDraft({
                  ...draft,
                  facts: [
                    ...draft.facts,
                    {
                      amount: null,
                      comparableAmount: null,
                      confidence: "moderate",
                      id: crypto.randomUUID(),
                      itemType: "supplement",
                      maxAmount: null,
                      maxUnit: null,
                      name: "",
                      normalizedName: "",
                      safetyFlags: [],
                      source: "admin",
                      sourceText: null,
                      sourceUrl: null,
                      supplementStatus: null,
                      unit: null
                    }
                  ]
                })
              }
              type="button"
            >
              Add fact
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {draft.facts.length > 0 ? draft.facts.map((fact, index) => {
              const factIssues = productFactIssueMessages(fact);
              const issueSeverity = productFactIssueSeverity(factIssues);
              const hasIssues = issueSeverity !== "none";
              const highSeverity = issueSeverity === "high";
              const safetyLimitIncreaseLabel =
                productFactSafetyLimitIncreaseLabel(fact);

              return (
              <div
                className={classNames(
                  "grid gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_6rem_6rem_8rem_8rem]",
                  highSeverity
                    ? "border-red-200 bg-red-50 ring-1 ring-red-100"
                    : hasIssues
                      ? "border-amber-200 bg-amber-50 ring-1 ring-amber-100"
                      : "border-gray-100 bg-gray-50"
                )}
                key={fact.id}
              >
                <input
                  className={classNames(
                    "rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 outline-none focus:ring-2 focus:ring-[#1FA77A]",
                    hasIssues ? "ring-amber-200" : "ring-gray-200"
                  )}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      facts: draft.facts.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, name: event.target.value }
                          : item
                      )
                    })
                  }
                  placeholder="Ingredient"
                  value={fact.name}
                />
                <input
                  className={classNames(
                    "rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 outline-none focus:ring-2 focus:ring-[#1FA77A]",
                    hasIssues ? "ring-amber-200" : "ring-gray-200"
                  )}
                  inputMode="decimal"
                  onChange={(event) => {
                    const parsed = Number(event.target.value);

                    setDraft({
                      ...draft,
                      facts: draft.facts.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              amount: event.target.value.trim() &&
                                Number.isFinite(parsed) &&
                                parsed >= 0
                                ? parsed
                                : null
                            }
                          : item
                      )
                    });
                  }}
                  placeholder="Amount"
                  value={fact.amount ?? ""}
                />
                <select
                  className={classNames(
                    "rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 outline-none focus:ring-2 focus:ring-[#1FA77A]",
                    hasIssues ? "ring-amber-200" : "ring-gray-200"
                  )}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      facts: draft.facts.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, unit: event.target.value.trim() || null }
                          : item
                      )
                    })
                  }
                  value={fact.unit ?? ""}
                >
                  <option value="">Unit</option>
                  {productDoseUnitSelectOptions(fact.unit).map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <select
                  className={classNames(
                    "rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 outline-none focus:ring-2 focus:ring-[#1FA77A]",
                    hasIssues ? "ring-amber-200" : "ring-gray-200"
                  )}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      facts: draft.facts.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              confidence: event.target.value as AdminProductRow["facts"][number]["confidence"]
                            }
                          : item
                      )
                    })
                  }
                  value={fact.confidence}
                >
                  <option value="high">High</option>
                  <option value="moderate">Moderate</option>
                  <option value="low">Low</option>
                </select>
                <div className="flex items-center justify-end gap-2">
                  {safetyLimitIncreaseLabel ? (
                    <button
                      className="rounded-md px-2 py-1 text-xs font-semibold text-[#126B4F] hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={saving}
                      onClick={() => void onIncreaseSafetyLimit(draft, fact.id)}
                      type="button"
                    >
                      Increase limit
                    </button>
                  ) : null}
                  <button
                    className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        facts: draft.facts.filter((_, itemIndex) => itemIndex !== index)
                      })
                    }
                    type="button"
                  >
                    Remove
                  </button>
                </div>
                {fact.sourceText ? (
                  <p className="text-xs text-gray-500 sm:col-span-5">
                    {fact.sourceText}
                  </p>
                ) : null}
                {factIssues.length > 0 ? (
                  <div
                    className={classNames(
                      "flex flex-wrap items-center gap-1.5 text-xs font-medium sm:col-span-5",
                      highSeverity ? "text-red-800" : "text-amber-800"
                    )}
                  >
                    {factIssues.map((issue) => (
                      <span
                        className={classNames(
                          "rounded-full border bg-white px-2 py-1",
                          highSeverity ? "border-red-200" : "border-amber-200"
                        )}
                        key={issue}
                      >
                        {issue}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              );
            }) : (
              <span className="text-sm text-amber-700">No parsed facts yet.</span>
            )}
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-semibold text-gray-900">Offers</h3>
          {draft.offers.length > 0 ? (
            <div className="mt-2 space-y-2">
              {draft.offers.map((offer) => (
                <div
                  className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2"
                  key={offer.id}
                >
                  <div className="min-w-0">
                    <a
                      className="block truncate text-sm font-medium text-[#2563EB] hover:text-[#1D4ED8]"
                      href={offer.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {offer.url}
                    </a>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {[
                        productStatusLabel(offer.linkType),
                        offer.platform,
                        offer.commissionRate !== null
                          ? `${(offer.commissionRate * 100).toFixed(1)}% commission`
                          : null,
                        offer.priceAmount !== null
                          ? `${offer.priceAmount} ${offer.currency}`
                          : null,
                        productStatusLabel(offer.availabilityStatus)
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <button
                    className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={offerBusy}
                    onClick={() => void removeOffer(offer.id)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-500">
              No offers yet. The product can still be recommended if it is the
              best match.
            </p>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
            <input
              className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-[#1FA77A]"
              onChange={(event) => setNewOfferUrl(event.target.value)}
              placeholder="Offer URL"
              type="url"
              value={newOfferUrl}
            />
            <input
              className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-[#1FA77A]"
              min="0"
              onChange={(event) =>
                setNewOfferCommissionRate(event.target.value)
              }
              placeholder="%"
              step="0.01"
              type="number"
              value={newOfferCommissionRate}
            />
            <button
              className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={offerBusy || !newOfferUrl.trim()}
              onClick={() => void addOffer()}
              type="button"
            >
              Add
            </button>
          </div>
        </div>

        {hasOpenImportReview ? (
          <div className="mt-5 space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Import review
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                This draft has an open review task. Use these actions to finish
                the review and update the catalogue.
              </p>
              {approvalBlockedMessage ? (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                  {approvalBlockedMessage}
                </p>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <select
                aria-label="Duplicate of product"
                className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
                onChange={(event) => setMergeProductId(event.target.value)}
                value={mergeProductId}
              >
                <option value="">Duplicate of existing product</option>
                {mergeOptions.map((product) => (
                  <option key={product.id} value={product.id}>
                    {[product.title, product.brandName].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
              <button
                className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-[#126B4F] ring-1 ring-emerald-200 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving || !mergeProductId}
                onClick={async () => {
                  if (
                    await onImportDecision(
                      draft,
                      "merge_product",
                      mergeProductId,
                      reviewerNote.trim() || null
                    )
                  ) {
                    onClose();
                  }
                }}
                type="button"
              >
                Mark duplicate
              </button>
            </div>
            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Reviewer note
              <textarea
                className="min-h-20 resize-y rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
                onChange={(event) => setReviewerNote(event.target.value)}
                value={reviewerNote}
              />
            </label>
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm font-medium text-red-700">
            {errorMessage ?? "Could not save this product."}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              aria-label="Correct facts with AI"
              className="inline-flex size-9 items-center justify-center rounded-md bg-[#2563EB] text-white ring-1 ring-[#2563EB] hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              onClick={() => void onCorrectFacts(draft)}
              title="Correct facts with AI"
              type="button"
            >
              <SparklesIcon className="size-5" />
            </button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span className="isolate inline-flex rounded-md shadow-xs">
              <button
                className="relative inline-flex items-center rounded-l-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 focus:z-10 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving}
                onClick={onClose}
                type="button"
              >
                Close
              </button>
              <button
                className="relative -ml-px inline-flex items-center rounded-r-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 focus:z-10 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving}
                onClick={() => void onSave(draft)}
                type="button"
              >
                {saving ? "Saving" : "Save"}
              </button>
            </span>
            <span className="isolate inline-flex rounded-md shadow-xs">
              <button
                className="relative inline-flex items-center rounded-l-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 focus:z-10 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving || currentBusinessState === "ignored"}
                onClick={async () => {
                  const ignoredDraft: AdminProductRow = {
                    ...draft,
                    status: "ignored"
                  };

                  if (hasOpenImportReview) {
                    if (
                      await onImportDecision(
                        ignoredDraft,
                        "ignore_import",
                        null,
                        reviewerNote.trim() || null
                      )
                    ) {
                      onClose();
                    }

                    return;
                  }

                  if (await onSave(ignoredDraft)) {
                    onClose();
                  }
                }}
                type="button"
              >
                Ignore
              </button>
              <button
                className="relative -ml-px inline-flex items-center rounded-r-md bg-[#1FA77A] px-3 py-2 text-sm font-semibold text-white ring-1 ring-[#1FA77A] hover:bg-[#168763] focus:z-10 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={approveDisabled}
                onClick={async () => {
                  const approvedDraft: AdminProductRow = {
                    ...draft,
                    labelStatus: draft.facts.length > 0 ? "parsed" : draft.labelStatus,
                    status: "approved"
                  };

                  if (hasOpenImportReview) {
                    if (
                      await onImportDecision(
                        approvedDraft,
                        "approve_product",
                        null,
                        reviewerNote.trim() || null
                      )
                    ) {
                      onClose();
                    }

                    return;
                  }

                  if (await onSave(approvedDraft)) {
                    onClose();
                  }
                }}
                title={approvalBlockedMessage ?? undefined}
                type="button"
              >
                Approve
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

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
      supplementSearchText(labels, row).includes(normalizedSearch);
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
        syncRow(payload.row);
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
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <button
        aria-label={labels.supplements.close}
        className="fixed inset-0 cursor-default bg-gray-900/40"
        disabled={saving}
        onClick={onClose}
        type="button"
      />
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <section
          aria-modal={true}
          className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-900/10"
          role="dialog"
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
                placeholder="Manual"
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
        </section>
      </div>
    </div>
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

            {draft.aliases.length > 0 || onAddAssociation ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
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
