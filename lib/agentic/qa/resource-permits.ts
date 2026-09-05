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
const waiters: Record<PermitKind, Array<() => void>> = {
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

export async function acquirePermitWhenAvailable(requestId: string, kind: PermitKind) {
  queueOrder.push(`${requestId}:${kind}`);
  while (counts[kind] >= capacities[kind]) {
    await new Promise<void>((resolve) => {
      waiters[kind].push(resolve);
    });
  }
  const index = queueOrder.indexOf(`${requestId}:${kind}`);
  if (index >= 0) {
    queueOrder.splice(index, 1);
  }
  acquirePermit(requestId, kind);
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
    waiters[kind].shift()?.();
  }
}
