"use client";

import { useState } from "react";
import Image from "next/image";
import type { AdminProductRow } from "@/lib/admin-products";
import {
  adminLocalizedFallbackLabel,
  adminLocalizedProductText
} from "@/lib/admin-localized-display";
import { siteLocaleRegistry, type Locale } from "@/lib/i18n";
import {
  productCountryLabel,
  productCountryOptions,
  type ProductCountryPricing
} from "@/lib/product-countries";
import { supportedOrganisationCurrencies } from "@/lib/currencies";
import {
  adminLocaleTextClass,
  classNames
} from "@/components/admin/dashboard-shared";
import {
  productBusinessState,
  productBusinessStateClass,
  productBusinessStateLabel,
  productDecisionSummary,
  productDoseUnitSelectOptions,
  productFactIssueMessages,
  productFactIssueSeverity,
  productFactSafetyLimitIncreaseLabel,
  productLocaleMeta,
  productStatusLabel,
  productTranslationFor,
  productTranslationLocales,
  productTranslationStatusClass,
  productTranslationStatusLabel
} from "@/components/admin/product-view-helpers";

export function ProductInsightStat({
  label,
  value
}: Readonly<{
  label: string;
  value: number;
}>) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-gray-200">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}

export function LocalizedFallbackBadge({
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

export function ProductCountryManager({
  addCountryLabel,
  allowedCountryCodes,
  countryCodes,
  countryPricing,
  disabledReason,
  label,
  onAdd,
  onPricingChange,
  onRemove,
  removeLabel
}: Readonly<{
  addCountryLabel: string;
  allowedCountryCodes?: readonly string[];
  countryCodes: readonly string[];
  countryPricing?: readonly ProductCountryPricing[];
  disabledReason?: string | null;
  label: string;
  onAdd: (countryCode: string) => void;
  onPricingChange?: (
    countryCode: string,
    patch: Partial<ProductCountryPricing>
  ) => void;
  onRemove: (countryCode: string) => void;
  removeLabel: string;
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
          aria-label={`${addCountryLabel}: ${label}`}
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
          <option value="">{addCountryLabel}</option>
          {availableOptions.map((country) => (
            <option key={country.code} value={country.code}>
              {country.label}
            </option>
          ))}
        </select>
      </div>
      {onPricingChange ? (
        <div className="mt-3 grid gap-2">
          {countryCodes.map((countryCode) => {
            const pricing = countryPricing?.find(
              (item) => item.countryCode === countryCode
            );

            return (
              <div
                className="grid gap-2 rounded-lg border border-emerald-100 bg-white p-2 sm:grid-cols-[minmax(0,1fr)_7rem_5.5rem_6.5rem_auto]"
                key={countryCode}
              >
                <div className="flex min-h-9 items-center text-xs font-semibold text-emerald-800">
                  {productCountryLabel(countryCode)}
                </div>
                <input
                  className="rounded-md bg-white px-2 py-1.5 text-xs text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    const validAmount =
                      event.target.value.trim() &&
                      Number.isFinite(parsed) &&
                      parsed >= 0;

                    onPricingChange(countryCode, {
                      pricingStatus: validAmount ? "ready" : "missing",
                      rrpPriceAmount: validAmount ? parsed : null
                    });
                  }}
                  placeholder="RRP"
                  step="0.01"
                  type="number"
                  value={pricing?.rrpPriceAmount ?? ""}
                />
                <select
                  className="rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
                  onChange={(event) =>
                    onPricingChange(countryCode, { currency: event.target.value })
                  }
                  value={pricing?.currency ?? "THB"}
                >
                  {supportedOrganisationCurrencies.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
                  onChange={(event) =>
                    onPricingChange(countryCode, {
                      pricingStatus:
                        event.target.value as ProductCountryPricing["pricingStatus"]
                    })
                  }
                  value={pricing?.pricingStatus ?? "missing"}
                >
                  <option value="missing">Missing</option>
                  <option value="ready">Ready</option>
                  <option value="review">Review</option>
                </select>
                <button
                  aria-label={`${removeLabel}: ${productCountryLabel(countryCode)}`}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 hover:bg-emerald-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={countryCodes.length <= 1}
                  onClick={() => onRemove(countryCode)}
                  type="button"
                >
                  {removeLabel}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {countryCodes.map((countryCode) => (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700"
              key={countryCode}
            >
              {productCountryLabel(countryCode)}
              <button
                aria-label={`${removeLabel}: ${productCountryLabel(countryCode)}`}
                className="rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold text-emerald-600 ring-1 ring-emerald-100 hover:bg-emerald-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={countryCodes.length <= 1}
                onClick={() => onRemove(countryCode)}
                type="button"
              >
                {removeLabel}
              </button>
            </span>
          ))}
        </div>
      )}
      {disabledReason ? (
        <p className="mt-2 text-xs font-medium text-amber-700">
          {disabledReason}
        </p>
      ) : null}
    </div>
  );
}

type ProductIdentifierType = AdminProductRow["identifiers"][number]["type"];

function identifierValue(row: AdminProductRow, type: ProductIdentifierType) {
  return row.identifiers.find((identifier) =>
    identifier.type === type && identifier.status === "active"
  )?.value ?? "";
}

function normalizedDraftIdentifierValue(
  type: ProductIdentifierType,
  value: string
) {
  const trimmed = value.trim();

  if (type === "ean13") {
    return trimmed.replace(/[\s-]/g, "");
  }

  return trimmed.replace(/\s+/g, " ").toUpperCase();
}

export function ProductIdentifiersEditor({
  draft,
  setDraft,
  viewLabels
}: Readonly<{
  draft: AdminProductRow;
  setDraft: (row: AdminProductRow) => void;
  viewLabels: Readonly<Record<string, string>>;
}>) {
  function updateIdentifier(type: ProductIdentifierType, value: string) {
    const trimmed = value.trim();
    const nextIdentifiers = draft.identifiers.filter(
      (identifier) => identifier.type !== type
    );

    setDraft({
      ...draft,
      identifiers: trimmed
        ? [
            ...nextIdentifiers,
            {
              confidence: "high",
              evidenceUrl: null,
              id: `draft:${type}`,
              normalizedValue: normalizedDraftIdentifierValue(type, trimmed),
              source: "admin",
              status: "active",
              type,
              updatedAt: null,
              value: type === "ean13"
                ? normalizedDraftIdentifierValue(type, trimmed)
                : trimmed
            }
          ]
        : nextIdentifiers
    });
  }

  const candidateRows = draft.identifierCandidates.filter((candidate) =>
    candidate.status === "pending" || candidate.status === "conflict"
  );

  return (
    <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            {viewLabels.productIdentifiers}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            {viewLabels.productIdentifiersHint}
          </p>
        </div>
        {candidateRows.length > 0 ? (
          <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800">
            {candidateRows.length} {viewLabels.identifierCandidates}
          </span>
        ) : null}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold text-gray-700">
          {viewLabels.ean13}
          <input
            className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            inputMode="numeric"
            maxLength={17}
            onChange={(event) => updateIdentifier("ean13", event.target.value)}
            placeholder="8851234567890"
            type="text"
            value={identifierValue(draft, "ean13")}
          />
        </label>
        <label className="text-xs font-semibold text-gray-700">
          {viewLabels.internalSku}
          <input
            className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              updateIdentifier("internal_sku", event.target.value)
            }
            type="text"
            value={identifierValue(draft, "internal_sku")}
          />
        </label>
        <label className="text-xs font-semibold text-gray-700">
          {viewLabels.manufacturerSku}
          <input
            className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              updateIdentifier("manufacturer_sku", event.target.value)
            }
            type="text"
            value={identifierValue(draft, "manufacturer_sku")}
          />
        </label>
      </div>
      {candidateRows.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-100 text-left text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 font-semibold">
                  {viewLabels.identifierType}
                </th>
                <th className="px-3 py-2 font-semibold">
                  {viewLabels.identifierValue}
                </th>
                <th className="px-3 py-2 font-semibold">
                  {viewLabels.source}
                </th>
                <th className="px-3 py-2 font-semibold">
                  {viewLabels.status}
                </th>
                <th className="px-3 py-2 text-right font-semibold">
                  {viewLabels.approve}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {candidateRows.map((candidate) => (
                <tr key={candidate.id}>
                  <td className="px-3 py-2 font-medium text-gray-800">
                    {candidate.type}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {candidate.value}
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {candidate.source}
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {candidate.status}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="rounded-md px-2.5 py-1 text-xs font-semibold text-[#126B4F] ring-1 ring-emerald-200 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={candidate.status === "conflict"}
                      onClick={() =>
                        updateIdentifier(candidate.type, candidate.value)
                      }
                      type="button"
                    >
                      {viewLabels.useCandidate}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function ProductCard({
  locale,
  onSelect,
  row,
  viewLabels
}: Readonly<{
  locale: Locale;
  onSelect: () => void;
  row: AdminProductRow;
  viewLabels: Readonly<Record<string, string>>;
}>) {
  const localized = adminLocalizedProductText(row, locale);
  const fallbackLabel = adminLocalizedFallbackLabel(localized.title, locale);
  const state = productBusinessState(row);
  const coveragePercent =
    row.decisionStats?.averageProductCoveragePercent ??
    row.recommendationHistory.averageProductCoveragePercent;
  const readyCountryPrice = row.countryPricing.find((item) =>
    item.rrpPriceAmount !== null
  );

  return (
    <button
      className="self-start rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:shadow-md"
      onClick={onSelect}
      type="button"
    >
      <div className="flex gap-4">
        {row.imageUrl ? (
          <Image
            alt=""
            className="size-20 rounded-lg object-cover ring-1 ring-gray-200"
            height={80}
            src={row.imageUrl}
            unoptimized={true}
            width={80}
          />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-lg bg-gray-50 text-xs font-semibold text-gray-400 ring-1 ring-gray-200">
            {row.platform.toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-semibold leading-6 text-gray-900">
                  {localized.title.value}
                </h3>
                <LocalizedFallbackBadge label={fallbackLabel} />
              </div>
              {localized.title.canonicalValue &&
              localized.title.canonicalValue !== localized.title.value ? (
                <p className="mt-0.5 text-xs text-gray-400">
                  {viewLabels.sourceTitle}: {localized.title.canonicalValue}
                </p>
              ) : null}
              <p className="mt-1 text-sm text-gray-500">
                {[
                  row.brandName,
                  productStatusLabel(row.productKind, locale),
                  row.productAudience === "both"
                    ? null
                    : productStatusLabel(row.productAudience, locale),
                  row.fdaApprovalNumber ? `FDA ${row.fdaApprovalNumber}` : null,
                  row.availableCountryCodes.length > 0
                    ? `${viewLabels.markets} ${row.availableCountryCodes.join(", ")}`
                    : null,
                  readyCountryPrice?.rrpPriceAmount !== null &&
                  readyCountryPrice?.rrpPriceAmount !== undefined
                    ? `RRP ${readyCountryPrice.rrpPriceAmount} ${readyCountryPrice.currency}`
                    : null
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <span
              className={classNames(
                "rounded-full border px-2.5 py-1 text-xs font-medium",
                productBusinessStateClass(state)
              )}
            >
              {productBusinessStateLabel(state, locale)}
            </span>
          </div>
          <div
            aria-label={viewLabels.translationStatus}
            className="mt-3 flex flex-wrap gap-1.5"
          >
            {productTranslationLocales(row).map((siteLocale) => {
              const translation = productTranslationFor(row, siteLocale.code);

              return (
                <span
                  className={classNames(
                    "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    siteLocale.code === "zh-CN"
                      ? adminLocaleTextClass("zh-CN", "label")
                      : siteLocale.code === "th"
                        ? adminLocaleTextClass("th", "label")
                        : "uppercase tracking-wide",
                    productTranslationStatusClass(translation.status)
                  )}
                  key={siteLocale.code}
                  title={`${siteLocale.nativeLabel}: ${productTranslationStatusLabel(translation.status, locale)}`}
                >
                  {siteLocale.label}{" "}
                  {productTranslationStatusLabel(translation.status, locale)}
                </span>
              );
            })}
          </div>
          {row.facts.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {row.facts.slice(0, 6).map((fact) => (
                <span
                  className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                  key={fact.id}
                >
                  {fact.name}
                  {fact.amount
                    ? ` ${fact.amount}${fact.unit ? ` ${fact.unit}` : ""}`
                    : ""}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-amber-700">
              {viewLabels.noParsedFacts}
            </p>
          )}
          <p className="mt-3 text-sm text-gray-500">
            {productDecisionSummary(row, locale)}
            {coveragePercent
              ? ` · ${viewLabels.averageClientFit} ${Math.round(coveragePercent)}%`
              : ""}
          </p>
        </div>
      </div>
    </button>
  );
}

export function ProductFactsEditor({
  draft,
  onIncreaseSafetyLimit,
  saving,
  setDraft,
  viewLabels
}: Readonly<{
  draft: AdminProductRow;
  onIncreaseSafetyLimit: (row: AdminProductRow, factId: string) => Promise<boolean>;
  saving: boolean;
  setDraft: (row: AdminProductRow) => void;
  viewLabels: Readonly<Record<string, string>>;
}>) {
  type ProductFact = AdminProductRow["facts"][number];

  function updateFact(index: number, patch: Partial<ProductFact>) {
    setDraft({
      ...draft,
      facts: draft.facts.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    });
  }

  function removeFact(index: number) {
    setDraft({
      ...draft,
      facts: draft.facts.filter((_, itemIndex) => itemIndex !== index)
    });
  }

  function addFact() {
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
    });
  }

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">
          {viewLabels.parsedFacts}
        </h3>
        <button
          className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-[#126B4F] ring-1 ring-emerald-200 hover:bg-emerald-50"
          onClick={addFact}
          type="button"
        >
          {viewLabels.addFact}
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {draft.facts.length > 0 ? (
          draft.facts.map((fact, index) => {
            const factIssues = productFactIssueMessages(fact);
            const issueSeverity = productFactIssueSeverity(factIssues);
            const hasIssues = issueSeverity !== "none";
            const highSeverity = issueSeverity === "high";
            const safetyLimitIncreaseLabel =
              productFactSafetyLimitIncreaseLabel(fact);
            const inputClass = classNames(
              "rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 outline-none focus:ring-2 focus:ring-[#1FA77A]",
              hasIssues ? "ring-amber-200" : "ring-gray-200"
            );

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
                  className={inputClass}
                  onChange={(event) =>
                    updateFact(index, { name: event.target.value })
                  }
                  placeholder={viewLabels.ingredient}
                  value={fact.name}
                />
                <input
                  className={inputClass}
                  inputMode="decimal"
                  onChange={(event) => {
                    const parsed = Number(event.target.value);

                    updateFact(index, {
                      amount:
                        event.target.value.trim() &&
                        Number.isFinite(parsed) &&
                        parsed >= 0
                          ? parsed
                          : null
                    });
                  }}
                  placeholder={viewLabels.amount}
                  value={fact.amount ?? ""}
                />
                <select
                  className={inputClass}
                  onChange={(event) =>
                    updateFact(index, {
                      unit: event.target.value.trim() || null
                    })
                  }
                  value={fact.unit ?? ""}
                >
                  <option value="">{viewLabels.unit}</option>
                  {productDoseUnitSelectOptions(fact.unit).map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <select
                  className={inputClass}
                  onChange={(event) =>
                    updateFact(index, {
                      confidence: event.target.value as ProductFact["confidence"]
                    })
                  }
                  value={fact.confidence}
                >
                  <option value="high">{viewLabels.confidenceHigh}</option>
                  <option value="moderate">{viewLabels.confidenceModerate}</option>
                  <option value="low">{viewLabels.confidenceLow}</option>
                </select>
                <div className="flex items-center justify-end gap-2">
                  {safetyLimitIncreaseLabel ? (
                    <button
                      className="rounded-md px-2 py-1 text-xs font-semibold text-[#126B4F] hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={saving}
                      onClick={() => void onIncreaseSafetyLimit(draft, fact.id)}
                      type="button"
                    >
                      {viewLabels.increaseLimit}
                    </button>
                  ) : null}
                  <button
                    className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                    onClick={() => removeFact(index)}
                    type="button"
                  >
                    {viewLabels.remove}
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
          })
        ) : (
          <span className="text-sm text-amber-700">
            {viewLabels.noParsedFacts}
          </span>
        )}
      </div>
    </div>
  );
}

export function ProductOffersEditor({
  accessToken,
  draft,
  locale,
  setDraft,
  viewLabels
}: Readonly<{
  accessToken: string;
  draft: AdminProductRow;
  locale: Locale;
  setDraft: (row: AdminProductRow) => void;
  viewLabels: Readonly<Record<string, string>>;
}>) {
  const [newOfferUrl, setNewOfferUrl] = useState("");
  const [newOfferCommissionRate, setNewOfferCommissionRate] = useState("");
  const [offerBusy, setOfferBusy] = useState(false);

  async function addOffer() {
    const url = newOfferUrl.trim();

    if (!url) {
      return;
    }

    setOfferBusy(true);

    try {
      const response = await fetch(`/api/admin/products/${draft.id}/offers`, {
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
      });

      if (!response.ok) {
        throw new Error("Unable to add offer");
      }

      const payload = (await response.json()) as { row?: AdminProductRow };

      if (payload.row) {
        setDraft({ ...payload.row, decisionStats: draft.decisionStats });
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
        setDraft({ ...payload.row, decisionStats: draft.decisionStats });
      }
    } finally {
      setOfferBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold text-gray-900">
        {viewLabels.offers}
      </h3>
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
                    productStatusLabel(offer.linkType, locale),
                    offer.platform,
                    offer.commissionRate !== null
                      ? `${(offer.commissionRate * 100).toFixed(1)}% commission`
                      : null,
                    offer.priceAmount !== null
                      ? `${offer.priceAmount} ${offer.currency}`
                      : null,
                    productStatusLabel(offer.availabilityStatus, locale)
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <button
                className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={offerBusy}
                onClick={() => void removeOffer(offer.id)}
                type="button"
              >
                {viewLabels.remove}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-gray-500">{viewLabels.noOffers}</p>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
        <input
          className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-[#1FA77A]"
          onChange={(event) => setNewOfferUrl(event.target.value)}
          placeholder={viewLabels.offerUrl}
          type="url"
          value={newOfferUrl}
        />
        <input
          className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-[#1FA77A]"
          min="0"
          onChange={(event) => setNewOfferCommissionRate(event.target.value)}
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
          {viewLabels.add}
        </button>
      </div>
    </div>
  );
}

export function ProductTranslationEditor({
  draft,
  locale,
  setDraft,
  viewLabels
}: Readonly<{
  draft: AdminProductRow;
  locale: Locale;
  setDraft: (row: AdminProductRow) => void;
  viewLabels: Readonly<Record<string, string>>;
}>) {
  const [selectedTranslationLocale, setSelectedTranslationLocale] =
    useState<string>(siteLocaleRegistry[0]?.code ?? "en");
  const translationLocales = productTranslationLocales(draft);
  const activeTranslationLocale = translationLocales.some(
    (siteLocale) => siteLocale.code === selectedTranslationLocale
  )
    ? selectedTranslationLocale
    : (translationLocales[0]?.code ?? "en");
  const activeTranslationMeta = productLocaleMeta(activeTranslationLocale);
  const activeTranslation = productTranslationFor(
    draft,
    activeTranslationLocale
  );

  function translationFor(locale: string) {
    return productTranslationFor(draft, locale);
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
        status:
          hasTitle && hasDescription
            ? ("complete" as const)
            : hasTitle || hasDescription
              ? ("draft" as const)
              : ("missing" as const),
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

  return (
    <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            {viewLabels.translations}
          </h3>
        </div>
        <span
          className={classNames(
            "rounded-full border px-2.5 py-1 text-xs font-semibold",
            productTranslationStatusClass(activeTranslation.status)
          )}
        >
          {activeTranslationMeta.label}{" "}
          {productTranslationStatusLabel(activeTranslation.status, locale)}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {translationLocales.map((siteLocale) => {
          const translation = translationFor(siteLocale.code);
          const selected = siteLocale.code === activeTranslationLocale;

          return (
            <button
              className={classNames(
                "rounded-full border px-2 py-0.5 text-[11px] font-semibold transition",
                siteLocale.code === "zh-CN"
                  ? adminLocaleTextClass("zh-CN", "label")
                  : siteLocale.code === "th"
                    ? adminLocaleTextClass("th", "label")
                    : "uppercase tracking-wide",
                productTranslationStatusClass(translation.status),
                selected
                  ? "ring-2 ring-[#1FA77A] ring-offset-1"
                  : "hover:border-emerald-200 hover:text-[#126B4F]"
              )}
              key={siteLocale.code}
              onClick={() => setSelectedTranslationLocale(siteLocale.code)}
              title={`${siteLocale.nativeLabel}: ${productTranslationStatusLabel(translation.status, locale)}`}
              type="button"
            >
              {siteLocale.label}{" "}
              {productTranslationStatusLabel(translation.status, locale)}
            </button>
          );
        })}
      </div>
      <div className="mt-4 grid gap-4">
        <label className="text-sm font-medium text-gray-700">
          {viewLabels.title} · {activeTranslationMeta.nativeLabel}
          <input
            className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              updateTranslation(activeTranslationLocale, {
                title: event.target.value
              })
            }
            type="text"
            value={activeTranslation.title ?? ""}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-gray-700">
          {viewLabels.description} · {activeTranslationMeta.nativeLabel}
          <textarea
            className="min-h-28 resize-y rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A]"
            onChange={(event) =>
              updateTranslation(activeTranslationLocale, {
                description: event.target.value
              })
            }
            value={activeTranslation.description ?? ""}
          />
        </label>
      </div>
    </div>
  );
}
