"use client";

import { useState } from "react";
import type { AdminProductRow, AdminProductsData } from "@/lib/admin-products";
import {
  adminLocalizedFallbackLabel,
  adminLocalizedProductText,
} from "@/lib/admin-localized-display";
import { productMatchesSearch } from "@/lib/admin-product-search-client";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode,
} from "@/lib/product-countries";
import { type Locale } from "@/lib/i18n";
import {
  BusinessStatsGrid,
  classNames,
  readableToken,
  type BusinessMetric,
} from "@/components/admin/dashboard-shared";
import { AdminModal } from "@/components/admin/ui";
import {
  addProductCountryCode,
  adminResponseErrorMessage,
  normalizedProductCountryCodes,
  productAudiences,
  productBusinessState,
  productBusinessStateClass,
  productBusinessStateForMetric,
  productBusinessStateLabel,
  productBusinessStates,
  productFactPayloads,
  productKinds,
  productManufacturerKey,
  productManufacturerKeyFromMetricId,
  productManufacturerMetricId,
  productMatchesMetricFilter,
  productMetricCards,
  productMetricForBusinessState,
  productStatusLabel,
  productViewLabels,
  removeProductCountryCode,
  type ProductBusinessState,
  type ProductMetricFilter,
} from "@/components/admin/product-view-helpers";
import {
  LocalizedFallbackBadge,
  ProductCard,
  ProductCountryManager,
  ProductFactsEditor,
  ProductInsightStat,
  ProductOffersEditor,
  ProductTranslationEditor,
} from "@/components/admin/product-view-ui";

export function AdminProductsView({
  accessToken,
  data,
  locale,
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
  const viewLabels = productViewLabels[locale];
  const normalizedSearch = search.trim().toLowerCase();
  const metrics = productMetricCards({ locale, rows, viewLabels });
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
          facts: productFactPayloads(row),
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
        rows?: AdminProductRow[];
      };
      const savedRow = payload.row
        ? { ...payload.row, decisionStats: row.decisionStats }
        : row;
      const updatedRows = new Map(
        (payload.rows && payload.rows.length > 0
          ? payload.rows
          : [savedRow]
        ).map((item) => [
          item.id,
          item.id === row.id
            ? { ...item, decisionStats: row.decisionStats }
            : item,
        ]),
      );

      setRows((currentRows) =>
        currentRows.map((item) => updatedRows.get(item.id) ?? item),
      );
      setDraft((currentDraft) =>
        currentDraft?.id === row.id ? savedRow : currentDraft,
      );
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

  async function correctProductFacts(row: AdminProductRow) {
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
      const correctedRow = payload.row;

      if (!correctedRow) {
        throw new Error("AI correction did not return a product row");
      }

      setRows((currentRows) =>
        currentRows.map((item) =>
          item.id === correctedRow.id ? correctedRow : item,
        ),
      );
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
    row: AdminProductRow,
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
        rows?: AdminProductRow[];
      };
      const savedRow = payload.row;

      if (!savedRow) {
        throw new Error("Safety limit update did not return a product row");
      }

      const updatedRows = new Map(
        (payload.rows && payload.rows.length > 0
          ? payload.rows
          : [savedRow]
        ).map((item) => [item.id, item]),
      );

      setRows((currentRows) =>
        currentRows.map((item) => updatedRows.get(item.id) ?? item),
      );
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
    row: AdminProductRow,
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
            brandName: row.brandName,
            description: row.description,
            descriptionEn: row.descriptionEn,
            descriptionTh: row.descriptionTh,
            fdaApprovalNumber: row.fdaApprovalNumber,
            imageUrl: row.imageUrl,
            manufacturerCountryCodes: row.manufacturerCountryCodes,
            mergeProductId,
            parsedFacts: productFactPayloads(row),
            productAudience: row.productAudience,
            productUrl: row.productUrl,
            reviewerNote,
            title: row.title,
            titleEn: row.titleEn,
            titleTh: row.titleTh,
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
              : row.status,
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
              : item,
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
        error instanceof Error ? error.message : viewLabels.updateError,
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
            aria-label={viewLabels.search}
            className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={viewLabels.searchPlaceholder}
            type="search"
            value={search}
          />
          <select
            aria-label={viewLabels.status}
            className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              handleStatusChange(
                event.target.value as ProductBusinessState | "",
              )
            }
            value={status}
          >
            <option value="">{viewLabels.allStates}</option>
            {productBusinessStates.map((item) => (
              <option key={item} value={item}>
                {productBusinessStateLabel(item, locale)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {filteredRows.map((row) => (
          <ProductCard
            key={row.id}
            locale={locale}
            onSelect={() => setDraft(row)}
            row={row}
            viewLabels={viewLabels}
          />
        ))}
      </div>

      {draft ? (
        <ProductModal
          accessToken={accessToken}
          draft={draft}
          error={errorId === draft.id}
          errorMessage={errorId === draft.id ? errorMessage : null}
          locale={locale}
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
  locale,
  onImportDecision,
  onCorrectFacts,
  onIncreaseSafetyLimit,
  onClose,
  onSave,
  products,
  saving,
  setDraft,
}: Readonly<{
  accessToken: string;
  draft: AdminProductRow;
  error: boolean;
  errorMessage: string | null;
  locale: Locale;
  onImportDecision: (
    row: AdminProductRow,
    action: "approve_product" | "ignore_import" | "merge_product",
    mergeProductId: string | null,
    reviewerNote: string | null,
  ) => Promise<boolean>;
  onCorrectFacts: (row: AdminProductRow) => Promise<AdminProductRow | null>;
  onIncreaseSafetyLimit: (
    row: AdminProductRow,
    factId: string,
  ) => Promise<boolean>;
  onClose: () => void;
  onSave: (row: AdminProductRow) => Promise<boolean>;
  products: AdminProductRow[];
  saving: boolean;
  setDraft: (row: AdminProductRow) => void;
}>) {
  const [mergeProductId, setMergeProductId] = useState(
    draft.productImportDuplicateProductIds.find((id) => id !== draft.id) ?? "",
  );
  const [reviewerNote, setReviewerNote] = useState("");
  const viewLabels = productViewLabels[locale];
  const hasOpenImportReview = Boolean(draft.importReviewTaskId);
  const approvalBlockedMessage =
    draft.validation.status !== "pass"
      ? `Approval is blocked until validation passes: ${draft.validation.summary}`
      : null;
  const duplicateOptions = products.filter(
    (product) =>
      draft.productImportDuplicateProductIds.includes(product.id) &&
      product.id !== draft.id,
  );
  const currentBusinessState = productBusinessState(draft);
  const approveDisabled =
    saving ||
    currentBusinessState === "approved" ||
    Boolean(approvalBlockedMessage);
  const mergeOptions =
    duplicateOptions.length > 0
      ? duplicateOptions
      : products.filter((product) => product.id !== draft.id).slice(0, 80);
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

    setDraft({
      ...draft,
      availableCountryCodes:
        nextProductCountryCodes.length > 0
          ? nextProductCountryCodes
          : [nextManufacturerCountryCodes[0] ?? defaultProductCountryCode],
      manufacturerCountryCodes: nextManufacturerCountryCodes,
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

    setDraft({
      ...draft,
      availableCountryCodes: addProductCountryCode(
        safeProductCountryCodes,
        normalizedCountryCode,
      ),
    });
  }

  function removeAvailableCountry(countryCode: string) {
    setDraft({
      ...draft,
      availableCountryCodes: removeProductCountryCode(
        safeProductCountryCodes,
        countryCode,
      ),
    });
  }

  return (
    <AdminModal onClose={onClose} panelClassName="max-w-3xl p-6 ring-gray-200">
      <div className="flex items-start justify-between gap-4 pr-12">
        <div>
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
          {localized.title.canonicalValue &&
          localized.title.canonicalValue !== localized.title.value ? (
            <p className="mt-1 text-xs text-gray-400">
              {viewLabels.sourceTitle}: {localized.title.canonicalValue}
            </p>
          ) : null}
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

      <div className="mt-5 grid gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
        {draft.decisionStats ? (
          <div>
            <p className="font-semibold text-gray-900">
              {viewLabels.recommendationDecisions}
            </p>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <ProductInsightStat
                label={viewLabels.chosen}
                value={draft.decisionStats.chosenPlanCount}
              />
              <ProductInsightStat
                label={viewLabels.nearMisses}
                value={draft.decisionStats.nearMissCount}
              />
              <ProductInsightStat
                label={viewLabels.rejected}
                value={draft.decisionStats.rejectedCount}
              />
            </div>
            {draft.decisionStats.topServingMultipliers.length > 0 ||
            draft.decisionStats.topRejectionReasons.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ...draft.decisionStats.topServingMultipliers,
                  ...draft.decisionStats.topRejectionReasons,
                ].map((item) => (
                  <span
                    className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700"
                    key={`${item.label}:${item.count}`}
                  >
                    {item.label} · {item.count}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {draft.validationCacheStatus === "stale" ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-sky-200 bg-white px-2.5 py-1 text-xs font-medium text-sky-800">
              {viewLabels.staleValidation}
            </span>
            <span className="text-xs text-gray-500">
              {viewLabels.staleValidationHint}
            </span>
          </div>
        ) : null}
        {draft.validation.status !== "pass" ? (
          <div>
            <p className="font-semibold text-gray-900">
              {viewLabels.validationBlockers}
            </p>
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
            <span className="font-semibold text-gray-900">
              {viewLabels.aiNotes}:{" "}
            </span>
            {draft.aiCorrectionNotes}
          </p>
        ) : null}
        {draft.sourceEvidence.sourceUrl ? (
          <p>
            <span className="font-semibold text-gray-900">
              {viewLabels.source}:{" "}
            </span>
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
          addCountryLabel={viewLabels.addCountry}
          countryCodes={manufacturerCountryCodes}
          label={viewLabels.manufacturerCountries}
          onAdd={addManufacturerCountry}
          onRemove={removeManufacturerCountry}
          removeLabel={viewLabels.remove}
        />
        <ProductCountryManager
          addCountryLabel={viewLabels.addCountry}
          allowedCountryCodes={manufacturerCountryCodes}
          countryCodes={safeProductCountryCodes}
          disabledReason={
            manufacturerCountryCodes.length < 1
              ? viewLabels.addManufacturerCountryFirst
              : null
          }
          label={viewLabels.productCountries}
          onAdd={addAvailableCountry}
          onRemove={removeAvailableCountry}
          removeLabel={viewLabels.remove}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">
          {viewLabels.productName}
          <input
            className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              setDraft({
                ...draft,
                title: event.target.value,
              })
            }
            type="text"
            value={draft.title}
          />
        </label>
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
        <label className="text-sm font-medium text-gray-700">
          {viewLabels.imageUrl}
          <input
            className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              setDraft({
                ...draft,
                imageUrl: event.target.value.trim() || null,
              })
            }
            type="url"
            value={draft.imageUrl ?? ""}
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          {viewLabels.productType}
          <select
            className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              setDraft({
                ...draft,
                productKind: event.target
                  .value as AdminProductRow["productKind"],
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
          {viewLabels.audience}
          <select
            className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              setDraft({
                ...draft,
                productAudience: event.target
                  .value as AdminProductRow["productAudience"],
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
        <label className="text-sm font-medium text-gray-700">
          {viewLabels.fdaApprovalNumber}
          <input
            className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              setDraft({
                ...draft,
                fdaApprovalNumber: event.target.value.trim() || null,
              })
            }
            type="text"
            value={draft.fdaApprovalNumber ?? ""}
          />
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

      <ProductOffersEditor
        accessToken={accessToken}
        draft={draft}
        locale={locale}
        setDraft={setDraft}
        viewLabels={viewLabels}
      />

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
                const ignoredDraft: AdminProductRow = {
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
                const approvedDraft: AdminProductRow = {
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
    </AdminModal>
  );
}
