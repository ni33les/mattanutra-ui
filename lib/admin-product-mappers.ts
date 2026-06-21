import type {
  AdminProductFact,
  AdminProductTranslation,
  AdminProductTranslationStatus,
  AdminProductRow,
  ProductValidationCacheStatus
} from "./admin-product-types.ts";
import type { ProductDbRow, FactDbPayload } from "./admin-product-types.ts";
import type { AdminProductDecisionStats } from "@/lib/admin-recommendation-insights";
import type { ValidationResult } from "@/lib/product-validation";
import {
  numberOrNull,
  isoOrNull,
  arrayPayload,
  productCountryCodesFromDb,
  productAudienceFromUnknown,
  productAudienceFromText,
  aiCorrectionNotesFromSnapshot
} from "./admin-product-helpers.ts";
import {
  normalizeCurrencyCode,
  normalizeProductCountryCode,
  type ProductCountryPricing
} from "@/lib/product-countries";
import {
  productIdentifierCandidatesFromPayload,
  productIdentifiersFromPayload
} from "@/lib/product-identifiers";
import {
  effectiveRegulatoryApprovalsForCountry,
  productRegulatoryApprovalsFromPayload
} from "@/lib/product-regulatory-approvals";
const randomUUID = () => globalThis.crypto.randomUUID();

import {
  normalizeProductFactName,
  normalizeProductFactKey,
  productFactLooksLikeConcentration,
  productFactAliasKeys
} from "@/lib/product-recommendations";
import { normalizeDoseUnit, comparableDoseAmount, parseDoseLimit, doseExceedsLimit } from "@/lib/dose-conversion";
import { validateProduct, validationCacheMismatchReasons } from "@/lib/product-validation";
import { defaultLocale, resolveLocalizedText } from "@/lib/i18n";

// Pure mapping / transformation functions extracted as part of Sprint 2 god-module split.

export function normalizeFact(fact: FactDbPayload): AdminProductFact {
  const amount = numberOrNull(fact.amount);
  const unit = typeof fact.unit === "string" ? fact.unit : null;
  const rawName = String(fact.name ?? fact.normalizedName ?? "");
  const name = normalizeProductFactName(rawName) || rawName;
  const normalizedName =
    normalizeProductFactKey(rawName) ||
    (typeof fact.normalizedName === "string" && fact.normalizedName
      ? normalizeProductFactKey(fact.normalizedName)
      : "");
  const aliasKeys = productFactAliasKeys(
    rawName,
    Array.isArray(fact.aliases) ? fact.aliases : []
  );
  const doseUnit = unit ? normalizeDoseUnit(unit) : null;
  const comparableAmount =
    amount !== null && doseUnit && !productFactLooksLikeConcentration(rawName)
      ? comparableDoseAmount(
          {
            amount,
            originalText: `${amount} ${doseUnit}`,
            unit: doseUnit
          },
          normalizedName
        )
      : null;

  return {
    amount,
    aliasKeys,
    comparableAmount,
    confidence: fact.confidence ?? "moderate",
    foodId: fact.foodId ?? null,
    id: fact.id ?? randomUUID(),
    itemType: fact.itemType ?? "supplement",
    maxAmount: numberOrNull(fact.maxAmount),
    maxUnit: typeof fact.maxUnit === "string" ? fact.maxUnit : null,
    name: name || normalizedName,
    normalizedName,
    nutrientId: fact.nutrientId ?? null,
    safetyFlags: Array.isArray(fact.safetyFlags)
      ? fact.safetyFlags.filter((item): item is string => typeof item === "string")
      : [],
    servingLabel: fact.servingLabel ?? null,
    source: typeof fact.source === "string" ? fact.source : null,
    sourceText: typeof fact.sourceText === "string" ? fact.sourceText : null,
    sourceUrl: typeof fact.sourceUrl === "string" ? fact.sourceUrl : null,
    supplementAudience: productAudienceFromUnknown(fact.supplementAudience) ?? "both",
    supplementId: fact.supplementId ?? null,
    supplementStatus: fact.supplementStatus ?? null,
    unit
  };
}

export function productSafetyPasses(facts: readonly AdminProductFact[], rawFacts: unknown) {
  const payloads = arrayPayload(rawFacts) as FactDbPayload[];

  for (const [index, fact] of facts.entries()) {
    const payload = payloads[index];

    if (payload?.supplementStatus === "blocked") {
      return false;
    }

    const amount = numberOrNull(payload?.amount);
    const unit = typeof payload?.unit === "string" ? payload.unit : null;
    const rawName = String(payload?.name ?? fact.name ?? fact.normalizedName ?? "");

    if (productFactLooksLikeConcentration(rawName)) {
      continue;
    }

    const maxAmount = numberOrNull(payload?.maxAmount);
    const maxUnit =
      typeof payload?.maxUnit === "string" ? payload.maxUnit : null;
    const doseUnit = unit ? normalizeDoseUnit(unit) : null;
    const limit = parseDoseLimit(maxAmount, maxUnit);

    if (amount !== null && doseUnit && limit) {
      const exceeds = doseExceedsLimit(
        {
          amount,
          originalText: `${amount} ${doseUnit}`,
          unit: doseUnit
        },
        limit,
        fact.normalizedName
      );

      if (exceeds === true) {
        return false;
      }
    }
  }

  return true;
}

export function roundedDoseAmount(value: number) {
  return Math.ceil(value * 1_000_000) / 1_000_000;
}

export function validationLabel(validation: ValidationResult) {
  if (validation.reasons.includes("missing_image")) {
    return "Missing Image";
  }

  if (
    validation.reasons.includes("no_dosed_facts") ||
    validation.reasons.includes("no_canonical_match")
  ) {
    return "Missing Facts";
  }

  if (
    validation.reasons.includes("dirty_name") ||
    validation.reasons.includes("concentration_only") ||
    validation.reasons.includes("source_conflict")
  ) {
    return "Dirty Data";
  }

  if (validation.status === "pass") {
    return "Approved";
  }

  return "Needs Review";
}

export function validationCacheStatusForRow(
  row: Pick<ProductDbRow, "validation_reasons" | "validation_status" | "validation_summary">,
  validation: ValidationResult
) {
  const staleReasons = validationCacheMismatchReasons(
    {
      reasons: row.validation_reasons ?? [],
      status: row.validation_status,
      summary: row.validation_summary
    },
    validation
  );
  const status: ProductValidationCacheStatus = !row.validation_status
    ? "missing"
    : staleReasons.length > 0
      ? "stale"
      : "fresh";

  return {
    staleReasons,
    status
  };
}

export function validationForRow(
  row: Pick<
    ProductDbRow,
    "image_url" | "label_status" | "product_url" | "source_url" | "title" | "title_en"
  >,
  facts: readonly AdminProductFact[],
  rawFacts: unknown
) {
  const payloads = arrayPayload(rawFacts) as FactDbPayload[];
  const validationFacts = facts.map((fact, index) => {
    const payload = payloads[index] ?? {};

    return {
      amount: fact.amount,
      confidence: fact.confidence,
      foodId: fact.foodId,
      itemType: fact.itemType,
      maxAmount: payload.maxAmount,
      maxUnit: payload.maxUnit,
      name: fact.name,
      normalizedName: fact.normalizedName,
      nutrientId: fact.nutrientId,
      source: fact.source,
      sourceText: fact.sourceText,
      supplementId: fact.supplementId,
      supplementStatus: payload.supplementStatus,
      unit: fact.unit
    };
  });

  return validateProduct({
    facts: validationFacts,
    imageUrl: row.image_url,
    labelStatus: row.label_status,
    productUrl: row.product_url,
    sourceUrl: row.source_url,
    title: row.title_en ?? row.title
  });
}

export function persistedValidationForRow(row: ProductDbRow) {
  return {
    checkedAt: row.validation_checked_at
      ? new Date(row.validation_checked_at).toISOString()
      : null,
    reasons: row.validation_reasons ?? [],
    status: row.validation_status,
    summary: row.validation_summary
  };
}

function translationStatus(value: unknown): AdminProductTranslationStatus {
  return value === "complete" || value === "missing" ? value : "draft";
}

function normalizeTranslations(row: ProductDbRow) {
  const translations: Record<string, AdminProductTranslation> = {};
  const raw = row.translations && typeof row.translations === "object"
    ? row.translations as Record<string, unknown>
    : {};

  for (const [locale, value] of Object.entries(raw)) {
    const record = value && typeof value === "object"
      ? value as Record<string, unknown>
      : {};
    const title = typeof record.title === "string" && record.title.trim()
      ? record.title.trim()
      : null;
    const description =
      typeof record.description === "string" && record.description.trim()
        ? record.description.trim()
        : null;

    translations[locale] = {
      description,
      locale,
      status: translationStatus(record.status),
      title,
      updatedAt: isoOrNull(
        typeof record.updatedAt === "string" || record.updatedAt instanceof Date
          ? record.updatedAt
          : null
      )
    };
  }

  const legacyRows: Array<{
    description: string | null;
    locale: string;
    title: string | null;
  }> = [
    {
      description: row.description_en ?? row.description,
      locale: "en",
      title: row.title_en ?? row.title
    },
    {
      description: row.description_th,
      locale: "th",
      title: row.title_th
    }
  ];

  for (const legacy of legacyRows) {
    if (translations[legacy.locale]) {
      continue;
    }

    if (!legacy.title && !legacy.description) {
      continue;
    }

    translations[legacy.locale] = {
      description: legacy.description,
      locale: legacy.locale,
      status: legacy.title && legacy.description ? "complete" : "draft",
      title: legacy.title,
      updatedAt: isoOrNull(row.updated_at)
    };
  }

  return translations;
}

export function rowFromDb(
  row: ProductDbRow,
  decisionStats?: AdminProductDecisionStats
): AdminProductRow {
  const facts = (arrayPayload(row.facts) as FactDbPayload[]).map(normalizeFact);
  const validation = validationForRow(row, facts, row.facts);
  const validationCache = validationCacheStatusForRow(row, validation);
  const translations = normalizeTranslations(row);
  const titleMap = Object.fromEntries(
    Object.entries(translations).map(([locale, translation]) => [
      locale,
      translation.title ?? ""
    ])
  );
  const descriptionMap = Object.fromEntries(
    Object.entries(translations).map(([locale, translation]) => [
      locale,
      translation.description ?? ""
    ])
  );
  const displayTitle =
    resolveLocalizedText(titleMap, defaultLocale) || row.title;
  const displayDescription =
    resolveLocalizedText(descriptionMap, defaultLocale) ||
    row.description ||
    null;
  const effectiveListStatus =
    row.status === "approved" && validation.status !== "pass"
      ? "pending_review"
      : row.status;
  const shopAvailability = arrayPayload(row.shop_availability).map((item) => {
    const record = item && typeof item === "object"
      ? item as Record<string, unknown>
      : {};
    const backorderPolicy: "allow" | "deny" =
      record.backorderPolicy === "deny" ? "deny" : "allow";

    return {
      backorderPolicy,
      currency: normalizeCurrencyCode(record.currency, row.currency || "THB"),
      leadTimeDays: numberOrNull(record.leadTimeDays),
      organisationId: typeof record.organisationId === "string"
        ? record.organisationId
        : "",
      organisationName: typeof record.organisationName === "string"
        ? record.organisationName
        : "Retail shop",
      retailPriceAmount: numberOrNull(record.retailPriceAmount),
      status: typeof record.status === "string" ? record.status : "active",
      stockQuantity: Math.max(0, Math.round(numberOrNull(record.stockQuantity) ?? 0)),
      wholesalePriceAmount: numberOrNull(record.wholesalePriceAmount)
    };
  }).filter((item) => item.organisationId);
  const regulatoryApprovals = productRegulatoryApprovalsFromPayload(
    row.regulatory_approvals
  );
  const countryPricing = arrayPayload(row.country_pricing)
    .map((item): ProductCountryPricing | null => {
      const record = item && typeof item === "object"
        ? item as Record<string, unknown>
        : {};
      const countryCode = normalizeProductCountryCode(record.countryCode);
      const rrpPriceAmount = numberOrNull(record.rrpPriceAmount);

      return countryCode
        ? {
            countryCode,
            currency: normalizeCurrencyCode(record.currency, row.currency || "THB"),
            effectiveRegulatoryApprovals: effectiveRegulatoryApprovalsForCountry(
              regulatoryApprovals,
              countryCode
            ),
            priceUpdatedAt: isoOrNull(record.priceUpdatedAt),
            rrpPriceAmount
          }
        : null;
    })
    .filter((item): item is ProductCountryPricing => Boolean(item));

  return {
    aiCorrectionNotes: aiCorrectionNotesFromSnapshot(row.source_snapshot),
    availabilityStatus: row.availability_status ?? "unknown",
    availableCountryCodes: productCountryCodesFromDb(
      row.available_country_codes,
      [row.region]
    ),
    brandId: row.brand_id,
    brandName: row.brand_name,
    brandStatus: row.brand_status,
    category: row.category,
    currency: row.currency || "THB",
    description: row.description,
    descriptionEn: row.description_en,
    descriptionTh: row.description_th,
    displayDescription,
    displayTitle,
    facts,
    id: row.id,
    imageUrl: row.image_url,
    identifierCandidates: productIdentifierCandidatesFromPayload(
      row.identifier_candidates
    ),
    identifiers: productIdentifiersFromPayload(row.identifiers),
    labelStatus: row.label_status,
    status: effectiveListStatus,
    validation,
    validationCacheStatus: validationCache.status,
    validationCacheStaleReasons: validationCache.staleReasons,
    validationLabel: validationLabel(validation),
    productAudience:
      row.product_audience && row.product_audience !== "both"
        ? row.product_audience
        : productAudienceFromText(
            row.title,
            row.title_en,
            row.title_th,
            row.description,
            row.description_en,
            row.description_th,
            ...Object.values(translations).flatMap((translation) => [
              translation.title,
              translation.description
            ])
          ) ?? row.product_audience ?? "both",
    importReviewTaskId: row.import_review_task_id,
    importStatus: row.import_status,
    manufacturerCountryCodes: productCountryCodesFromDb(
      row.manufacturer_country_codes,
      [row.region]
    ),
    countryPricing,
    platform: row.platform,
    productImportDuplicateProductIds: row.import_duplicate_product_ids ?? [],
    productImportId: row.import_id,
    productKind: row.product_kind ?? "supplement",
    productUrl: row.product_url,
    recommendationHistory: {
      averageProductCoveragePercent: numberOrNull(
        row.history_average_product_coverage_percent
      ),
      averageStackCoveragePercent: numberOrNull(
        row.history_average_stack_coverage_percent
      ),
      chosenCount: Math.max(0, Math.round(numberOrNull(row.history_chosen_count) ?? 0)),
      lastRecommendedAt: isoOrNull(row.history_last_recommended_at)
    },
    ...(decisionStats ? { decisionStats } : {}),
    region: row.region,
    regulatoryApprovals,
    shopAvailability,
    sourceEvidence: {
      importId: row.import_id,
      importReviewTaskId: row.import_review_task_id,
      importStatus: row.import_status,
      sourceUrl: row.source_url ?? row.product_url
    },
    title: row.title,
    titleEn: row.title_en,
    titleTh: row.title_th,
    translations,
    updatedAt: new Date(row.updated_at).toISOString()
  };
}
