"use client";

import { useState } from "react";
import { PlusIcon, SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type {
  AdminProductRow,
  AdminProductsData
} from "@/lib/admin-products";
import { productMatchesSearch } from "@/lib/admin-product-search-client";
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
import { siteLocaleRegistry, type Locale } from "@/lib/i18n";
import { productFactObservableIssueMessages } from "@/lib/product-validation";
import { supplementDoseUnits } from "@/lib/supplement-dose-units";
import type { AdminContent } from "@/components/admin/dashboard-content";
import {
  BusinessStatsGrid,
  businessMetricColors,
  classNames,
  formatGeneratedAt,
  formatLocale,
  readableToken,
  type BusinessMetric
} from "@/components/admin/dashboard-shared";
import { safetyMetric } from "@/components/admin/safety-view-helpers";

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
const productManufacturerMetricPrefix = "productsManufacturer:";

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

function productManufacturerMetricId(key: string) {
  return `${productManufacturerMetricPrefix}${encodeURIComponent(key)}`;
}

function productManufacturerKeyFromMetricId(id: string) {
  if (!id.startsWith(productManufacturerMetricPrefix)) {
    return null;
  }

  try {
    return decodeURIComponent(id.slice(productManufacturerMetricPrefix.length));
  } catch {
    return id.slice(productManufacturerMetricPrefix.length);
  }
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

export function productDoseUnitSelectOptions(currentUnit: string | null | undefined) {
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
    }),
    ...manufacturerStats.map((manufacturer) =>
      safetyMetric({
        color: businessMetricColors.active,
        id: productManufacturerMetricId(manufacturer.key),
        label: manufacturer.label,
        locale,
        value: manufacturer.total
      })
    )
  ];
  function handleMetricSelect(metricId: BusinessMetric["id"]) {
    const manufacturerKey = productManufacturerKeyFromMetricId(metricId);

    if (manufacturerKey) {
      setManufacturerFilter(manufacturerKey);
      setMetricFilter("productsTotal");
      setStatus("");
      return;
    }

    const nextMetric = metricId as ProductMetricFilter;

    setManufacturerFilter("");
    setMetricFilter(nextMetric);
    setStatus(productBusinessStateForMetric(nextMetric));
  }

  function handleStatusChange(nextStatus: ProductBusinessState | "") {
    setManufacturerFilter("");
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
          titleTh: row.titleTh,
          translations: row.translations
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
            titleTh: row.titleTh,
            translations: row.translations
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
        selectedMetricId={
          manufacturerFilter
            ? productManufacturerMetricId(manufacturerFilter)
            : metricFilter
        }
      />

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

  function translationFor(locale: string) {
    return draft.translations?.[locale] ?? {
      description:
        locale === "en"
          ? draft.descriptionEn ?? draft.description
          : locale === "th"
            ? draft.descriptionTh
            : null,
      locale,
      status: "missing" as const,
      title:
        locale === "en"
          ? draft.titleEn ?? draft.title
          : locale === "th"
            ? draft.titleTh
            : null,
      updatedAt: null
    };
  }

  function updateTranslation(
    locale: string,
    patch: Readonly<{ description?: string | null; title?: string | null }>
  ) {
    const current = translationFor(locale);
    const nextTranslation = {
      ...current,
      ...patch
    };
    const hasTitle = Boolean(nextTranslation.title?.trim());
    const hasDescription = Boolean(nextTranslation.description?.trim());
    const translations = {
      ...(draft.translations ?? {}),
      [locale]: {
        ...nextTranslation,
        description: nextTranslation.description?.trim() || null,
        status: hasTitle && hasDescription
          ? "complete" as const
          : hasTitle || hasDescription
            ? "draft" as const
            : "missing" as const,
        title: nextTranslation.title?.trim() || null
      }
    };
    const nextDraft: AdminProductRow = {
      ...draft,
      translations,
      ...(locale === "en"
        ? {
            description: translations.en?.description ?? draft.description,
            descriptionEn: translations.en?.description ?? null,
            titleEn: translations.en?.title ?? null
          }
        : {}),
      ...(locale === "th"
        ? {
            descriptionTh: translations.th?.description ?? null,
            titleTh: translations.th?.title ?? null
          }
        : {})
    };

    setDraft(nextDraft);
  }

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
          {siteLocaleRegistry.map((siteLocale) => {
            const translation = translationFor(siteLocale.code);

            return (
              <label
                className="text-sm font-medium text-gray-700"
                key={`${siteLocale.code}-title`}
              >
                Title {siteLocale.label}
                <input
                  className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
                  onChange={(event) =>
                    updateTranslation(siteLocale.code, {
                      title: event.target.value
                    })
                  }
                  type="text"
                  value={translation.title ?? ""}
                />
              </label>
            );
          })}
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
          {siteLocaleRegistry.map((siteLocale) => {
            const translation = translationFor(siteLocale.code);

            return (
              <label
                className="grid gap-2 text-sm font-medium text-gray-700"
                key={`${siteLocale.code}-description`}
              >
                Description {siteLocale.label}
                <textarea
                  className="min-h-24 resize-y rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
                  onChange={(event) =>
                    updateTranslation(siteLocale.code, {
                      description: event.target.value
                    })
                  }
                  value={translation.description ?? ""}
                />
                <span className="text-xs font-normal text-gray-500">
                  {siteLocale.nativeLabel} · {translation.status}
                </span>
              </label>
            );
          })}
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
