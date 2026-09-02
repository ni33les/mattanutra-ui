import type { AgenticEnvironment } from "@/lib/agentic/config";
import {
  cachedLiveRetailSnapshot,
  warmLiveRetailSnapshot
} from "@/lib/agentic/catalogue/live";
import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import { refreshAdminSafetyCeilings } from "@/lib/agentic/catalogue/load-safety-ceilings";
import { matcherSafetyCeilings } from "@/lib/matcher/safety-ceilings";
import { resetMatchPlanCache } from "@/lib/agentic/plan/matching";
import { countQuery } from "@/lib/agentic/plan/query-budget";

const cachedByCountry = new Map<string, CatalogueSnapshot>();
let lastSnapshot: CatalogueSnapshot | null = null;
let installedSnapshot: CatalogueSnapshot | null = null;

export function resetCatalogueSnapshotCache() {
  cachedByCountry.clear();
  lastSnapshot = null;
  resetMatchPlanCache();
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

function isFixtureCatalogue(snapshot: CatalogueSnapshot) {
  return (
    snapshot.catalogueVersion === "dev-3.0.0" ||
    snapshot.products.some((item) => item.source === "fixture")
  );
}

function allowInstalledSnapshot(environment?: AgenticEnvironment) {
  if (!installedSnapshot) {
    return false;
  }

  if (process.env.NODE_TEST_CONTEXT) {
    return true;
  }

  if (!usesLiveCatalogue(environment)) {
    return true;
  }

  return !isFixtureCatalogue(installedSnapshot);
}

function snapshotOrEmpty(
  snapshot: CatalogueSnapshot | undefined,
  code: string
): CatalogueSnapshot {
  if (!snapshot) {
    return emptyRetailSnapshot(code);
  }

  if (!process.env.NODE_TEST_CONTEXT && isFixtureCatalogue(snapshot)) {
    return emptyRetailSnapshot(code);
  }

  return snapshot;
}

export function getCatalogueSnapshot(countryCode?: string): CatalogueSnapshot {
  if (countryCode) {
    const code = countryKey(countryCode);
    return snapshotOrEmpty(
      cachedByCountry.get(code) ?? lastSnapshot ?? undefined,
      code
    );
  }

  return snapshotOrEmpty(
    lastSnapshot ?? cachedByCountry.get("TH") ?? undefined,
    "TH"
  );
}

export async function ensureCatalogueSnapshot(
  environment?: AgenticEnvironment,
  countryCode?: string
): Promise<CatalogueSnapshot> {
  countQuery(`catalogue.snapshot.${countryKey(countryCode)}`);
  const code = countryKey(countryCode);

  if (allowInstalledSnapshot(environment) && installedSnapshot) {
    return snapshotOrEmpty(
      cachedByCountry.get(code) ?? installedSnapshot,
      code
    );
  }

  if (usesLiveCatalogue(environment)) {
    const hit = cachedByCountry.get(code);

    if (
      hit &&
      hit.catalogueVersion.startsWith(`retail-${code}-`) &&
      !hit.catalogueVersion.endsWith("-loading")
    ) {
      return snapshotOrEmpty(hit, code);
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
        if (matcherSafetyCeilings().length < 1) {
          await refreshAdminSafetyCeilings();
        }
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

  return snapshotOrEmpty(cachedByCountry.get(code), code);
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
  resetMatchPlanCache();
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
