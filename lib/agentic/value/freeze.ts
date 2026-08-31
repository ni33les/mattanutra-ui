import { freezeCatalogueSnapshot } from "@/lib/agentic/catalogue/freeze";
import { loadLiveRetailSnapshot } from "@/lib/agentic/catalogue/live";
import { matcherSafetyCeilings } from "@/lib/matcher/safety-ceilings";
import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import { ACTIVE_MARKET_COUNTRY, ACTIVE_RETAILER_ID } from "@/lib/agentic/catalogue/market";
import { loadAgenticConfig } from "@/lib/agentic/config";
import {
  candidateSetHash,
  valueCatalogueFingerprint
} from "@/lib/agentic/value/fingerprint";

export type ValueCatalogueFreeze = Readonly<{
  buildId: string;
  candidateSetHash: string;
  catalogueVersion: string;
  countryCode: string;
  currency: string;
  fingerprint: string;
  productCount: number;
  retailerId: string;
  snapshot: CatalogueSnapshot;
  supplementCount: number;
}>;

export async function freezeLiveThailandCatalogue(
  countryCode = ACTIVE_MARKET_COUNTRY
): Promise<ValueCatalogueFreeze> {
  const snapshot = freezeCatalogueSnapshot(await loadLiveRetailSnapshot(countryCode));
  const retail = snapshot.products.filter((item) => item.source !== "fixture");
  const frozen: CatalogueSnapshot = freezeCatalogueSnapshot({
    ...snapshot,
    products: retail
  });
  const config = loadAgenticConfig();
  const fingerprint = valueCatalogueFingerprint(frozen, matcherSafetyCeilings());

  return {
    buildId: config.buildId,
    candidateSetHash: candidateSetHash(frozen.products.map((item) => item.productId)),
    catalogueVersion: frozen.catalogueVersion,
    countryCode,
    currency:
      frozen.products[0]?.candidate.currency ??
      "THB",
    fingerprint,
    productCount: frozen.products.length,
    retailerId: ACTIVE_RETAILER_ID,
    snapshot: frozen,
    supplementCount: frozen.supplements.length
  };
}

export function isUsableLiveFreeze(freeze: ValueCatalogueFreeze) {
  return (
    freeze.productCount > 0 &&
    freeze.supplementCount > 0 &&
    !/unavailable$|loading$/.test(freeze.catalogueVersion) &&
    freeze.snapshot.products.every((item) => item.source !== "fixture")
  );
}
