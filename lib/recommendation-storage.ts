import type { ProductRecommendationDiagnostics } from "@/lib/product-recommendation-types";

/** Read saved web results without rewriting them. These retired storage keys are
 * not accepted by MCP and do not restore old plan handles. */
export function readStoredMatching(value: unknown): ProductRecommendationDiagnostics["matching"] {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.options)) return undefined;
  const { selectedOptionId, ...current } = record;
  return {
    ...current,
    selectedCandidateKey: record.selectedCandidateKey ?? selectedOptionId ?? null,
    options: record.options.map(value => {
      const { optionId, ...item } = value as Record<string, unknown>;
      return { ...item, candidateKey: item.candidateKey ?? optionId };
    })
  } as unknown as ProductRecommendationDiagnostics["matching"];
}

/** The serialized key spelling is part of existing payment hashes. Keep that
 * private storage format stable: a renamed field must never create a new charge. */
export function frozenCheckoutIdentityJson(input: unknown): string {
  return JSON.stringify(input, (key, value) => {
    if (key || !value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([field, entry]) => [field === "candidateKey" ? "optionId" : field, entry]));
  });
}
