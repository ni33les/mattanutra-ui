import type { AgenticEnvironment } from "@/lib/agentic/config";
import { fixtureSnapshot } from "@/lib/agentic/catalogue/fixtures";
import { cachedLiveThailandSnapshot } from "@/lib/agentic/catalogue/live";
import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";

let cached: CatalogueSnapshot | null = null;

function usesLiveCatalogue(environment?: AgenticEnvironment) {
  return environment === "uat" || environment === "prd";
}

export function getCatalogueSnapshot(): CatalogueSnapshot {
  cached ??= fixtureSnapshot();
  return cached;
}

export async function ensureCatalogueSnapshot(
  environment?: AgenticEnvironment
): Promise<CatalogueSnapshot> {
  if (!usesLiveCatalogue(environment)) {
    cached ??= fixtureSnapshot();
    return cached;
  }

  try {
    const live = await cachedLiveThailandSnapshot();
    cached = live;
    return live;
  } catch (error) {
    console.warn("Unable to load live Thailand retail catalogue for MCP", { error });
    return {
      availabilityAsOf: new Date().toISOString(),
      catalogueVersion: "retail-th-unavailable",
      products: [],
      supplements: fixtureSnapshot().supplements
    };
  }
}

export function replaceCatalogueSnapshot(snapshot: CatalogueSnapshot | null) {
  cached = snapshot;
}

export function catalogueVersion() {
  return getCatalogueSnapshot().catalogueVersion;
}
