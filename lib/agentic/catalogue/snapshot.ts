import type { AgenticEnvironment } from "@/lib/agentic/config";
import { fixtureSnapshot } from "@/lib/agentic/catalogue/fixtures";
import {
  cachedLiveRetailSnapshot,
  warmLiveRetailSnapshot
} from "@/lib/agentic/catalogue/live";
import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";

const cachedByCountry = new Map<string, CatalogueSnapshot>();

function usesLiveCatalogue(environment?: AgenticEnvironment) {
  return environment === "uat" || environment === "prd";
}

function countryKey(countryCode?: string) {
  const code = countryCode?.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code ?? "") ? code! : "TH";
}

export function getCatalogueSnapshot(): CatalogueSnapshot {
  return cachedByCountry.get("TH") ?? fixtureSnapshot();
}

export async function ensureCatalogueSnapshot(
  environment?: AgenticEnvironment,
  countryCode?: string
): Promise<CatalogueSnapshot> {
  const code = countryKey(countryCode);

  if (!usesLiveCatalogue(environment)) {
    const hit = cachedByCountry.get(code);

    if (hit) {
      return hit;
    }

    const fixtures = fixtureSnapshot();
    cachedByCountry.set(code, fixtures);
    return fixtures;
  }

  const hit = cachedByCountry.get(code);

  if (hit && hit.catalogueVersion.startsWith(`retail-${code}-`) && !hit.catalogueVersion.endsWith("-loading")) {
    return hit;
  }

  try {
    const live = await cachedLiveRetailSnapshot(code);

    if (
      live.products.length > 0 &&
      !live.catalogueVersion.endsWith("-loading")
    ) {
      cachedByCountry.set(code, live);
    }

    return live;
  } catch (error) {
    console.warn("Unable to load live retail catalogue for MCP", { countryCode: code, error });
    return {
      availabilityAsOf: new Date().toISOString(),
      catalogueVersion: `retail-${code}-unavailable`,
      products: [],
      supplements: fixtureSnapshot().supplements
    };
  }
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

  if (snapshot) {
    cachedByCountry.set("TH", snapshot);
  }
}

export function catalogueVersion() {
  return getCatalogueSnapshot().catalogueVersion;
}
