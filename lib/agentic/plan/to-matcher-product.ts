import { isPrenatalOrFertilitySku } from "@/lib/agentic/catalogue/product-fit";
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
  return {
    availableCountryCodes: product.candidate.availableCountryCodes ?? null,
    contributionSubjectIds: product.contributionSupplementIds,
    currency: product.candidate.currency,
    dailyPillsPerServing: product.dailyPills,
    dietarySource: product.dietarySource,
    form: product.form,
    imageUrl: product.candidate.imageUrl?.trim() || null,
    incompleteCommercialFacts: product.incompleteCommercialFacts,
    labelledContributions: product.candidate.facts.map((fact) => ({
      amount: fact.amount ?? fact.comparableAmount ?? 0,
      name: fact.name,
      subjectId: contributionSubjectId(fact.supplementId),
      unit: fact.unit
    })),
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
