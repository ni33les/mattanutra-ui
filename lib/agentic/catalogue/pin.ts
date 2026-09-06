import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import { catalogueSnapshotId, freezeCatalogueSnapshot } from "@/lib/agentic/catalogue/freeze";
import type { AgenticStore } from "@/lib/agentic/store/types";

export type PinnedCatalogue = Readonly<{
  safetyLedgerVersion: string;
  snapshot: CatalogueSnapshot;
  snapshotId: string;
}>;

const pins = new Map<string, PinnedCatalogue>();
const MAX_PINS = 32;
const persisted = new WeakMap<AgenticStore, Set<string>>();

export function pinCatalogueSnapshot(
  snapshot: CatalogueSnapshot,
  safetyLedgerVersion: string
): PinnedCatalogue {
  const frozen = freezeCatalogueSnapshot(snapshot);
  const snapshotId = catalogueSnapshotId(frozen);
  const pinned = { safetyLedgerVersion, snapshot: frozen, snapshotId };
  pins.set(snapshotId, pinned);
  while (pins.size > MAX_PINS) pins.delete(pins.keys().next().value!);
  return pinned;
}

export async function persistCataloguePin(snapshot: CatalogueSnapshot, version: string, store: AgenticStore) {
  const pinned = pinCatalogueSnapshot(snapshot, version);
  const saved = persisted.get(store) ?? new Set<string>();
  if (!saved.has(pinned.snapshotId)) {
    await store.insertCatalogueSnapshot(pinned.snapshotId, pinned.snapshot);
    saved.add(pinned.snapshotId);
    while (saved.size > MAX_PINS) saved.delete(saved.values().next().value!);
    persisted.set(store, saved);
  }
  return pinned.snapshot;
}

export async function restoreCataloguePin(id: string, version: string, store: AgenticStore) {
  const cached = getPinnedCatalogueSnapshot(id);
  if (cached) return cached.snapshot;
  const snapshot = await store.getCatalogueSnapshot(id);
  if (!snapshot || catalogueSnapshotId(snapshot) !== id) return null;
  return pinCatalogueSnapshot(snapshot, version).snapshot;
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
