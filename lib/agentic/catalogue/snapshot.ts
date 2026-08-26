import type { AgenticEnvironment } from "@/lib/agentic/config";
import {
  cachedLiveRetailSnapshot,
  warmLiveRetailSnapshot
} from "@/lib/agentic/catalogue/live";
import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import { refreshAdminSafetyCeilings } from "@/lib/agentic/catalogue/load-safety-ceilings";

const cachedByCountry = new Map<string, CatalogueSnapshot>();
let lastSnapshot: CatalogueSnapshot | null = null;
let installedSnapshot: CatalogueSnapshot | null = null;

export function resetCatalogueSnapshotCache() {
  cachedByCountry.clear();
  lastSnapshot = null;
}

function usesLiveCatalogue(environment?: AgenticEnvironment) {
  return environment === "dev" || environment === "uat" || environment === "prd";
}

function countryKey(countryCode?: string) {
  const code = countryCode?.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code ?? "") ? code! : "TH";
}

function countryFromSnapshot(snapshot: CatalogueSnapshot) {
  const match = snapshot.catalogueVersion.match(/^retail-([A-Z]{2})-/);
  return match?.[1] ?? "TH";
}

function emptyRetailSnapshot(code: string, suffix = "unavailable"): CatalogueSnapshot {
  return {
    availabilityAsOf: new Date().toISOString(),
    catalogueVersion: `retail-${code}-${suffix}`,
    products: [],
    supplements: []
  };
}

export function getCatalogueSnapshot(countryCode?: string): CatalogueSnapshot {
  if (countryCode) {
    const code = countryKey(countryCode);
    return cachedByCountry.get(code) ?? lastSnapshot ?? emptyRetailSnapshot(code);
  }

  return lastSnapshot ?? cachedByCountry.get("TH") ?? emptyRetailSnapshot("TH");
}

export async function ensureCatalogueSnapshot(
  environment?: AgenticEnvironment,
  countryCode?: string
): Promise<CatalogueSnapshot> {
  const code = countryKey(countryCode);

  if (installedSnapshot) {
    return cachedByCountry.get(code) ?? installedSnapshot;
  }

  if (usesLiveCatalogue(environment)) {
    const hit = cachedByCountry.get(code);

    if (
      hit &&
      hit.catalogueVersion.startsWith(`retail-${code}-`) &&
      !hit.catalogueVersion.endsWith("-loading")
    ) {
      return hit;
    }

    try {
      const live = await cachedLiveRetailSnapshot(code);
      const liveReady =
        !live.catalogueVersion.endsWith("-loading") &&
        !live.catalogueVersion.endsWith("-unavailable") &&
        (live.products.length > 0 ||
          (!process.env.NODE_TEST_CONTEXT && live.supplements.length > 0));

      if (liveReady) {
        cachedByCountry.set(code, live);
        lastSnapshot = live;
        await refreshAdminSafetyCeilings();
        return live;
      }
    } catch (error) {
      console.warn("Unable to load live retail catalogue for MCP", {
        countryCode: code,
        error
      });
    }

    return emptyRetailSnapshot(code);
  }

  return cachedByCountry.get(code) ?? emptyRetailSnapshot(code);
}

export async function warmCatalogueSnapshot(
  environment?: AgenticEnvironment,
  countryCode?: string
): Promise<CatalogueSnapshot> {
  const code = countryKey(countryCode);

  if (!usesLiveCatalogue(environment)) {
    return ensureCatalogueSnapshot(environment, code);
  }

  try {
    const live = await warmLiveRetailSnapshot(code);

    if (live.products.length > 0) {
      cachedByCountry.set(code, live);
    }

    return live;
  } catch (error) {
    console.warn("Unable to warm live retail catalogue for MCP", { countryCode: code, error });
    return ensureCatalogueSnapshot(environment, code);
  }
}

export function replaceCatalogueSnapshot(snapshot: CatalogueSnapshot | null) {
  cachedByCountry.clear();
  lastSnapshot = snapshot;
  installedSnapshot = snapshot;

  if (snapshot) {
    cachedByCountry.set(countryFromSnapshot(snapshot), snapshot);
  }
}

export function catalogueVersion() {
  return getCatalogueSnapshot().catalogueVersion;
}
