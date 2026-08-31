import { createHash } from "node:crypto";

import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import type { SafetyCeiling } from "@/lib/matcher/types";

import { servingsPerPackFromProduct } from "@/lib/agentic/value/pack-facts";

export function valueCatalogueFingerprint(
  snapshot: CatalogueSnapshot,
  ceilings: readonly SafetyCeiling[] = []
) {
  const hash = createHash("sha256");
  hash.update(snapshot.catalogueVersion);
  hash.update("\0");

  for (const product of [...snapshot.products].sort((left, right) =>
    left.productId.localeCompare(right.productId)
  )) {
    hash.update(product.productId);
    hash.update(":");
    hash.update(product.sellerId);
    hash.update(":");
    hash.update(product.source);
    hash.update(":");
    hash.update(String(product.unitPriceMinor));
    hash.update(":");
    hash.update(product.stockStatus);
    hash.update(":");
    hash.update(product.form);
    hash.update(":");
    hash.update(String(product.dailyPills));
    hash.update(":");
    hash.update(String(servingsPerPackFromProduct(product) ?? ""));
    hash.update(":");
    hash.update(product.contributionSupplementIds.slice().sort().join(","));
    hash.update("\n");

    for (const fact of [...product.candidate.facts].sort((left, right) =>
      `${left.normalizedName}:${left.unit}`.localeCompare(
        `${right.normalizedName}:${right.unit}`
      )
    )) {
      hash.update(fact.normalizedName);
      hash.update(":");
      hash.update(String(fact.amount ?? ""));
      hash.update(":");
      hash.update(fact.unit ?? "");
      hash.update(":");
      hash.update(fact.supplementId ?? "");
      hash.update(":");
      hash.update(fact.servingLabel ?? "");
      hash.update("\n");
    }
  }

  for (const ceiling of [...ceilings].sort((left, right) =>
    `${left.subjectId}:${left.lifeStage}:${left.bandVersion}`.localeCompare(
      `${right.subjectId}:${right.lifeStage}:${right.bandVersion}`
    )
  )) {
    hash.update(ceiling.subjectId);
    hash.update(":");
    hash.update(String(ceiling.maxAmount));
    hash.update(":");
    hash.update(ceiling.maxUnit);
    hash.update(":");
    hash.update(ceiling.lifeStage ?? "");
    hash.update(":");
    hash.update(String(ceiling.bandVersion ?? ""));
    hash.update(":");
    hash.update(ceiling.sourceScope ?? "");
    hash.update("\n");
  }

  return `valsnap_${hash.digest("hex").slice(0, 24)}`;
}

export function candidateSetHash(productIds: readonly string[]) {
  const hash = createHash("sha256");
  hash.update([...productIds].sort().join("\n"));
  return `cand_${hash.digest("hex").slice(0, 16)}`;
}
