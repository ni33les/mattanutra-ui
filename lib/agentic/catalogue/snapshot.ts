import type { AgenticEnvironment } from "@/lib/agentic/config";
import { fixtureSnapshot } from "@/lib/agentic/catalogue/fixtures";
import {
  cachedLiveRetailSnapshot,
  warmLiveRetailSnapshot
} from "@/lib/agentic/catalogue/live";
import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import { refreshAdminSafetyCeilings } from "@/lib/agentic/catalogue/load-safety-ceilings";

const cachedByCountry = new Map<string, CatalogueSnapshot>();
let lastSnapshot: CatalogueSnapshot | null = null;
let installedSnapshot: CatalogueSnapshot | null = null;

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

export function getCatalogueSnapshot(countryCode?: string): CatalogueSnapshot {
  if (countryCode) {
    const code = countryKey(countryCode);
    return cachedByCountry.get(code) ?? lastSnapshot ?? fixtureSnapshot();
  }

  return lastSnapshot ?? cachedByCountry.get("TH") ?? fixtureSnapshot();
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

      if (
        live.products.length > 0 &&
        !live.catalogueVersion.endsWith("-loading")
      ) {
        cachedByCountry.set(code, live);
        lastSnapshot = live;
        return live;
      }
    } catch (error) {
      console.warn("Unable to load live retail catalogue for MCP", {
        countryCode: code,
        error
      });
    }

    if (environment === "uat" || environment === "prd") {
      return {
        availabilityAsOf: new Date().toISOString(),
        catalogueVersion: `retail-${code}-unavailable`,
        products: [],
        supplements: fixtureSnapshot().supplements
      };
    }
  }

  const cached = cachedByCountry.get(code);

  if (cached) {
    return cached;
  }

  const fixtures = fixtureSnapshot();
  cachedByCountry.set(code, fixtures);
  await refreshAdminSafetyCeilings();
  return fixtures;
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
