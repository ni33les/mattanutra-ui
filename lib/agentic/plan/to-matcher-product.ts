import { administrationDailyPills } from "@/lib/product-administration";
import {
  isFalseOmegaAttribution,
  isPrenatalOrFertilitySku
} from "@/lib/agentic/catalogue/product-fit";
import { collapseDuplicateLabelledFacts } from "@/lib/matcher/candidates";
import type { CatalogueProduct } from "@/lib/agentic/catalogue/types";
import { publicSupplementId } from "@/lib/agentic/contract/ids";
import type { MatcherProduct } from "@/lib/matcher/types";

function contributionSubjectId(value: string | null | undefined) {
  const raw = value?.trim();

  if (!raw) {
    return null;
  }

  if (raw.startsWith("sup_")) {
    return raw;
  }

  return publicSupplementId(raw);
}

const matcherProductMemo = new WeakMap<CatalogueProduct, MatcherProduct>();

export function toMatcherProduct(product: CatalogueProduct): MatcherProduct {
  const cached = matcherProductMemo.get(product);

  if (cached) {
    return cached;
  }

  const nonOral = product.candidate.administration?.route === "topical" || product.candidate.administration?.route === "other";
  const falseOmega = isFalseOmegaAttribution(product.candidate);
  const labelledContributions = collapseDuplicateLabelledFacts(
    product.candidate.facts.filter(fact => fact.amount != null).map((fact) => {
      const mappedId = contributionSubjectId(fact.supplementId);
      return {
        ...{ mappingStatus: nonOral ? "conflicting" as const : fact.mappingStatus, confidence: fact.confidence, source: fact.source, sourceUrl: fact.sourceUrl, sourceText: fact.sourceText },
        amount: fact.amount!,
        name: fact.name,
        subjectId: nonOral || falseOmega || fact.mappingStatus === "conflicting" ? null : mappedId,
        unit: fact.unit
      };
    })
  );
  const contributionSubjectIds = nonOral || falseOmega || product.candidate.facts.some(fact => fact.mappingStatus === "conflicting")
    ? [...new Set(labelledContributions.map((item) => item.subjectId).filter((id): id is string => Boolean(id)))]
    : product.contributionSupplementIds;

  const created: MatcherProduct = {
    ...{ administration: product.candidate.administration ?? null, pillCountKnown: product.source === "fixture" || administrationDailyPills(product.candidate.administration) != null },
    availableCountryCodes: product.candidate.availableCountryCodes ?? null,
    contributionSubjectIds,
    currency: product.candidate.currency,
    dailyPillsPerServing: product.dailyPills,
    dietarySource: product.dietarySource,
    form: product.form,
    imageUrl: product.candidate.imageUrl?.trim() || null,
    incompleteCommercialFacts: product.incompleteCommercialFacts,
    labelledContributions,
    omegaSource: product.omegaSource,
    orderable: product.orderable,
    prenatalOrFertility: isPrenatalOrFertilitySku(product.candidate),
    productAudience: product.candidate.productAudience ?? "both",
    productId: product.productId,
    retailerSku: product.retailerSku,
    sellerId: product.sellerId,
    sellerName: product.sellerName,
    source: product.source,
    status: product.candidate.status ?? "approved",
    stockStatus:
      product.stockStatus === "backorder"
        ? "backorder"
        : product.stockStatus === "unavailable"
          ? "unavailable"
          : "in_stock",
    title: product.candidate.title,
    unknownSafetyAmount: product.candidate.facts.some(fact => fact.amount == null || fact.confidence !== "high" || fact.mappingStatus === "conflicting"),
    unitPriceMinor: product.unitPriceMinor
  };

  matcherProductMemo.set(product, created);
  return created;
}
