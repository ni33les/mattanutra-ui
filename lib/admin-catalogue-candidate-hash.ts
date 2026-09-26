import { createHash } from "node:crypto";
import { adminCataloguePotentialCandidates } from "@/lib/admin-product-coverage-simulation";
import type { ProductCandidate } from "@/lib/product-recommendations";

export function adminCataloguePotentialCandidateHash(
  candidates: readonly ProductCandidate[]
) {
  const rawById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const hashableCandidates = adminCataloguePotentialCandidates(candidates)
    .map((candidate) => {
      const raw = rawById.get(candidate.id) ?? candidate;

      return {
        audience: candidate.productAudience ?? null,
        availabilityStatus: candidate.availabilityStatus,
        brandName: candidate.brandName ?? null,
        brandStatus: raw.brandStatus ?? null,
        currency: candidate.currency,
        facts: [...candidate.facts]
          .map((fact) => ({
            aliasKeys: fact.aliasKeys ?? [],
            amount: fact.amount,
            comparableAmount: fact.comparableAmount,
            confidence: fact.confidence,
            itemType: fact.itemType,
            maxAmount: fact.maxAmount ?? null,
            maxUnit: fact.maxUnit ?? null,
            name: fact.name,
            normalizedName: fact.normalizedName,
            safetyFlags: fact.safetyFlags ?? [],
            supplementAudience: fact.supplementAudience ?? null,
            supplementId: fact.supplementId ?? null,
            unit: fact.unit
          }))
          .sort((first, second) =>
            (first.supplementId ?? first.normalizedName).localeCompare(
              second.supplementId ?? second.normalizedName
            ) ||
            (first.amount ?? -1) - (second.amount ?? -1) ||
            (first.unit ?? "").localeCompare(second.unit ?? "")
          ),
        id: candidate.id,
        platform: candidate.platform,
        priceAmount: candidate.priceAmount ?? null,
        productKind: candidate.productKind ?? null,
        productStatus: raw.status,
        title: candidate.title,
        unitPriceAmount: candidate.unitPriceAmount ?? null
      };
    })
    .sort((first, second) => first.id.localeCompare(second.id));

  return createHash("sha256")
    .update(JSON.stringify(hashableCandidates))
    .digest("hex");
}
