import { getRetailerAwareProductRecommendationCandidateSets } from "@/lib/admin-product-search";
import { publicProductId } from "@/lib/agentic/contract/ids";
import { ACTIVE_RETAILER_ID, ACTIVE_RETAILER_NAME } from "@/lib/agentic/catalogue/market";
import { FIXTURE_SUPPLEMENTS } from "@/lib/agentic/catalogue/fixtures";
import {
  inferOmegaSource,
  supplementNameMatchesFact
} from "@/lib/agentic/catalogue/product-fit";
import type {
  CatalogueProduct,
  CatalogueSnapshot
} from "@/lib/agentic/catalogue/types";
import type { ProductCandidate } from "@/lib/product-recommendation-types";

const LIVE_TTL_MS = 10 * 60_000;
const LIVE_LOAD_WAIT_MS = 8_000;

const liveCache = new Map<string, { at: number; snapshot: CatalogueSnapshot }>();
const liveInflight = new Map<string, Promise<CatalogueSnapshot>>();

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function namesOfSupplement(item: (typeof FIXTURE_SUPPLEMENTS)[number]) {
  return [item.name, ...item.aliases].map(normalizeName);
}

function contributionSupplementIds(candidate: ProductCandidate) {
  const ids = new Set<string>();

  for (const fact of candidate.facts ?? []) {
    const keys = [
      fact.name,
      fact.normalizedName?.replace(/_/g, " "),
      ...(fact.aliasKeys ?? []).map((item) => item.replace(/_/g, " "))
    ].filter((item): item is string => Boolean(item));

    for (const key of keys) {
      const wanted = normalizeName(key);
      const match = FIXTURE_SUPPLEMENTS.find((item) =>
        namesOfSupplement(item).some((name) =>
          supplementNameMatchesFact(name, wanted, candidate)
        )
      );

      if (match) {
        ids.add(match.supplementId);
      }
    }
  }

  return [...ids];
}

function inferDietarySource(
  candidate: ProductCandidate,
  omegaSource: CatalogueProduct["omegaSource"]
): CatalogueProduct["dietarySource"] {
  if (omegaSource === "algae") {
    return "algae";
  }

  if (omegaSource === "fish") {
    return "fish";
  }

  const haystack = candidate.title.toLowerCase();

  if (/\bvegan\b|\bplant\b/.test(haystack)) {
    return "plant";
  }

  return "any";
}

function inferForm(candidate: ProductCandidate) {
  const haystack = [
    candidate.title,
    ...candidate.facts.map((item) => item.servingLabel ?? "")
  ]
    .join(" ")
    .toLowerCase();
  const forms = [
    "softgel",
    "capsule",
    "tablet",
    "powder",
    "gummy",
    "liquid",
    "sachet"
  ] as const;

  return forms.find((form) => haystack.includes(form)) ?? "capsule";
}

function inferDailyPills(candidate: ProductCandidate) {
  for (const fact of candidate.facts) {
    const match = fact.servingLabel?.match(/(\d+(?:\.\d+)?)/);
    const value = match ? Number(match[1]) : NaN;

    if (Number.isFinite(value) && value > 0 && value <= 12) {
      return value;
    }
  }

  return 1;
}

function isSaleEligible(candidate: ProductCandidate) {
  return (
    candidate.status === "approved" &&
    (candidate.brandStatus == null || candidate.brandStatus === "approved") &&
    candidate.validation?.status === "pass" &&
    candidate.automatedSafetyPassed === true &&
    Boolean(candidate.imageUrl?.trim()) &&
    (candidate.unitPriceAmount ?? candidate.priceAmount ?? 0) > 0
  );
}

function toCatalogueProduct(candidate: ProductCandidate): CatalogueProduct | null {
  if (!isSaleEligible(candidate)) {
    return null;
  }

  const price = candidate.unitPriceAmount ?? candidate.priceAmount ?? 0;

  if (!(price > 0)) {
    return null;
  }

  const contributions = contributionSupplementIds(candidate);

  if (contributions.length < 1) {
    return null;
  }

  const omegaSource = inferOmegaSource(candidate);
  const stockStatus: CatalogueProduct["stockStatus"] =
    candidate.retailAvailabilityStatus === "backorder"
      ? "backorder"
      : candidate.retailAvailabilityStatus === "available_now" ||
          candidate.availabilityStatus === "in_stock"
        ? "in_stock"
        : "unavailable";

  if (stockStatus === "unavailable") {
    return null;
  }

  return {
    audience: candidate.productAudience === "both" ? "both" : "adult",
    candidate,
    contributionSupplementIds: contributions,
    dailyPills: inferDailyPills(candidate),
    dietarySource: inferDietarySource(candidate, omegaSource),
    form: inferForm(candidate),
    incompleteCommercialFacts: false,
    omegaSource,
    orderable: true,
    productId: publicProductId(candidate.id),
    retailerSku: candidate.retailSellableProductId ?? candidate.id,
    sellerId: candidate.selectedRetailerOrganisationId ?? ACTIVE_RETAILER_ID,
    sellerName: candidate.selectedRetailerName ?? ACTIVE_RETAILER_NAME,
    source: "retail",
    stockStatus,
    unitPriceMinor: Math.round(price * 100)
  };
}

export async function loadLiveRetailSnapshot(
  countryCode: string
): Promise<CatalogueSnapshot> {
  const sets = await getRetailerAwareProductRecommendationCandidateSets({
    countryCode: countryCode.trim().toUpperCase(),
    includeIneligible: false,
    saleEligibleOnly: true
  });
  const byListing = new Map<string, CatalogueProduct>();

  for (const set of sets) {
    for (const candidate of set.candidates) {
      const mapped = toCatalogueProduct(candidate);

      if (!mapped) {
        continue;
      }

      const listingKey = `${mapped.sellerId}:${mapped.productId}`;
      const existing = byListing.get(listingKey);

      if (!existing) {
        byListing.set(listingKey, mapped);
        continue;
      }

      const existingRank = existing.stockStatus === "in_stock" ? 0 : 1;
      const nextRank = mapped.stockStatus === "in_stock" ? 0 : 1;

      if (
        nextRank < existingRank ||
        (nextRank === existingRank && mapped.unitPriceMinor < existing.unitPriceMinor)
      ) {
        byListing.set(listingKey, mapped);
      }
    }
  }

  return {
    availabilityAsOf: new Date().toISOString(),
    catalogueVersion: `retail-${countryCode.trim().toUpperCase()}-${byListing.size}`,
    products: [...byListing.values()],
    supplements: FIXTURE_SUPPLEMENTS
  };
}

function loadingSnapshot(countryCode: string): CatalogueSnapshot {
  const hit = liveCache.get(countryCode);

  return {
    availabilityAsOf: new Date().toISOString(),
    catalogueVersion: hit?.snapshot.catalogueVersion ?? `retail-${countryCode}-loading`,
    products: hit?.snapshot.products ?? [],
    supplements: FIXTURE_SUPPLEMENTS
  };
}

function startLiveLoad(code: string): Promise<CatalogueSnapshot> {
  const existing = liveInflight.get(code);

  if (existing) {
    return existing;
  }

  const inflight = loadLiveRetailSnapshot(code)
    .then((snapshot) => {
      if (snapshot.products.length > 0) {
        liveCache.set(code, { at: Date.now(), snapshot });
      }

      return snapshot;
    })
    .finally(() => {
      liveInflight.delete(code);
    });
  liveInflight.set(code, inflight);
  return inflight;
}

export async function cachedLiveRetailSnapshot(
  countryCode: string
): Promise<CatalogueSnapshot> {
  const code = countryCode.trim().toUpperCase() || "TH";
  const hit = liveCache.get(code);

  if (hit && Date.now() - hit.at < LIVE_TTL_MS) {
    return hit.snapshot;
  }

  const inflight = startLiveLoad(code);

  if (hit) {
    return hit.snapshot;
  }

  return Promise.race([
    inflight,
    new Promise<CatalogueSnapshot>((resolve) => {
      setTimeout(() => resolve(loadingSnapshot(code)), LIVE_LOAD_WAIT_MS);
    })
  ]);
}

export async function warmLiveRetailSnapshot(
  countryCode: string
): Promise<CatalogueSnapshot> {
  const code = countryCode.trim().toUpperCase() || "TH";
  const hit = liveCache.get(code);

  if (hit && Date.now() - hit.at < LIVE_TTL_MS && hit.snapshot.products.length > 0) {
    return hit.snapshot;
  }

  return startLiveLoad(code);
}

export function cachedLiveThailandSnapshot(): Promise<CatalogueSnapshot> {
  return cachedLiveRetailSnapshot("TH");
}

export function resetLiveCatalogueCache() {
  liveCache.clear();
  liveInflight.clear();
}
