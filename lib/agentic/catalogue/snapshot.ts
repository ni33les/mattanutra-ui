import type { AgenticEnvironment } from "@/lib/agentic/config";
import { fixtureSnapshot } from "@/lib/agentic/catalogue/fixtures";
import { cachedLiveRetailSnapshot } from "@/lib/agentic/catalogue/live";
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
    cachedByCountry.set(code, live);
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

export function replaceCatalogueSnapshot(snapshot: CatalogueSnapshot | null) {
  cachedByCountry.clear();

  if (snapshot) {
    cachedByCountry.set("TH", snapshot);
  }
}

export function catalogueVersion() {
  return getCatalogueSnapshot().catalogueVersion;
}
