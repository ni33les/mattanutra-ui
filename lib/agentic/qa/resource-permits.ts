export const PERMIT_KINDS = [
  "admission",
  "worker",
  "database",
  "connection",
  "lock"
] as const;

export type PermitKind = (typeof PERMIT_KINDS)[number];

export type PermitSnapshot = Readonly<Record<PermitKind, number>>;

const held = new Map<string, Map<PermitKind, number>>();
const counts: Record<PermitKind, number> = {
  admission: 0,
  connection: 0,
  database: 0,
  lock: 0,
  worker: 0
};
const capacities: Record<PermitKind, number> = {
  admission: 32,
  connection: 32,
  database: 32,
  lock: 32,
  worker: 32
};
type Waiter = { requestId: string; resolve(): void; reject(error: Error): void; signal?: AbortSignal; abort(): void };
const waiters: Record<PermitKind, Waiter[]> = {
  admission: [],
  connection: [],
  database: [],
  lock: [],
  worker: []
};
const queueOrder: string[] = [];

export function resetResourcePermits() {
  held.clear();
  queueOrder.length = 0;
  for (const kind of PERMIT_KINDS) {
    counts[kind] = 0;
    capacities[kind] = 32;
    waiters[kind] = [];
  }
}

export function snapshotResourcePermits(): PermitSnapshot {
  return {
    admission: counts.admission,
    connection: counts.connection,
    database: counts.database,
    lock: counts.lock,
    worker: counts.worker
  };
}

export function setPermitCapacity(kind: PermitKind, capacity: number) {
  capacities[kind] = capacity;
  drain(kind);
}

export function permitCapacity(kind: PermitKind) {
  return capacities[kind];
}

export function acquirePermit(requestId: string, kind: PermitKind) {
  if (counts[kind] >= capacities[kind]) {
    throw new Error(`permit_exhausted:${kind}`);
  }
  counts[kind] += 1;
  const owned = held.get(requestId) ?? new Map<PermitKind, number>();
  owned.set(kind, (owned.get(kind) ?? 0) + 1);
  held.set(requestId, owned);
}

export async function acquirePermitWhenAvailable(requestId: string, kind: PermitKind, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (counts[kind] < capacities[kind] && waiters[kind].length === 0) {
    acquirePermit(requestId, kind);
    return;
  }
  if (waiters[kind].length >= 128) throw new Error("admission_queue_full");
  await new Promise<void>((resolve, reject) => {
    const waiter: Waiter = {
      requestId, resolve, reject, signal,
      abort() {
        const index = waiters[kind].indexOf(waiter);
        if (index >= 0) waiters[kind].splice(index, 1);
        removeQueued(requestId, kind);
        reject(new DOMException("The request was cancelled.", "AbortError"));
      }
    };
    queueOrder.push(requestId + ":" + kind);
    waiters[kind].push(waiter);
    signal?.addEventListener("abort", waiter.abort, { once: true });
    if (signal?.aborted) waiter.abort();
  });
}

function removeQueued(id: string, kind: PermitKind) {
  const index = queueOrder.indexOf(id + ":" + kind);
  if (index >= 0) queueOrder.splice(index, 1);
}

export function queuedPermitOrder() {
  return [...queueOrder];
}

export function releasePermit(requestId: string, kind: PermitKind) {
  const owned = held.get(requestId);
  const current = owned?.get(kind) ?? 0;
  if (current < 1) {
    return;
  }
  if (current === 1) {
    owned?.delete(kind);
  } else {
    owned?.set(kind, current - 1);
  }
  if (owned && owned.size === 0) {
    held.delete(requestId);
  }
  counts[kind] = Math.max(0, counts[kind] - 1);
  drain(kind);
}

export function releaseAllPermits(requestId: string) {
  const owned = held.get(requestId);
  if (!owned) {
    return;
  }
  for (const kind of [...owned.keys()]) {
    while ((owned.get(kind) ?? 0) > 0) {
      releasePermit(requestId, kind);
    }
  }
}

export function heldPermitKinds(requestId: string) {
  return [...(held.get(requestId)?.keys() ?? [])];
}

function drain(kind: PermitKind) {
  while (counts[kind] < capacities[kind] && waiters[kind].length > 0) {
    const waiter = waiters[kind].shift()!;
    waiter.signal?.removeEventListener("abort", waiter.abort);
    removeQueued(waiter.requestId, kind);
    if (waiter.signal?.aborted) {
      waiter.reject(new DOMException("The request was cancelled.", "AbortError"));
    } else {
      acquirePermit(waiter.requestId, kind);
      waiter.resolve();
    }
  }
}
