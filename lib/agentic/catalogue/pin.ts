import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import { catalogueSnapshotId, freezeCatalogueSnapshot } from "@/lib/agentic/catalogue/freeze";

export type PinnedCatalogue = Readonly<{
  safetyLedgerVersion: string;
  snapshot: CatalogueSnapshot;
  snapshotId: string;
}>;

const pins = new Map<string, PinnedCatalogue>();

export function pinCatalogueSnapshot(
  snapshot: CatalogueSnapshot,
  safetyLedgerVersion: string
): PinnedCatalogue {
  const frozen = freezeCatalogueSnapshot(snapshot);
  const snapshotId = catalogueSnapshotId(frozen);
  const pinned = { safetyLedgerVersion, snapshot: frozen, snapshotId };
  pins.set(snapshotId, pinned);
  return pinned;
}

export function getPinnedCatalogueSnapshot(snapshotId: string | null | undefined) {
  const id = snapshotId?.trim();
  if (!id) {
    return null;
  }
  return pins.get(id) ?? null;
}

export function pinnedSnapshotIdFromResult(result: Readonly<{
  matcherTelemetry?: { snapshotId?: string };
  selected?: { snapshotId?: string } | null;
}> | null | undefined) {
  return (
    result?.selected?.snapshotId?.trim() ||
    result?.matcherTelemetry?.snapshotId?.trim() ||
    ""
  );
}

export function resetCataloguePins() {
  pins.clear();
}
