import { getRetailerAwareProductRecommendationCandidateSets } from "@/lib/admin-product-search";
import { publicProductId } from "@/lib/agentic/contract/ids";
import { FIXTURE_SUPPLEMENTS } from "@/lib/agentic/catalogue/fixtures";
import type {
  CatalogueProduct,
  CatalogueSnapshot
} from "@/lib/agentic/catalogue/types";
import type { ProductCandidate } from "@/lib/product-recommendation-types";

const LIVE_TTL_MS = 60_000;

let liveCache: { at: number; snapshot: CatalogueSnapshot } | null = null;
let liveInflight: Promise<CatalogueSnapshot> | null = null;

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
        namesOfSupplement(item).some(
          (name) =>
            name === wanted ||
            name.startsWith(`${wanted} `) ||
            wanted.startsWith(`${name} `)
        )
      );

      if (match) {
        ids.add(match.supplementId);
      }
    }
  }

  return [...ids];
}

function inferOmegaSource(candidate: ProductCandidate): CatalogueProduct["omegaSource"] {
  const haystack = [candidate.title, ...candidate.facts.map((item) => item.name)]
    .join(" ")
    .toLowerCase();

  if (/\balgae\b|\balgal\b/.test(haystack)) {
    return "algae";
  }

  if (/\bfish\b|\bepa\b|\bdha\b|\bomega/.test(haystack) && /\boil\b/.test(haystack)) {
    return "fish";
  }

  return "none";
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

function toCatalogueProduct(candidate: ProductCandidate): CatalogueProduct | null {
  if (!candidate.imageUrl?.trim()) {
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
    sellerId: candidate.selectedRetailerOrganisationId ?? "retailer_th",
    sellerName: candidate.selectedRetailerName ?? "Thailand retailer",
    source: "retail",
    stockStatus,
    unitPriceMinor: Math.round(price * 100)
  };
}

export async function loadLiveThailandSnapshot(): Promise<CatalogueSnapshot> {
  const sets = await getRetailerAwareProductRecommendationCandidateSets({
    countryCode: "TH",
    includeIneligible: false
  });
  const byProduct = new Map<string, CatalogueProduct>();

  for (const set of sets) {
    for (const candidate of set.candidates) {
      const mapped = toCatalogueProduct(candidate);

      if (!mapped) {
        continue;
      }

      const existing = byProduct.get(mapped.productId);

      if (!existing) {
        byProduct.set(mapped.productId, mapped);
        continue;
      }

      const existingRank = existing.stockStatus === "in_stock" ? 0 : 1;
      const nextRank = mapped.stockStatus === "in_stock" ? 0 : 1;

      if (
        nextRank < existingRank ||
        (nextRank === existingRank && mapped.unitPriceMinor < existing.unitPriceMinor)
      ) {
        byProduct.set(mapped.productId, mapped);
      }
    }
  }

  return {
    availabilityAsOf: new Date().toISOString(),
    catalogueVersion: `retail-th-${byProduct.size}`,
    products: [...byProduct.values()],
    supplements: FIXTURE_SUPPLEMENTS
  };
}

export async function cachedLiveThailandSnapshot(): Promise<CatalogueSnapshot> {
  if (liveCache && Date.now() - liveCache.at < LIVE_TTL_MS) {
    return liveCache.snapshot;
  }

  if (!liveInflight) {
    liveInflight = loadLiveThailandSnapshot()
      .then((snapshot) => {
        liveCache = { at: Date.now(), snapshot };
        return snapshot;
      })
      .finally(() => {
        liveInflight = null;
      });
  }

  return liveInflight;
}

export function resetLiveCatalogueCache() {
  liveCache = null;
  liveInflight = null;
}
