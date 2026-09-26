import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import { catalogueSnapshotId, freezeCatalogueSnapshot, matchingSnapshotId } from "@/lib/agentic/catalogue/freeze";
import type { AgenticStore } from "@/lib/agentic/store/types";
import { databasePhaseTimeoutMs } from "@/lib/db";
import { requestLifetime, withRequestLifetime } from "@/lib/request-lifetime";

export type PinnedCatalogue = Readonly<{
  safetyLedgerVersion: string;
  snapshot: CatalogueSnapshot;
  snapshotId: string;
}>;

const pins = new Map<string, PinnedCatalogue>();
const MAX_PINS = 32;
const MAX_PENDING_PINS = 32;
type PendingPin = {
  controller: AbortController;
  promise: Promise<void>;
  subscribers: number;
  settled: boolean;
};
type PinPersistence = {
  completed: Set<string>;
  pending: Map<string, PendingPin>;
};
const persistence = new WeakMap<AgenticStore, PinPersistence>();

function rememberCompletedPin(writes: PinPersistence, snapshotId: string) {
  writes.completed.add(snapshotId);
  while (writes.completed.size > MAX_PINS) writes.completed.delete(writes.completed.values().next().value!);
}

function startPinPersistence(store: AgenticStore, snapshot: CatalogueSnapshot, snapshotId: string, writes: PinPersistence) {
  const controller = new AbortController();
  const parent = requestLifetime();
  const timer = setTimeout(() => controller.abort(new Error("Database phase deadline exceeded")), databasePhaseTimeoutMs());
  const pending: PendingPin = { controller, subscribers: 0, settled: false, promise: Promise.resolve() };
  // The insert belongs to all active subscribers, not the first request's signal.
  pending.promise = Promise.resolve().then(() => withRequestLifetime({ ...parent, signal: controller.signal }, async () => {
    controller.signal.throwIfAborted();
    await store.insertCatalogueSnapshot(snapshotId, snapshot);
    controller.signal.throwIfAborted();
    rememberCompletedPin(writes, snapshotId);
  })).finally(() => {
    pending.settled = true;
    clearTimeout(timer);
    if (writes.pending.get(snapshotId) === pending) writes.pending.delete(snapshotId);
  });
  return pending;
}

async function waitForPinPersistence(pending: PendingPin, ownerSignal?: AbortSignal) {
  const signal = ownerSignal ? AbortSignal.any([ownerSignal, pending.controller.signal]) : pending.controller.signal;
  signal.throwIfAborted();
  pending.subscribers++;
  let cancelled: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      cancelled = () => reject(signal.reason);
      signal.addEventListener("abort", cancelled, { once: true });
      void pending.promise.then(resolve, reject);
    });
  } finally {
    if (cancelled) signal.removeEventListener("abort", cancelled);
    if (--pending.subscribers === 0 && !pending.settled) pending.controller.abort(signal.reason);
  }
}

export function pinCatalogueSnapshot(
  snapshot: CatalogueSnapshot,
  safetyLedgerVersion: string
): PinnedCatalogue {
  const frozen = freezeCatalogueSnapshot(snapshot);
  const snapshotId = matchingSnapshotId(frozen);
  const pinned = { safetyLedgerVersion, snapshot: frozen, snapshotId };
  pins.set(snapshotId, pinned);
  while (pins.size > MAX_PINS) pins.delete(pins.keys().next().value!);
  return pinned;
}

export async function persistCataloguePin(snapshot: CatalogueSnapshot, version: string, store: AgenticStore) {
  const ownerSignal = requestLifetime()?.signal;
  ownerSignal?.throwIfAborted();
  const frozen = freezeCatalogueSnapshot(snapshot);
  const snapshotId = matchingSnapshotId(frozen);
  // Transaction-owned writes may still roll back after this call returns. They
  // must neither satisfy another owner nor publish a globally restorable pin.
  if (!store.catalogueWritesCommitIndependently?.()) {
    await store.insertCatalogueSnapshot(snapshotId, frozen);
    return frozen;
  }
  let writes = persistence.get(store);
  if (!writes) {
    writes = { completed: new Set(), pending: new Map() };
    persistence.set(store, writes);
  }
  const ownedWrites = writes;
  if (!ownedWrites.completed.has(snapshotId)) {
    let pending = ownedWrites.pending.get(snapshotId);
    if (!pending || pending.controller.signal.aborted) {
      pending = startPinPersistence(store, frozen, snapshotId, ownedWrites);
      // At capacity, perform this independently committed write without retaining
      // another entry. Aborted work also cannot recruit new subscribers.
      if (!ownedWrites.pending.has(snapshotId) && ownedWrites.pending.size < MAX_PENDING_PINS) {
        ownedWrites.pending.set(snapshotId, pending);
      }
    }
    await waitForPinPersistence(pending, ownerSignal);
  }
  ownerSignal?.throwIfAborted();
  return pinCatalogueSnapshot(frozen, version).snapshot;
}

export async function restoreCataloguePin(id: string, version: string, store: AgenticStore) {
  const cached = getPinnedCatalogueSnapshot(id);
  if (cached) return cached.snapshot;
  const snapshot = await store.getCatalogueSnapshot(id);
  if (!snapshot || catalogueSnapshotId(snapshot) !== id) return null;
  return store.catalogueWritesCommitIndependently?.()
    ? pinCatalogueSnapshot(snapshot, version).snapshot
    : freezeCatalogueSnapshot(snapshot);
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
