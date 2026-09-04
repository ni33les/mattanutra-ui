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

function freezeFromSnapshot(
  snapshot: CatalogueSnapshot,
  countryCode: string
): ValueCatalogueFreeze {
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
    currency: frozen.products[0]?.candidate.currency ?? "THB",
    fingerprint,
    productCount: frozen.products.length,
    retailerId: ACTIVE_RETAILER_ID,
    snapshot: frozen,
    supplementCount: frozen.supplements.length
  };
}

async function testRetailFallback(countryCode: string): Promise<ValueCatalogueFreeze | null> {
  if (!process.env.NODE_TEST_CONTEXT) {
    return null;
  }

  const { fixtureSnapshot } = await import("@/lib/agentic/catalogue/fixtures");
  const gold = fixtureSnapshot();
  return freezeFromSnapshot(
    {
      availabilityAsOf: gold.availabilityAsOf,
      catalogueVersion: `retail-${countryCode}-test`,
      products: gold.products.map((item) => ({ ...item, source: "retail" as const })),
      supplements: gold.supplements
    },
    countryCode
  );
}

export async function freezeLiveThailandCatalogue(
  countryCode = ACTIVE_MARKET_COUNTRY
): Promise<ValueCatalogueFreeze> {
  const live = freezeFromSnapshot(
    await loadLiveRetailSnapshot(countryCode),
    countryCode
  );
  if (isUsableLiveFreeze(live)) {
    return live;
  }
  return (await testRetailFallback(countryCode)) ?? live;
}

export function isUsableLiveFreeze(freeze: ValueCatalogueFreeze) {
  return (
    freeze.productCount > 0 &&
    freeze.supplementCount > 0 &&
    !/unavailable$|loading$/.test(freeze.catalogueVersion) &&
    freeze.snapshot.products.every((item) => item.source !== "fixture")
  );
}

export function isLiveRetailFreeze(freeze: ValueCatalogueFreeze) {
  return isUsableLiveFreeze(freeze) && !freeze.catalogueVersion.endsWith("-test");
}
