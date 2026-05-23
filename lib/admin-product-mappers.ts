import type {
  AdminProductFact,
  AdminProductRow,
  AdminProductOffer,
  ProductValidationCacheStatus
} from "./admin-product-types.ts";
import type { ProductDbRow, FactDbPayload } from "./admin-product-types.ts";
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
const randomUUID = () => globalThis.crypto.randomUUID();

import {
  normalizeProductFactName,
  normalizeProductFactKey,
  productFactLooksLikeConcentration,
  productFactAliasKeys
} from "@/lib/product-recommendations";
import { normalizeDoseUnit, comparableDoseAmount, parseDoseLimit, doseExceedsLimit } from "@/lib/dose-conversion";
import { validateProduct, validationCacheMismatchReasons } from "@/lib/product-validation";

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
  row: Pick<ProductDbRow, "image_url" | "label_status" | "product_url" | "source_url">,
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
    sourceUrl: row.source_url
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

export function rowFromDb(row: ProductDbRow): AdminProductRow {
  const facts = (arrayPayload(row.facts) as FactDbPayload[]).map(normalizeFact);
  const validation = validationForRow(row, facts, row.facts);
  const validationCache = validationCacheStatusForRow(row, validation);
  const effectiveListStatus =
    row.status === "approved" && validation.status !== "pass"
      ? "pending_review"
      : row.status;
  const offers = arrayPayload(row.offers).map((item) => {
    const record = item && typeof item === "object"
      ? item as Record<string, unknown>
      : {};

    return {
      availabilityStatus:
        record.availabilityStatus === "in_stock" ||
        record.availabilityStatus === "out_of_stock" ||
        record.availabilityStatus === "unavailable"
          ? record.availabilityStatus
          : "unknown",
      commissionRate: numberOrNull(record.commissionRate),
      currency: typeof record.currency === "string" ? record.currency : "THB",
      id: typeof record.id === "string" ? record.id : randomUUID(),
      linkType: record.linkType === "direct" ? "direct" : "affiliate",
      network: typeof record.network === "string" ? record.network : null,
      platform: typeof record.platform === "string" ? record.platform : null,
      priceAmount: numberOrNull(record.priceAmount),
      priority: numberOrNull(record.priority) ?? 0,
      status:
        record.status === "flagged_stale" || record.status === "inactive"
          ? record.status
          : "active",
      url: typeof record.url === "string" ? record.url : ""
    } satisfies AdminProductOffer;
  });
  const activeAffiliateStatus =
    offers.some((offer) => offer.status === "active" && offer.linkType === "affiliate")
      ? "active"
      : "none";
  const activeOfferPriceAmount = numberOrNull(row.active_offer_price_amount);
  const activeOfferCurrency = row.active_offer_currency || "THB";
  const activeOfferAvailability = row.active_offer_availability_status ?? "unknown";

  return {
    affiliateStatus: activeAffiliateStatus,
    aiCorrectionNotes: aiCorrectionNotesFromSnapshot(row.source_snapshot),
    availabilityStatus: activeOfferAvailability,
    availableCountryCodes: productCountryCodesFromDb(
      row.available_country_codes,
      [row.region]
    ),
    brandId: row.brand_id,
    brandName: row.brand_name,
    brandStatus: row.brand_status,
    category: row.category,
    currency: activeOfferCurrency,
    description: row.description,
    descriptionEn: row.description_en,
    descriptionTh: row.description_th,
    facts,
    fdaApprovalNumber: row.fda_approval_number,
    id: row.id,
    imageUrl: row.image_url,
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
            row.description_th
          ) ?? row.product_audience ?? "both",
    importReviewTaskId: row.import_review_task_id,
    importStatus: row.import_status,
    manufacturerCountryCodes: productCountryCodesFromDb(
      row.manufacturer_country_codes,
      [row.region]
    ),
    offers,
    platform: row.platform,
    priceAmount: activeOfferPriceAmount,
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
    region: row.region,
    sourceEvidence: {
      importId: row.import_id,
      importReviewTaskId: row.import_review_task_id,
      importStatus: row.import_status,
      sourceUrl: row.source_url ?? row.product_url
    },
    title: row.title,
    titleEn: row.title_en,
    titleTh: row.title_th,
    updatedAt: new Date(row.updated_at).toISOString()
  };
}
