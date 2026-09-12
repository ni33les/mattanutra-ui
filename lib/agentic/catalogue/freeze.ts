import { createHash } from "node:crypto";
import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import { canonicalJson } from "@/lib/agentic/value/canonical";

export function catalogueSnapshotId(snapshot: CatalogueSnapshot) {
  const hash = createHash("sha256");
  hash.update(String(snapshot.runtimeRevision ?? "legacy"));
  hash.update("\0");
  hash.update(snapshot.catalogueVersion);
  hash.update("\0");
  // Observation time is freshness metadata, not a changed matching input.
  // Actual catalogue epochs, eligibility, prices and facts remain identity inputs.

  for (const product of [...snapshot.products].sort((left, right) =>
    `${left.productId}:${left.sellerId}`.localeCompare(`${right.productId}:${right.sellerId}`)
  )) {
    // Fingerprint the complete catalogue inputs. Omitting eligibility or display
    // facts can make a changed product reuse an earlier evaluated basket.
    hash.update(canonicalJson({
      ...product,
      contributionSupplementIds: [...product.contributionSupplementIds].sort(),
      candidate: {
        ...product.candidate,
        availableCountryCodes: product.candidate.availableCountryCodes
          ? [...product.candidate.availableCountryCodes].sort() : null,
        facts: product.candidate.facts.map(canonicalJson).sort()
      }
    }));
    hash.update("\n");
  }
  for (const supplement of [...snapshot.supplements].sort((left, right) =>
    left.supplementId.localeCompare(right.supplementId))) {
    hash.update(canonicalJson({ ...supplement, aliases: [...supplement.aliases].sort(),
      acceptedUnits: [...supplement.acceptedUnits].sort() }));
    hash.update("\n");
  }
  for (const row of [...(snapshot.disallowedSupplements ?? [])].sort((a,b) => a.supplementId.localeCompare(b.supplementId))) {
    hash.update(canonicalJson({ disallowed: true, ...row, aliases: [...row.aliases].sort(), acceptedUnits: [...row.acceptedUnits].sort() }));
  }
  if (snapshot.disallowedProductIds?.length) hash.update(canonicalJson([...snapshot.disallowedProductIds].sort()));

  return `snap_${hash.digest("hex").slice(0, 16)}`;
}

// Matching inputs are immutable for a request/session. Keep the identity with
// that object, including presentation consumers; mutable writers use the fresh
// catalogueSnapshotId function above and must never reuse this memo.
const matchingIdentities = new WeakMap<CatalogueSnapshot, string>();
export function matchingSnapshotId(snapshot: CatalogueSnapshot): string {
  let id = matchingIdentities.get(snapshot);
  if (!id) { id = catalogueSnapshotId(snapshot); matchingIdentities.set(snapshot, id); }
  return id;
}

export function freezeCatalogueSnapshot(
  snapshot: CatalogueSnapshot
): CatalogueSnapshot {
  const frozen = Object.freeze({
    ...(snapshot.runtimeRevision === undefined ? {} : { runtimeRevision: snapshot.runtimeRevision }),
    availabilityAsOf: snapshot.availabilityAsOf,
    catalogueVersion: snapshot.catalogueVersion,
    products: Object.freeze([...snapshot.products]),
    supplements: Object.freeze([...snapshot.supplements]),
    ...(snapshot.disallowedSupplements ? { disallowedSupplements: Object.freeze([...snapshot.disallowedSupplements]) } : {}),
    ...(snapshot.disallowedProductIds ? { disallowedProductIds: Object.freeze([...snapshot.disallowedProductIds]) } : {})
  });
  matchingIdentities.set(frozen, matchingSnapshotId(snapshot));
  return frozen;
}
