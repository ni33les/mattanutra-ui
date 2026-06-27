"use client";

import { type FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import type {
  AdminProductDetailData,
  AdminProductDetailRow,
  AdminProductListData,
  AdminProductMergeOption,
  AdminProductRow,
  AdminProductsData
} from "@/lib/admin-products";
import {
  adminLocalizedFallbackLabel,
  adminLocalizedProductText,
} from "@/lib/admin-localized-display";
import { productMatchesSearch } from "@/lib/admin-product-search-client";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode,
} from "@/lib/product-countries";
import {
  defaultRegulatoryAgencyForCountry,
  regulatoryAgencyByCode
} from "@/lib/product-regulatory-agencies";
import { productMatchingReadiness } from "@/lib/product-matching-readiness";
import { type Locale } from "@/lib/i18n";
import {
  BusinessStatsGrid,
  classNames,
  type BusinessMetric,
} from "@/components/admin/dashboard-shared";
import {
  addProductCountryCode,
  adminResponseErrorMessage,
  normalizedProductCountryCodes,
  productAudiences,
  productBusinessState,
  productBusinessStateClass,
  productBusinessStateLabel,
  productFactPayloads,
  productForms,
  productKinds,
  productManufacturerKey,
  productManufacturerStats,
  productMatchesMetricFilter,
  productMetricCards,
  productMetricCardsFromSummary,
  productStatusLabel,
  productViewLabels,
  removeProductCountryCode,
  type ProductMetricFilter,
} from "@/components/admin/product-view-helpers";
import {
  AddProductFromUrlModal,
  LocalizedFallbackBadge,
  ProductCard,
  ProductCountryManager,
  ProductFactsEditor,
  ProductImageDropzone,
  ProductImagePreview,
  ProductIdentifiersEditor,
  ProductTranslationEditor,
} from "@/components/admin/product-view-ui";

function safeArray<T>(value: readonly T[] | null | undefined) {
  return Array.isArray(value) ? [...value] : [];
}

function normalizeProductDetailRow(
  row: AdminProductDetailRow | AdminProductRow
): AdminProductDetailRow {
  const { sourceSnapshot, ...baseRow } = row as AdminProductRow &
    Partial<AdminProductDetailRow>;

  void sourceSnapshot;

  return {
    ...baseRow,
    availableCountryCodes: safeArray(row.availableCountryCodes),
    countryPricing: safeArray(row.countryPricing).map((item) => ({
      ...item,
      effectiveRegulatoryApprovals: safeArray(
        item.effectiveRegulatoryApprovals
      )
    })),
    facts: safeArray(row.facts),
    imageCandidates: safeArray(
      "imageCandidates" in row ? row.imageCandidates : row.imageUrl ? [row.imageUrl] : []
    ),
    identifierCandidates: safeArray(row.identifierCandidates),
    identifiers: safeArray(row.identifiers),
    manufacturerCountryCodes: safeArray(row.manufacturerCountryCodes),
    productForm: row.productForm ?? "unknown",
    productImportDuplicateProductIds: safeArray(
      row.productImportDuplicateProductIds,
    ),
    recommendationHistory: row.recommendationHistory ?? {
      averageProductCoveragePercent: null,
      averageStackCoveragePercent: null,
      chosenCount: 0,
      lastRecommendedAt: null,
    },
    regulatoryApprovals: safeArray(row.regulatoryApprovals),
    shopAvailability: safeArray(row.shopAvailability),
    sourceEvidence: row.sourceEvidence ?? {
      importId: null,
      importReviewTaskId: null,
      importStatus: null,
      sourceUrl: null,
    },
    translations:
      row.translations && typeof row.translations === "object"
        ? row.translations
        : {},
    validation:
      row.validation && Array.isArray(row.validation.reasons)
        ? {
            ...row.validation,
            reasons: safeArray(row.validation.reasons),
          }
        : {
            checkedAt: new Date(0).toISOString(),
            matchableFactCount: 0,
            reasons: ["no_dosed_facts"],
            status: "failed",
            summary: "Product validation data is unavailable.",
          },
    validationCacheStaleReasons: safeArray(row.validationCacheStaleReasons),
  };
}

function normalizeProductMergeOption(
  option: AdminProductMergeOption
): AdminProductMergeOption {
  return {
    ...option,
    translations:
      option.translations && typeof option.translations === "object"
        ? option.translations
        : {}
  };
}

function normalizeProductMergeOptions(
  options: readonly AdminProductMergeOption[]
) {
  return options.map(normalizeProductMergeOption);
}

type ProductDraftUpdate =
  | AdminProductDetailRow
  | AdminProductRow
  | null
  | ((
      current: AdminProductDetailRow,
    ) => AdminProductDetailRow | AdminProductRow | null);

function regulatoryApprovalsForSave(
  row: Pick<AdminProductDetailRow, "regulatoryApprovals">
) {
  return row.regulatoryApprovals
    .filter((approval) => approval.approvalNumber.trim())
    .map((approval) =>
      approval.scopeType === "country"
        ? {
            ...approval,
            status: "verified" as const,
          }
        : approval
    );
}

export function AdminProductsView({
  accessToken,
  data,
  locale,
}: Readonly<{
  accessToken: string;
  data: AdminProductsData;
  locale: Locale;
}>) {
  const rows = data.rows;
  const [search, setSearch] = useState("");
  const [metricFilter, setMetricFilter] =
    useState<ProductMetricFilter>("productsTotal");
  const [manufacturerFilter, setManufacturerFilter] = useState("");
  const viewLabels = productViewLabels[locale];
  const normalizedSearch = search.trim().toLowerCase();
  const metrics = productMetricCards({ locale, rows, viewLabels });
  const manufacturerOptions = productManufacturerStats(rows);
  const exportHref = `/api/admin/products/catalogue/export?scope=platform${
    accessToken ? `&access_token=${encodeURIComponent(accessToken)}` : ""
  }`;
  function handleMetricSelect(metricId: BusinessMetric["id"]) {
    setMetricFilter(metricId as ProductMetricFilter);
  }

  const filteredRows = rows.filter((row) => {
    const matchesSearch = productMatchesSearch(row, normalizedSearch);
    const matchesMetric = productMatchesMetricFilter(row, metricFilter);
    const matchesManufacturer =
      !manufacturerFilter || productManufacturerKey(row) === manufacturerFilter;

    return matchesSearch && matchesMetric && matchesManufacturer;
  });

  return (
    <section className="mt-8 space-y-6">
      <BusinessStatsGrid
        metrics={metrics}
        onMetricSelect={handleMetricSelect}
        selectedMetricId={metricFilter}
      />

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <input
            aria-label={viewLabels.search}
            className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={viewLabels.searchPlaceholder}
            type="search"
            value={search}
          />
          <select
            aria-label={viewLabels.brand}
            className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) => setManufacturerFilter(event.target.value)}
            value={manufacturerFilter}
          >
            <option value="">{viewLabels.allBrands}</option>
            {manufacturerOptions.map((manufacturer) => (
              <option key={manufacturer.key} value={manufacturer.key}>
                {manufacturer.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            className="inline-flex items-center justify-center rounded-md bg-[#1FA77A] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#188865] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A] focus-visible:ring-offset-2"
            href={exportHref}
          >
            {viewLabels.exportJson}
          </a>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {filteredRows.map((row) => (
          <ProductCard
            href={`/${locale}/admin/products/${row.id}${accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : ""}`}
            key={row.id}
            locale={locale}
            row={row}
            viewLabels={viewLabels}
          />
        ))}
      </div>
    </section>
  );
}

export function AdminProductListView({
  accessToken,
  data,
  locale,
}: Readonly<{
  accessToken: string;
  data: AdminProductListData;
  locale: Locale;
}>) {
  const [search, setSearch] = useState(data.query.search);
  const [manufacturerFilter, setManufacturerFilter] = useState(data.query.brand);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addProductUrl, setAddProductUrl] = useState("");
  const [addProductSaving, setAddProductSaving] = useState(false);
  const [addProductError, setAddProductError] = useState<string | null>(null);
  const viewLabels = productViewLabels[locale];
  const metrics = productMetricCardsFromSummary({
    locale,
    summary: data.summary,
    viewLabels
  });

  function productListHref(
    patch: Readonly<{
      brand?: string;
      metric?: string;
      page?: number;
      search?: string;
    }> = {}
  ) {
    const params = new URLSearchParams();
    const nextSearch = patch.search ?? data.query.search;
    const nextBrand = patch.brand ?? data.query.brand;
    const nextMetric = patch.metric ?? data.query.metric;
    const nextPage = patch.page ?? data.page;

    if (accessToken) {
      params.set("access_token", accessToken);
    }

    if (nextSearch) {
      params.set("search", nextSearch);
    }

    if (nextBrand) {
      params.set("brand", nextBrand);
    }

    if (nextMetric && nextMetric !== "productsTotal") {
      params.set("metric", nextMetric);
    }

    if (nextPage > 1) {
      params.set("page", String(nextPage));
    }

    return `/${locale}/admin/products${params.size > 0 ? `?${params.toString()}` : ""}`;
  }

  function productDetailHref(productId: string) {
    return `/${locale}/admin/products/${productId}${accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : ""}`;
  }

  function handleMetricSelect(metricId: BusinessMetric["id"]) {
    window.location.href = productListHref({
      metric: metricId as string,
      page: 1
    });
  }

  async function handleAddProductSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddProductSaving(true);
    setAddProductError(null);

    try {
      const response = await fetch("/api/admin/products/from-url", {
        body: JSON.stringify({
          accessToken,
          productUrl: addProductUrl
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(
          await adminResponseErrorMessage(response, viewLabels.addProductError)
        );
      }

      const payload = (await response.json()) as {
        row?: { id?: string | null };
      };
      const productId = payload.row?.id;

      if (!productId) {
        throw new Error(viewLabels.addProductError);
      }

      window.location.href = productDetailHref(productId);
    } catch (error) {
      setAddProductError(
        error instanceof Error ? error.message : viewLabels.addProductError
      );
    } finally {
      setAddProductSaving(false);
    }
  }

  return (
    <section className="mt-8 space-y-6">
      <div className="flex justify-end">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#1FA77A] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#188865] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A] focus-visible:ring-offset-2"
          onClick={() => {
            setAddProductError(null);
            setAddProductOpen(true);
          }}
          type="button"
        >
          <Plus aria-hidden="true" className="size-4" />
          {viewLabels.addProduct}
        </button>
      </div>

      {addProductOpen ? (
        <AddProductFromUrlModal
          error={addProductError}
          onClose={() => setAddProductOpen(false)}
          onProductUrlChange={setAddProductUrl}
          onSubmit={handleAddProductSubmit}
          productUrl={addProductUrl}
          saving={addProductSaving}
          viewLabels={viewLabels}
        />
      ) : null}

      <BusinessStatsGrid
        metrics={metrics}
        onMetricSelect={handleMetricSelect}
        selectedMetricId={data.query.metric || "productsTotal"}
      />

      <form
        action={`/${locale}/admin/products`}
        className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200"
      >
        {accessToken ? (
          <input name="access_token" type="hidden" value={accessToken} />
        ) : null}
        {data.query.metric ? (
          <input name="metric" type="hidden" value={data.query.metric} />
        ) : null}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_16rem_auto]">
          <input
            aria-label={viewLabels.search}
            className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-[#1FA77A]"
            name="search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={viewLabels.searchPlaceholder}
            type="search"
            value={search}
          />
          <select
            aria-label={viewLabels.brand}
            className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            name="brand"
            onChange={(event) => setManufacturerFilter(event.target.value)}
            value={manufacturerFilter}
          >
            <option value="">{viewLabels.allBrands}</option>
            {data.manufacturerOptions.map((manufacturer) => (
              <option key={manufacturer.key} value={manufacturer.key}>
                {manufacturer.label} ({manufacturer.total})
              </option>
            ))}
          </select>
          <button
            className="inline-flex items-center justify-center rounded-md bg-[#1FA77A] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#188865] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A] focus-visible:ring-offset-2"
            type="submit"
          >
            {viewLabels.search}
          </button>
        </div>
      </form>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {data.rows.map((row) => (
          <ProductCard
            href={productDetailHref(row.id)}
            key={row.id}
            locale={locale}
            row={row}
            viewLabels={viewLabels}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 text-sm text-gray-600 ring-1 ring-gray-200 sm:flex-row sm:items-center sm:justify-between">
        <span>
          {data.totalRows} {viewLabels.products}
          {data.totalPages > 0 ? ` · ${data.page}/${data.totalPages}` : ""}
        </span>
        <div className="flex gap-2">
          <a
            aria-disabled={data.page <= 1}
            className={classNames(
              "rounded-md px-3 py-2 font-semibold ring-1 ring-gray-200",
              data.page <= 1
                ? "pointer-events-none bg-gray-50 text-gray-300"
                : "bg-white text-gray-700 hover:bg-gray-50"
            )}
            href={productListHref({ page: Math.max(1, data.page - 1) })}
          >
            Previous
          </a>
          <a
            aria-disabled={data.page >= data.totalPages}
            className={classNames(
              "rounded-md px-3 py-2 font-semibold ring-1 ring-gray-200",
              data.page >= data.totalPages
                ? "pointer-events-none bg-gray-50 text-gray-300"
                : "bg-white text-gray-700 hover:bg-gray-50"
            )}
            href={productListHref({ page: data.page + 1 })}
          >
            Next
          </a>
        </div>
      </div>
    </section>
  );
}

export function AdminProductDetailView({
  accessToken,
  data,
  locale,
  productId,
}: Readonly<{
  accessToken: string;
  data: AdminProductDetailData;
  locale: Locale;
  productId: string;
}>) {
  const initialRow = normalizeProductDetailRow(data.row);
  const [mergeOptions] = useState(
    normalizeProductMergeOptions(data.mergeOptions),
  );
  const [draft, setDraftState] = useState<AdminProductDetailRow | null>(
    initialRow.id === productId ? initialRow : null,
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const viewLabels = productViewLabels[locale];
  const backHref = `/${locale}/admin/products${accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : ""}`;

  function setDraft(update: ProductDraftUpdate) {
    if (typeof update === "function") {
      setDraftState((current) => {
        if (!current) {
          return null;
        }

        const next = update(current);

        return next ? normalizeProductDetailRow(next) : null;
      });
      return;
    }

    setDraftState(update ? normalizeProductDetailRow(update) : null);
  }

  async function saveProduct(
    row: AdminProductDetailRow,
    options: Readonly<{ changeNote?: string | null }> = {}
  ) {
    setSavingId(row.id);
    setErrorId(null);
    setErrorMessage(null);

    try {
      const englishTitle = row.translations?.en?.title?.trim() || row.title;
      const response = await fetch(`/api/admin/products/${row.id}`, {
        body: JSON.stringify({
          accessToken,
          brandName: row.brandName,
          availableCountryCodes: row.availableCountryCodes,
          changeNote: options.changeNote,
          countryPricing: row.countryPricing,
          description: row.description,
          facts: productFactPayloads(row),
          imageUrl: row.imageUrl,
          identifiers: row.identifiers,
          labelStatus: row.labelStatus,
          manufacturerCountryCodes: row.manufacturerCountryCodes,
          status: row.status,
          productAudience: row.productAudience,
          productForm: row.productForm,
          productKind: row.productKind,
          productUrl: row.productUrl,
          regulatoryApprovals: regulatoryApprovalsForSave(row),
          title: englishTitle,
          translations: row.translations,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error(
          await adminResponseErrorMessage(response, "Unable to save product"),
        );
      }

      const payload = (await response.json()) as {
        row?: AdminProductRow;
      };
      const savedRow = normalizeProductDetailRow(
        payload.row
          ? {
              ...payload.row,
              imageCandidates: row.imageCandidates
            }
          : row,
      );

      setDraft(savedRow);
      return true;
    } catch (error) {
      setErrorId(row.id);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save product",
      );
      return false;
    } finally {
      setSavingId(null);
    }
  }

  async function deleteProduct(row: AdminProductDetailRow) {
    setSavingId(row.id);
    setErrorId(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/admin/products/${row.id}`, {
        body: JSON.stringify({
          accessToken,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(
          await adminResponseErrorMessage(response, viewLabels.deleteError),
        );
      }

      setDraft(null);
      return true;
    } catch (error) {
      setErrorId(row.id);
      setErrorMessage(
        error instanceof Error ? error.message : viewLabels.deleteError,
      );
      return false;
    } finally {
      setSavingId(null);
    }
  }

  async function correctProductFacts(row: AdminProductDetailRow) {
    setSavingId(row.id);
    setErrorId(null);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/admin/products/${row.id}/correct-facts`,
        {
          body: JSON.stringify({ accessToken }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error(
          await adminResponseErrorMessage(
            response,
            "Unable to correct product facts",
          ),
        );
      }

      const payload = (await response.json()) as { row?: AdminProductRow };
      const correctedRow = payload.row
        ? normalizeProductDetailRow({
            ...payload.row,
            imageCandidates: row.imageCandidates
          })
        : null;

      if (!correctedRow) {
        throw new Error("AI correction did not return a product row");
      }

      setDraft(correctedRow);

      return correctedRow;
    } catch (error) {
      setErrorId(row.id);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to correct product facts",
      );
      return null;
    } finally {
      setSavingId(null);
    }
  }

  async function increaseProductSafetyLimit(
    row: AdminProductDetailRow,
    factId: string,
  ) {
    setSavingId(row.id);
    setErrorId(null);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/admin/products/${row.id}/safety-limit`,
        {
          body: JSON.stringify({
            accessToken,
            factId,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error(
          await adminResponseErrorMessage(
            response,
            "Unable to increase safety limit",
          ),
        );
      }

      const payload = (await response.json()) as {
        row?: AdminProductRow;
      };
      const savedRow = payload.row
        ? normalizeProductDetailRow({
            ...payload.row,
            imageCandidates: row.imageCandidates
          })
        : null;

      if (!savedRow) {
        throw new Error("Safety limit update did not return a product row");
      }

      setDraft(savedRow);

      return true;
    } catch (error) {
      setErrorId(row.id);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to increase safety limit",
      );
      return false;
    } finally {
      setSavingId(null);
    }
  }

  async function decideProductImportFromProduct(
    row: AdminProductDetailRow,
    action: "approve_product" | "ignore_import" | "merge_product",
    mergeProductId: string | null,
    reviewerNote: string | null,
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
            countryPricing: row.countryPricing,
            brandName: row.brandName,
            description: row.description,
            imageUrl: row.imageUrl,
            identifiers: row.identifiers,
            manufacturerCountryCodes: row.manufacturerCountryCodes,
            mergeProductId,
            parsedFacts: productFactPayloads(row),
            productAudience: row.productAudience,
            productUrl: row.productUrl,
            regulatoryApprovals: regulatoryApprovalsForSave(row),
            reviewerNote,
            title: row.title,
            translations: row.translations,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "PATCH",
        },
      );

      if (!response.ok) {
        throw new Error(
          await adminResponseErrorMessage(response, viewLabels.updateError),
        );
      }

      const payload = (await response.json()) as {
        result?: {
          row?: AdminProductRow | null;
        };
      };
      const fallbackRow: AdminProductDetailRow = {
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
              : row.status,
      };
      const savedRow = normalizeProductDetailRow(
        payload.result?.row
          ? {
              ...payload.result.row,
              imageCandidates: row.imageCandidates
            }
          : fallbackRow,
      );

      setDraft(savedRow.id === row.id ? savedRow : null);

      return true;
    } catch (error) {
      setErrorId(row.id);
      setErrorMessage(
        error instanceof Error ? error.message : viewLabels.updateError,
      );
      return false;
    } finally {
      setSavingId(null);
    }
  }

  if (!draft) {
    return (
      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <a
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#126B4F] hover:text-[#0F5C45]"
          href={backHref}
        >
          <ArrowLeft aria-hidden={true} className="size-4" strokeWidth={2.25} />
          {viewLabels.backToProducts}
        </a>
        <p className="mt-4 text-sm text-gray-600">Product not found.</p>
      </section>
    );
  }

  return (
    <ProductDetailPanel
      accessToken={accessToken}
      backHref={backHref}
      draft={draft}
      error={errorId === draft.id}
      errorMessage={errorId === draft.id ? errorMessage : null}
      locale={locale}
      onImportDecision={decideProductImportFromProduct}
      onCorrectFacts={correctProductFacts}
      onIncreaseSafetyLimit={increaseProductSafetyLimit}
      onClose={() => {
        window.location.href = backHref;
      }}
      onDelete={deleteProduct}
      onSave={saveProduct}
      mergeOptions={mergeOptions}
      saving={savingId === draft.id}
      setDraft={setDraft}
    />
  );
}

function ProductMatchingReadinessPanel({
  labels,
  row,
}: Readonly<{
  labels: Readonly<Record<string, string>>;
  row: AdminProductDetailRow;
}>) {
  const readiness = productMatchingReadiness(row);
  const checkLabels: Record<string, string> = {
    brand_status: labels.matchingBrand,
    country_availability: labels.matchingMarkets,
    facts: labels.matchingFacts,
    image: labels.matchingImage,
    product_status: labels.matchingProduct,
    validation: labels.matchingValidation,
  };

  return (
    <div
      className={classNames(
        "mt-5 rounded-lg border p-4",
        readiness.ready
          ? "border-emerald-200 bg-emerald-50/70"
          : "border-amber-200 bg-amber-50/70",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-950">
            {labels.matchingReadiness}
          </h3>
          <p className="mt-1 text-sm text-gray-700">
            {readiness.primaryReason}
          </p>
        </div>
        <span
          className={classNames(
            "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
            readiness.ready
              ? "bg-white text-emerald-700 ring-emerald-200"
              : "bg-white text-amber-800 ring-amber-200",
          )}
        >
          {readiness.ready
            ? labels.matchingCanMatch
            : labels.matchingCannotMatchYet}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {readiness.checks.map((check) => (
          <div
            className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-2 text-xs ring-1 ring-gray-100"
            key={check.id}
            title={check.reason}
          >
            <span className="font-semibold text-gray-700">
              {checkLabels[check.id] ?? check.label}
            </span>
            <span
              className={classNames(
                "rounded-full px-2 py-0.5 font-semibold",
                check.passed
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-800",
              )}
            >
              {check.passed ? labels.matchingReady : labels.matchingNeedsWork}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductDetailPanel({
  accessToken,
  backHref,
  draft,
  error,
  errorMessage,
  locale,
  onImportDecision,
  onCorrectFacts,
  onIncreaseSafetyLimit,
  onClose,
  onDelete,
  onSave,
  mergeOptions,
  saving,
  setDraft,
}: Readonly<{
  accessToken: string;
  backHref: string;
  draft: AdminProductDetailRow;
  error: boolean;
  errorMessage: string | null;
  locale: Locale;
  onImportDecision: (
    row: AdminProductDetailRow,
    action: "approve_product" | "ignore_import" | "merge_product",
    mergeProductId: string | null,
    reviewerNote: string | null,
  ) => Promise<boolean>;
  onCorrectFacts: (row: AdminProductDetailRow) => Promise<AdminProductDetailRow | null>;
  onIncreaseSafetyLimit: (
    row: AdminProductDetailRow,
    factId: string,
  ) => Promise<boolean>;
  onClose: () => void;
  onDelete: (row: AdminProductDetailRow) => Promise<boolean>;
  onSave: (
    row: AdminProductDetailRow,
    options?: Readonly<{ changeNote?: string | null }>
  ) => Promise<boolean>;
  mergeOptions: AdminProductMergeOption[];
  saving: boolean;
  setDraft: (update: ProductDraftUpdate) => void;
}>) {
  const [mergeProductId, setMergeProductId] = useState(
    draft.productImportDuplicateProductIds.find((id) => id !== draft.id) ?? "",
  );
  const [reviewerNote, setReviewerNote] = useState("");
  const [localImagePreview, setLocalImagePreview] = useState<{
    imageUrl: string;
    targetImageUrl: string | null;
  } | null>(null);
  const viewLabels = productViewLabels[locale];
  const hasOpenImportReview = Boolean(draft.importReviewTaskId);
  const approvalBlockedMessage =
    draft.validation.status !== "pass"
      ? `Approval is blocked until validation passes: ${draft.validation.summary}`
      : null;
  const currentBusinessState = productBusinessState(draft);
  const approveDisabled =
    saving ||
    currentBusinessState === "approved" ||
    Boolean(approvalBlockedMessage);
  const manufacturerCountryCodes = normalizedProductCountryCodes(
    draft.manufacturerCountryCodes,
  );
  const productCountryCodes = normalizedProductCountryCodes(
    draft.availableCountryCodes,
    manufacturerCountryCodes,
  ).filter((countryCode) => manufacturerCountryCodes.includes(countryCode));
  const safeProductCountryCodes =
    productCountryCodes.length > 0
      ? productCountryCodes
      : [manufacturerCountryCodes[0] ?? defaultProductCountryCode];
  const localized = adminLocalizedProductText(draft, locale);
  const fallbackLabel = adminLocalizedFallbackLabel(localized.title, locale);
  const localImagePreviewUrl = localImagePreview?.imageUrl ?? null;

  useEffect(
    () => () => {
      if (localImagePreviewUrl) {
        URL.revokeObjectURL(localImagePreviewUrl);
      }
    },
    [localImagePreviewUrl],
  );

  function handleLocalImagePreviewChange(
    imageUrl: string | null,
    targetImageUrl: string | null = null,
  ) {
    setLocalImagePreview((current) => {
      if (!imageUrl) {
        return null;
      }

      return {
        imageUrl,
        targetImageUrl:
          targetImageUrl ??
          (current?.imageUrl === imageUrl ? current.targetImageUrl : null),
      };
    });
  }

  function handleSavedImageLoad(imageUrl: string) {
    setLocalImagePreview((current) =>
      current?.targetImageUrl === imageUrl ? null : current
    );
  }

  function addManufacturerCountry(countryCode: string) {
    setDraft({
      ...draft,
      manufacturerCountryCodes: addProductCountryCode(
        manufacturerCountryCodes,
        countryCode,
      ),
    });
  }

  function removeManufacturerCountry(countryCode: string) {
    const nextManufacturerCountryCodes = removeProductCountryCode(
      manufacturerCountryCodes,
      countryCode,
    );
    const nextProductCountryCodes = safeProductCountryCodes.filter((code) =>
      nextManufacturerCountryCodes.includes(code),
    );
    const retainedProductCountryCodes =
      nextProductCountryCodes.length > 0
        ? nextProductCountryCodes
        : [nextManufacturerCountryCodes[0] ?? defaultProductCountryCode];

    setDraft({
      ...draft,
      availableCountryCodes: retainedProductCountryCodes,
      countryPricing: draft.countryPricing.filter((item) =>
        retainedProductCountryCodes.includes(item.countryCode)
      ),
      manufacturerCountryCodes: nextManufacturerCountryCodes,
      regulatoryApprovals: draft.regulatoryApprovals.filter((approval) => {
        const approvalCountryCode = normalizeProductCountryCode(approval.scopeCode);

        return approval.scopeType !== "country" ||
          Boolean(
            approvalCountryCode &&
            retainedProductCountryCodes.includes(approvalCountryCode)
          );
      }),
    });
  }

  function addAvailableCountry(countryCode: string) {
    const normalizedCountryCode = normalizeProductCountryCode(countryCode);

    if (
      !normalizedCountryCode ||
      !manufacturerCountryCodes.includes(normalizedCountryCode)
    ) {
      return;
    }

    const nextCountryCodes = addProductCountryCode(
      safeProductCountryCodes,
      normalizedCountryCode,
    );

    setDraft({
      ...draft,
      availableCountryCodes: nextCountryCodes,
      countryPricing: [
        ...draft.countryPricing.filter((item) =>
          nextCountryCodes.includes(item.countryCode)
        ),
        ...(draft.countryPricing.some((item) =>
          item.countryCode === normalizedCountryCode
        )
          ? []
          : [{
              countryCode: normalizedCountryCode,
              currency: "THB",
              priceUpdatedAt: null,
              rrpPriceAmount: null
            }])
      ],
    });
  }

  function removeAvailableCountry(countryCode: string) {
    const normalizedCountryCode = normalizeProductCountryCode(countryCode);
    const nextCountryCodes = removeProductCountryCode(
      safeProductCountryCodes,
      countryCode,
    );

    setDraft({
      ...draft,
      availableCountryCodes: nextCountryCodes,
      countryPricing: draft.countryPricing.filter((item) =>
        nextCountryCodes.includes(item.countryCode)
      ),
      regulatoryApprovals: draft.regulatoryApprovals.filter((approval) =>
        approval.scopeType !== "country" ||
        approval.scopeCode !== normalizedCountryCode
      ),
    });
  }

  function updateCountryRegulatoryApproval(
    countryCode: string,
    patch: Readonly<{
      agencyCode?: string;
      agencyName?: string;
      approvalNumber?: string;
      evidenceUrl?: string | null;
    }>,
  ) {
    const normalizedCountryCode = normalizeProductCountryCode(countryCode);

    if (!normalizedCountryCode) {
      return;
    }

    const existing = draft.regulatoryApprovals.find((approval) =>
      approval.scopeType === "country" &&
      approval.scopeCode === normalizedCountryCode
    );
    const selectedAgency = patch.agencyCode
      ? regulatoryAgencyByCode(normalizedCountryCode, patch.agencyCode)
      : existing
        ? regulatoryAgencyByCode(normalizedCountryCode, existing.agencyCode)
        : defaultRegulatoryAgencyForCountry(normalizedCountryCode);
    const approvalNumber =
      patch.approvalNumber !== undefined
        ? patch.approvalNumber
        : existing?.approvalNumber ?? "";
    const evidenceUrl =
      patch.evidenceUrl !== undefined
        ? patch.evidenceUrl
        : existing?.evidenceUrl ?? null;
    const keepDraftRow = Boolean(approvalNumber.trim());
    const remainingApprovals = draft.regulatoryApprovals.filter((approval) =>
      !(
        approval.scopeType === "country" &&
        approval.scopeCode === normalizedCountryCode
      )
    );

    const nextDraft: AdminProductDetailRow = {
      ...draft,
      regulatoryApprovals: keepDraftRow
        ? [
            ...remainingApprovals,
            {
              agencyCode: selectedAgency.agencyCode,
              agencyName: selectedAgency.agencyName,
              approvalNumber,
              approvalType: "product_registration",
              createdAt: existing?.createdAt ?? null,
              evidenceUrl,
              id: existing?.id ?? null,
              metadata: existing?.metadata ?? {},
              productId: draft.id,
              scopeCode: normalizedCountryCode,
              scopeType: "country",
              source: existing?.source ?? "admin",
              status: "verified",
              updatedAt: existing?.updatedAt ?? null,
            },
          ]
        : remainingApprovals
    };

    setDraft(nextDraft);

    return onSave(nextDraft, {
      changeNote: "product_regulatory_approval_associated"
    });
  }

  function updateCountryPricing(
    countryCode: string,
    patch: Partial<AdminProductDetailRow["countryPricing"][number]>,
  ) {
    const normalizedCountryCode = normalizeProductCountryCode(countryCode);

    if (!normalizedCountryCode) {
      return;
    }

    setDraft({
      ...draft,
      countryPricing: safeProductCountryCodes.map((code) => {
        const current = draft.countryPricing.find(
          (item) => item.countryCode === code
        ) ?? {
          countryCode: code,
          currency: "THB",
          priceUpdatedAt: null,
          rrpPriceAmount: null
        };

        return code === normalizedCountryCode
          ? {
              ...current,
              ...patch,
              countryCode: code
            }
          : current;
      }),
    });
  }

  return (
    <section className="mt-8 space-y-6">
      <a
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#126B4F] hover:text-[#0F5C45]"
        href={backHref}
      >
        <ArrowLeft aria-hidden={true} className="size-4" strokeWidth={2.25} />
        {viewLabels.backToProducts}
      </a>
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <ProductImagePreview
              alt={localized.title.value}
              onImageLoad={handleSavedImageLoad}
              previewImageUrl={localImagePreviewUrl}
              row={draft}
              size="lg"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-col gap-1">
                  <h2 className="text-xl font-semibold leading-8 text-gray-900">
                    {localized.title.value}
                  </h2>
                  <LocalizedFallbackBadge label={fallbackLabel} />
                </div>
                <span
                  className={classNames(
                    "rounded-full border px-2.5 py-1 text-xs font-medium",
                    productBusinessStateClass(currentBusinessState),
                  )}
                >
                  {productBusinessStateLabel(currentBusinessState, locale)}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {[
                  draft.brandName,
                  productStatusLabel(draft.productKind, locale),
                  draft.productAudience === "both"
                    ? null
                    : productStatusLabel(draft.productAudience, locale),
                  safeProductCountryCodes.length > 0
                    ? `${viewLabels.markets} ${safeProductCountryCodes.join(", ")}`
                    : draft.region,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
        </div>

        <ProductMatchingReadinessPanel labels={viewLabels} row={draft} />

        <div className="mt-5 space-y-4">
          <div className="max-w-xl">
            <ProductCountryManager
              addCountryLabel={viewLabels.addCountry}
              countryCodes={manufacturerCountryCodes}
              label={viewLabels.manufacturerCountries}
              onAdd={addManufacturerCountry}
              onRemove={removeManufacturerCountry}
              removeLabel={viewLabels.remove}
              variant="compact"
            />
          </div>
          <ProductCountryManager
            addCountryLabel={viewLabels.addCountry}
            allowedCountryCodes={manufacturerCountryCodes}
            countryCodes={safeProductCountryCodes}
            countryPricing={draft.countryPricing}
            disabledReason={
              manufacturerCountryCodes.length < 1
                ? viewLabels.addManufacturerCountryFirst
                : null
            }
            label={viewLabels.productCountries}
            onAdd={addAvailableCountry}
            onPricingChange={updateCountryPricing}
            onRegulatoryApprovalChange={updateCountryRegulatoryApproval}
            onRemove={removeAvailableCountry}
            pricingLabels={{
              agency: viewLabels.agency,
              approvalNumber: viewLabels.approvalNumber,
              associateApproval: viewLabels.associateApproval,
              authority: viewLabels.authority,
              cancel: viewLabels.close,
              country: viewLabels.country,
              currency: viewLabels.currency,
              evidenceUrl: viewLabels.evidenceUrl,
              inheritedApproval: viewLabels.inheritedApproval ?? "Inherited",
              notAvailable: viewLabels.notAvailable,
              priceUpdated: viewLabels.priceUpdated,
              rrp: viewLabels.rrp,
              saveAssociation: viewLabels.saveAssociation,
            }}
            regulatoryApprovals={draft.regulatoryApprovals}
            removeLabel={viewLabels.remove}
          />
        </div>

      <ProductIdentifiersEditor
        draft={draft}
        setDraft={setDraft}
        viewLabels={viewLabels}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">
          {viewLabels.brand}
          <input
            className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              setDraft({
                ...draft,
                brandName: event.target.value.trim() || null,
              })
            }
            type="text"
            value={draft.brandName ?? ""}
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          {viewLabels.productUrl}
          <input
            className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              setDraft({
                ...draft,
                productUrl: event.target.value,
              })
            }
            type="url"
            value={draft.productUrl}
          />
        </label>
        <ProductImageDropzone
          accessToken={accessToken}
          onImageUrlChange={(imageUrl) =>
            setDraft((currentDraft) => ({
              ...currentDraft,
              imageCandidates: [
                ...new Set([
                  ...(imageUrl ? [imageUrl] : []),
                  ...currentDraft.imageCandidates,
                ]),
              ],
              imageUrl,
            }))
          }
          onPreviewImageLoad={handleSavedImageLoad}
          onPreviewImageUrlChange={handleLocalImagePreviewChange}
          previewImageUrl={localImagePreviewUrl}
          productId={draft.id}
          row={draft}
          storedImageUrl={draft.imageUrl}
          viewLabels={viewLabels}
        />
        <label className="text-sm font-medium text-gray-700">
          {viewLabels.productType}
          <select
            className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              setDraft({
                ...draft,
                productKind: event.target
                  .value as AdminProductDetailRow["productKind"],
              })
            }
            value={draft.productKind}
          >
            {productKinds.map((item) => (
              <option key={item} value={item}>
                {productStatusLabel(item, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          {viewLabels.productForm}
          <select
            className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              setDraft({
                ...draft,
                productForm: event.target
                  .value as AdminProductDetailRow["productForm"],
              })
            }
            value={draft.productForm}
          >
            {productForms.map((item) => (
              <option key={item} value={item}>
                {productStatusLabel(item, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          {viewLabels.audience}
          <select
            className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              setDraft({
                ...draft,
                productAudience: event.target
                  .value as AdminProductDetailRow["productAudience"],
              })
            }
            value={draft.productAudience}
          >
            {productAudiences.map((item) => (
              <option key={item} value={item}>
                {productStatusLabel(item, locale)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ProductTranslationEditor
        draft={draft}
        locale={locale}
        setDraft={setDraft}
        viewLabels={viewLabels}
      />

      <ProductFactsEditor
        draft={draft}
        onIncreaseSafetyLimit={onIncreaseSafetyLimit}
        saving={saving}
        setDraft={setDraft}
        viewLabels={viewLabels}
      />

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-gray-900">
          {viewLabels.shopAvailability}
        </h3>
        {draft.shopAvailability.length > 0 ? (
          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-100 text-left text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Shop</th>
                  <th className="px-3 py-2 font-semibold">{viewLabels.status}</th>
                  <th className="px-3 py-2 font-semibold">{viewLabels.stock}</th>
                  <th className="px-3 py-2 font-semibold">{viewLabels.retailPrice}</th>
                  <th className="px-3 py-2 font-semibold">Wholesale</th>
                  <th className="px-3 py-2 font-semibold">{viewLabels.backorderPolicy}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {draft.shopAvailability.map((shop) => (
                  <tr key={shop.organisationId}>
                    <td className="px-3 py-2 font-semibold text-gray-900">
                      {shop.organisationName}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {productStatusLabel(shop.status, locale)}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {shop.stockQuantity}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {shop.retailPriceAmount !== null
                        ? `${shop.retailPriceAmount} ${shop.currency}`
                        : "-"}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {shop.wholesalePriceAmount !== null
                        ? `${shop.wholesalePriceAmount} ${shop.currency}`
                        : "-"}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {productStatusLabel(shop.backorderPolicy, locale)}
                      {shop.leadTimeDays !== null
                        ? ` · ${shop.leadTimeDays}d`
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500">
            {viewLabels.noShopAvailability}
          </p>
        )}
      </div>

      {hasOpenImportReview ? (
        <div className="mt-5 space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {viewLabels.importReview}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              {viewLabels.importReviewHint}
            </p>
            {approvalBlockedMessage ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                {approvalBlockedMessage}
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <select
              aria-label={viewLabels.duplicateProduct}
              className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
              onChange={(event) => setMergeProductId(event.target.value)}
              value={mergeProductId}
            >
              <option value="">{viewLabels.duplicateProduct}</option>
              {mergeOptions.map((product) => {
                const productTitle = adminLocalizedProductText(product, locale)
                  .title.value;

                return (
                  <option key={product.id} value={product.id}>
                    {[productTitle, product.brandName]
                      .filter(Boolean)
                      .join(" · ")}
                  </option>
                );
              })}
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
                    reviewerNote.trim() || null,
                  )
                ) {
                  onClose();
                }
              }}
              type="button"
            >
              {viewLabels.markDuplicate}
            </button>
          </div>
          <label className="grid gap-2 text-sm font-medium text-gray-700">
            {viewLabels.reviewerNote}
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
          {errorMessage ?? viewLabels.updateError}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            aria-label={viewLabels.correctFactsWithAi}
            className="inline-flex min-h-9 items-center justify-center rounded-md bg-[#2563EB] px-3 py-2 text-sm font-semibold text-white ring-1 ring-[#2563EB] hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving}
            onClick={() => void onCorrectFacts(draft)}
            title={viewLabels.correctFactsWithAi}
            type="button"
          >
            {viewLabels.correctFactsWithAi}
          </button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {currentBusinessState === "ignored" ? (
            <button
              className="inline-flex min-h-9 items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              onClick={async () => {
                if (!window.confirm(viewLabels.deleteIgnoredConfirm)) {
                  return;
                }

                if (await onDelete(draft)) {
                  onClose();
                }
              }}
              type="button"
            >
              {viewLabels.deleteAction}
            </button>
          ) : null}
          <span className="isolate inline-flex rounded-md shadow-xs">
            <button
              className="relative inline-flex items-center rounded-l-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 focus:z-10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              onClick={onClose}
              type="button"
            >
              {viewLabels.close}
            </button>
            <button
              className="relative -ml-px inline-flex items-center rounded-r-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 focus:z-10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              onClick={() => void onSave(draft)}
              type="button"
            >
              {saving ? viewLabels.saving : viewLabels.save}
            </button>
          </span>
          <span className="isolate inline-flex rounded-md shadow-xs">
            <button
              className="relative inline-flex items-center rounded-l-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 focus:z-10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving || currentBusinessState === "ignored"}
              onClick={async () => {
                const ignoredDraft: AdminProductDetailRow = {
                  ...draft,
                  status: "ignored",
                };

                if (hasOpenImportReview) {
                  if (
                    await onImportDecision(
                      ignoredDraft,
                      "ignore_import",
                      null,
                      reviewerNote.trim() || null,
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
              {viewLabels.ignoredAction}
            </button>
            <button
              className="relative -ml-px inline-flex items-center rounded-r-md bg-[#1FA77A] px-3 py-2 text-sm font-semibold text-white ring-1 ring-[#1FA77A] hover:bg-[#168763] focus:z-10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={approveDisabled}
              onClick={async () => {
                const approvedDraft: AdminProductDetailRow = {
                  ...draft,
                  labelStatus:
                    draft.facts.length > 0 ? "parsed" : draft.labelStatus,
                  status: "approved",
                };

                if (hasOpenImportReview) {
                  if (
                    await onImportDecision(
                      approvedDraft,
                      "approve_product",
                      null,
                      reviewerNote.trim() || null,
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
              {viewLabels.approve}
            </button>
          </span>
        </div>
      </div>
      </div>
    </section>
  );
}
