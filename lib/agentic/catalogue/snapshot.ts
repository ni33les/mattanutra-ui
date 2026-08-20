import { fixtureSnapshot } from "@/lib/agentic/catalogue/fixtures";
import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";

let cached: CatalogueSnapshot | null = null;

export function getCatalogueSnapshot(): CatalogueSnapshot {
  cached ??= fixtureSnapshot();
  return cached;
}

export function replaceCatalogueSnapshot(snapshot: CatalogueSnapshot | null) {
  cached = snapshot;
}

export function catalogueVersion() {
  return getCatalogueSnapshot().catalogueVersion;
}
