import { createHash } from "node:crypto";
import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import { servingsPerPackFromProduct } from "@/lib/agentic/value/pack-facts";

export function catalogueSnapshotId(snapshot: CatalogueSnapshot) {
  const hash = createHash("sha256");
  hash.update(snapshot.catalogueVersion);
  hash.update("\0");
  hash.update(snapshot.availabilityAsOf);
  hash.update("\0");

  for (const product of [...snapshot.products].sort((left, right) =>
    `${left.productId}:${left.sellerId}`.localeCompare(`${right.productId}:${right.sellerId}`)
  )) {
    hash.update(JSON.stringify(product.candidate.administration ?? null));
    hash.update("\0");
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
    hash.update("\n");

    for (const fact of [...product.candidate.facts].sort((left, right) =>
      `${left.normalizedName}:${left.unit}`.localeCompare(
        `${right.normalizedName}:${right.unit}`
      )
    )) {
      hash.update(JSON.stringify([fact.confidence, fact.source ?? null, fact.sourceUrl ?? null, fact.sourceText ?? null, fact.mappingStatus ?? null, fact.servingLabel ?? null]));
      hash.update("\0");
      hash.update(fact.normalizedName);
      hash.update(":");
      hash.update(String(fact.amount ?? ""));
      hash.update(":");
      hash.update(fact.unit ?? "");
      hash.update(":");
      hash.update(fact.supplementId ?? "");
      hash.update("\n");
    }
  }

  return `snap_${hash.digest("hex").slice(0, 16)}`;
}

export function freezeCatalogueSnapshot(
  snapshot: CatalogueSnapshot
): CatalogueSnapshot {
  return Object.freeze({
    availabilityAsOf: snapshot.availabilityAsOf,
    catalogueVersion: snapshot.catalogueVersion,
    products: Object.freeze([...snapshot.products]),
    supplements: Object.freeze([...snapshot.supplements])
  });
}
