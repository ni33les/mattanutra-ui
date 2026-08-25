import { createHash } from "node:crypto";
import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";

export function catalogueSnapshotId(snapshot: CatalogueSnapshot) {
  const hash = createHash("sha256");
  hash.update(snapshot.catalogueVersion);
  hash.update("\0");
  hash.update(snapshot.availabilityAsOf);
  hash.update("\0");

  for (const product of [...snapshot.products].sort((left, right) =>
    left.productId.localeCompare(right.productId)
  )) {
    hash.update(product.productId);
    hash.update(":");
    hash.update(product.sellerId);
    hash.update(":");
    hash.update(String(product.unitPriceMinor));
    hash.update(":");
    hash.update(product.stockStatus);
    hash.update("\n");
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
