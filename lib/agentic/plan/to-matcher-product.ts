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

export function toMatcherProduct(product: CatalogueProduct): MatcherProduct {
  const falseOmega = isFalseOmegaAttribution(product.candidate);
  const labelledContributions = collapseDuplicateLabelledFacts(
    product.candidate.facts.map((fact) => {
      const mappedId = contributionSubjectId(fact.supplementId);
      return {
        amount: fact.amount ?? fact.comparableAmount ?? 0,
        name: fact.name,
        subjectId: falseOmega ? null : mappedId,
        unit: fact.unit
      };
    })
  );
  const contributionSubjectIds = falseOmega
    ? [...new Set(labelledContributions.map((item) => item.subjectId).filter((id): id is string => Boolean(id)))]
    : product.contributionSupplementIds;

  return {
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
    unknownSafetyAmount: false,
    unitPriceMinor: product.unitPriceMinor
  };
}
