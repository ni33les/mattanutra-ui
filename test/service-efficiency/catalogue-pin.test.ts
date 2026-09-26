import assert from "node:assert/strict";
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { beforeEach, mock, test } from "node:test";
import { catalogueSnapshotId, freezeCatalogueSnapshot, matchingSnapshotId } from "../../lib/agentic/catalogue/freeze.ts";
import { getPinnedCatalogueSnapshot, persistCataloguePin, pinCatalogueSnapshot, resetCataloguePins, restoreCataloguePin } from "../../lib/agentic/catalogue/pin.ts";
import { createMemoryStore } from "../../lib/agentic/store/memory.ts";
import { createPostgresStore } from "../../lib/agentic/store/postgres.ts";
import type { AgenticStore } from "../../lib/agentic/store/types.ts";
import type { CatalogueSnapshot } from "../../lib/agentic/catalogue/types.ts";
import { withDatabaseTransaction } from "../../lib/db.ts";
import { requestLifetime, withRequestLifetime } from "../../lib/request-lifetime.ts";
import { sampleValueSnapshot } from "../agentic/value/sample-catalogue.ts";

beforeEach(resetCataloguePins);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function mutableSnapshot() {
  return structuredClone(sampleValueSnapshot());
}

function independentlyCommittedStore() {
  return Object.assign(createMemoryStore(), { catalogueWritesCommitIndependently: () => true });
}

async function waitForInsertRelease(release: Promise<void>) {
  const signal = requestLifetime()?.signal;
  assert.ok(signal, "persistence carries its request lifetime into the store");
  signal.throwIfAborted();
  let onAbort!: () => void;
  try {
    await Promise.race([release, new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    })]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

async function countHashes(work: () => Promise<void> | void) {
  const original = crypto.createHash;
  const spy = mock.method(crypto, "createHash", (algorithm: string, options?: crypto.HashOptions) => original(algorithm, options));
  syncBuiltinESMExports();
  try {
    await work();
    return spy.mock.callCount();
  } finally {
    spy.mock.restore();
    syncBuiltinESMExports();
  }
}

test("EFF-PIN-01 concurrent identical owned snapshots require one durable insert and preparation", async () => {
  const store = independentlyCommittedStore();
  const snapshot = freezeCatalogueSnapshot(mutableSnapshot());
  const gate = deferred();
  let inserts = 0;
  const prepared: string[] = [];
  store.insertCatalogueSnapshot = async (_id, value) => {
    inserts++;
    prepared.push(JSON.stringify(value));
    await gate.promise;
  };
  const calls = Array.from({ length: 8 }, () => persistCataloguePin(snapshot, "guidance-test", store));
  gate.resolve();
  const results = await Promise.all(calls);
  assert.equal(inserts, 1);
  assert.equal(prepared.length, 1);
  assert.ok(results.every(result => result === snapshot));
});

test("EFF-PIN-02 failed coalesced persistence rejects every caller and a later attempt retries", async () => {
  const store = independentlyCommittedStore();
  const snapshot = freezeCatalogueSnapshot(mutableSnapshot());
  const gate = deferred();
  const failure = new Error("Catalogue persistence unavailable");
  let inserts = 0;
  store.insertCatalogueSnapshot = async () => { inserts++; await gate.promise; throw failure; };
  const calls = Array.from({ length: 3 }, () => persistCataloguePin(snapshot, "guidance-test", store));
  const settled = Promise.allSettled(calls);
  gate.resolve();
  const results = await settled;
  assert.ok(results.every(result => result.status === "rejected" && result.reason === failure));
  assert.equal(inserts, 1);
  assert.equal(getPinnedCatalogueSnapshot(matchingSnapshotId(snapshot)), null, "failed writes cannot publish a globally restorable pin");
  store.insertCatalogueSnapshot = async () => { inserts++; };
  await persistCataloguePin(snapshot, "guidance-test", store);
  assert.equal(inserts, 2);
});

test("EFF-PIN-03 store and snapshot identities do not share persistence work", async () => {
  const stores = [independentlyCommittedStore(), independentlyCommittedStore()];
  const base = mutableSnapshot();
  const snapshots = [freezeCatalogueSnapshot(base), freezeCatalogueSnapshot({ ...base, runtimeRevision: 2 })];
  const gate = deferred();
  const inserts = stores.map(() => [] as string[]);
  stores.forEach((store, index) => { store.insertCatalogueSnapshot = async id => { inserts[index]!.push(id); await gate.promise; }; });
  const calls = stores.flatMap(store => snapshots.flatMap(snapshot => [
    persistCataloguePin(snapshot, "guidance-test", store), persistCataloguePin(snapshot, "guidance-test", store)
  ]));
  gate.resolve();
  await Promise.all(calls);
  for (const rows of inserts) assert.deepEqual(rows.sort(), snapshots.map(matchingSnapshotId).sort());
});

test("EFF-PIN-04 owned immutable snapshots are prepared and hashed once through repeated pins", async () => {
  const raw = mutableSnapshot();
  let owned!: CatalogueSnapshot;
  const hashes = await countHashes(() => {
    owned = freezeCatalogueSnapshot(raw);
    const expected = matchingSnapshotId(owned);
    for (let index = 0; index < 8; index++) {
      assert.equal(freezeCatalogueSnapshot(owned), owned);
      assert.equal(matchingSnapshotId(owned), expected);
      assert.equal(pinCatalogueSnapshot(owned, "guidance-test").snapshotId, expected);
    }
  });
  assert.equal(hashes, 1);
  assert.equal(catalogueSnapshotId(owned), matchingSnapshotId(owned));
});

test("EFF-PIN-05 ownership freezes isolated nested catalogue facts without freezing the writer", () => {
  const raw = mutableSnapshot();
  const before = structuredClone(raw);
  const owned = freezeCatalogueSnapshot(raw);
  const expected = catalogueSnapshotId(owned);
  Object.assign(raw.products[0]!.candidate.facts[0]!, { amount: 987654 });
  Object.assign(raw.supplements[0]!, { aliases: ["Changed writer alias"] });
  assert.deepEqual(owned, before);
  assert.equal(catalogueSnapshotId(owned), expected);
  assert.equal(matchingSnapshotId(owned), expected);
  assert.notEqual(catalogueSnapshotId(raw), expected);
  assert.throws(() => Object.assign(owned.products[0]!.candidate.facts[0]!, { amount: 123 }), TypeError);
  assert.throws(() => Object.assign(owned.supplements[0]!.aliases, { 0: "Mutation" }), TypeError);
});

test("EFF-PIN-06 mutable and externally shallow-frozen inputs always receive fresh identity checks", () => {
  for (const shallowFreeze of [false, true]) {
    const raw = mutableSnapshot();
    if (shallowFreeze) Object.freeze(raw);
    const before = matchingSnapshotId(raw);
    Object.assign(raw.products[0]!.candidate, { title: "Changed product title" });
    assert.notEqual(matchingSnapshotId(raw), before);
    assert.equal(matchingSnapshotId(raw), catalogueSnapshotId(raw));
  }
});

test("EFF-PIN-07 loaded snapshot integrity is freshly checked before ownership is established", async () => {
  const raw = mutableSnapshot();
  const originalId = matchingSnapshotId(raw);
  Object.assign(raw.products[0]!.candidate.facts[0]!, { amount: 123456 });
  const store = independentlyCommittedStore();
  store.getCatalogueSnapshot = async () => raw;
  assert.equal(await restoreCataloguePin(originalId, "guidance-test", store), null);
  assert.equal(getPinnedCatalogueSnapshot(originalId), null);
  const updatedId = catalogueSnapshotId(raw);
  const restored = await restoreCataloguePin(updatedId, "guidance-test", store);
  assert.ok(restored);
  assert.equal(matchingSnapshotId(restored), updatedId);
  assert.notEqual(restored.products[0], raw.products[0]);
});

test("EFF-PIN-08 transaction-owned memory inserts are neither published nor remembered after rollback", async () => {
  const store = createMemoryStore();
  const snapshot = freezeCatalogueSnapshot(mutableSnapshot());
  const id = matchingSnapshotId(snapshot);
  const insert = store.insertCatalogueSnapshot.bind(store);
  let inserts = 0;
  store.insertCatalogueSnapshot = async (...args) => { inserts++; await insert(...args); };
  await assert.rejects(store.transaction(async transaction => {
    await persistCataloguePin(snapshot, "guidance-test", transaction);
    assert.equal(getPinnedCatalogueSnapshot(id), null);
    throw new Error("Rollback this transaction");
  }), /Rollback this transaction/);
  assert.equal(await store.getCatalogueSnapshot(id), null);
  await persistCataloguePin(snapshot, "guidance-test", store);
  assert.equal(inserts, 2);
  assert.deepEqual(await store.getCatalogueSnapshot(id), snapshot);
});

test("EFF-PIN-14 cancelling the first subscriber preserves the active subscriber's shared persistence", async () => {
  const store = independentlyCommittedStore();
  const snapshot = freezeCatalogueSnapshot(mutableSnapshot());
  const started = deferred();
  const release = deferred();
  const firstOwner = new AbortController();
  const secondOwner = new AbortController();
  const cancellation = new Error("First catalogue subscriber cancelled");
  let inserts = 0;
  store.insertCatalogueSnapshot = async () => {
    inserts++;
    started.resolve();
    await waitForInsertRelease(release.promise);
  };
  const first = withRequestLifetime({ signal: firstOwner.signal }, () => persistCataloguePin(snapshot, "guidance-test", store));
  const second = withRequestLifetime({ signal: secondOwner.signal }, () => persistCataloguePin(snapshot, "guidance-test", store));
  const settled = Promise.allSettled([first, second]);
  try {
    await started.promise;
    firstOwner.abort(cancellation);
  } finally {
    release.resolve();
  }
  const [firstResult, secondResult] = await settled;
  assert.equal(firstResult!.status, "rejected");
  if (firstResult!.status === "rejected") assert.equal(firstResult.reason, cancellation);
  assert.equal(secondOwner.signal.aborted, false);
  assert.equal(secondResult!.status, "fulfilled", "a subscriber cannot cancel another subscriber's persistence");
  if (secondResult!.status === "fulfilled") assert.equal(secondResult.value, snapshot);
  assert.equal(inserts, 1);
  assert.equal(getPinnedCatalogueSnapshot(matchingSnapshotId(snapshot))?.snapshot, snapshot);
});

test("EFF-PIN-15 cancelling the second subscriber rejects promptly while the first completes", async () => {
  const store = independentlyCommittedStore();
  const snapshot = freezeCatalogueSnapshot(mutableSnapshot());
  const started = deferred();
  const release = deferred();
  const firstOwner = new AbortController();
  const secondOwner = new AbortController();
  const cancellation = new Error("Second catalogue subscriber cancelled");
  let inserts = 0;
  store.insertCatalogueSnapshot = async () => {
    inserts++;
    started.resolve();
    await waitForInsertRelease(release.promise);
  };
  const first = withRequestLifetime({ signal: firstOwner.signal }, () => persistCataloguePin(snapshot, "guidance-test", store));
  const second = withRequestLifetime({ signal: secondOwner.signal }, () => persistCataloguePin(snapshot, "guidance-test", store));
  const settled = Promise.allSettled([first, second]);
  const secondOutcome = second.then(() => "fulfilled", error => error);
  try {
    await started.promise;
    secondOwner.abort(cancellation);
    const outcome = await Promise.race([secondOutcome, new Promise<string>(resolve => setImmediate(() => resolve("still waiting for shared persistence")))]);
    assert.equal(outcome, cancellation, "an aborted subscriber settles before the shared insert is released");
    assert.equal(firstOwner.signal.aborted, false);
  } finally {
    release.resolve();
    await settled;
  }
  const [firstResult, secondResult] = await settled;
  assert.equal(firstResult!.status, "fulfilled");
  if (firstResult!.status === "fulfilled") assert.equal(firstResult.value, snapshot);
  assert.equal(secondResult!.status, "rejected");
  if (secondResult!.status === "rejected") assert.equal(secondResult.reason, cancellation);
  assert.equal(inserts, 1);
  assert.equal(getPinnedCatalogueSnapshot(matchingSnapshotId(snapshot))?.snapshot, snapshot);
});

test("EFF-PIN-09 transaction ownership is explicit for PostgreSQL stores and ambient phases", async () => {
  const sql = Object.assign(async () => [], { begin: async (work: (tx: unknown) => Promise<unknown>) => work(sql) });
  const store = createPostgresStore(sql as never);
  const committed = (value: AgenticStore) => (value as AgenticStore & { catalogueWritesCommitIndependently?: () => boolean }).catalogueWritesCommitIndependently?.();
  assert.equal(committed(store), true);
  await store.transaction(async transaction => {
    assert.equal(committed(transaction), false);
    assert.equal(committed(store), false, "a root store also joins the ambient database transaction");
  });
  await withDatabaseTransaction(sql as never, async () => { assert.equal(committed(store), false); });
  assert.equal(committed(store), true);
});

test("EFF-PIN-10 persistence without an explicit independent-commit capability is never shared", async () => {
  const snapshot = freezeCatalogueSnapshot(mutableSnapshot());
  const gate = deferred();
  let inserts = 0;
  const store = { insertCatalogueSnapshot: async () => { inserts++; await gate.promise; } } as unknown as AgenticStore;
  const calls = [persistCataloguePin(snapshot, "guidance-test", store), persistCataloguePin(snapshot, "guidance-test", store)];
  gate.resolve();
  await Promise.all(calls);
  await persistCataloguePin(snapshot, "guidance-test", store);
  assert.equal(inserts, 3);
  assert.equal(getPinnedCatalogueSnapshot(matchingSnapshotId(snapshot)), null);
});

test("EFF-PIN-11 restoring an uncommitted catalogue cannot publish it to another owner", async () => {
  const store = createMemoryStore();
  const snapshot = freezeCatalogueSnapshot(mutableSnapshot());
  const id = matchingSnapshotId(snapshot);
  await assert.rejects(store.transaction(async transaction => {
    await transaction.insertCatalogueSnapshot(id, snapshot);
    const restored = await restoreCataloguePin(id, "guidance-test", transaction);
    assert.deepEqual(restored, snapshot);
    assert.equal(getPinnedCatalogueSnapshot(id), null);
    throw new Error("Rollback restored catalogue");
  }), /Rollback restored catalogue/);
  assert.equal(await store.getCatalogueSnapshot(id), null);
  assert.equal(await restoreCataloguePin(id, "guidance-test", store), null);
});

test("EFF-PIN-12 pending pin storage is bounded while existing identities continue to coalesce", async () => {
  const store = independentlyCommittedStore();
  const gate = deferred();
  const inserts = new Map<string, number>();
  store.insertCatalogueSnapshot = async id => { inserts.set(id, (inserts.get(id) ?? 0) + 1); await gate.promise; };
  const snapshots = Array.from({ length: 33 }, (_, index) => freezeCatalogueSnapshot({
    availabilityAsOf: "2026-09-26T00:00:00.000Z", catalogueVersion: `bounded-pin-${index}`, products: [], supplements: []
  }));
  const pending = snapshots.slice(0, 32).map(snapshot => persistCataloguePin(snapshot, "guidance-test", store));
  pending.push(persistCataloguePin(snapshots[0]!, "guidance-test", store));
  pending.push(persistCataloguePin(snapshots[32]!, "guidance-test", store));
  pending.push(persistCataloguePin(snapshots[32]!, "guidance-test", store));
  try {
    await Promise.resolve();
    assert.equal(inserts.get(matchingSnapshotId(snapshots[0]!)), 1, "existing tracked work still coalesces at capacity");
    assert.equal(inserts.get(matchingSnapshotId(snapshots[32]!)), 2, "overflow executes independently instead of growing the pending registry");
  } finally {
    gate.resolve();
    await Promise.all(pending);
  }
});

test("EFF-PIN-13 a memory transaction starting during async insertion cannot publish rolled-back facts", async () => {
  const store = createMemoryStore();
  const snapshot = freezeCatalogueSnapshot(mutableSnapshot());
  const id = matchingSnapshotId(snapshot);
  const allowInsert = deferred();
  const transactionStarted = deferred();
  const finishTransaction = deferred();
  const insert = store.insertCatalogueSnapshot.bind(store);
  let inserts = 0;
  store.insertCatalogueSnapshot = async (...args) => { inserts++; await allowInsert.promise; await insert(...args); };
  const pin = persistCataloguePin(snapshot, "guidance-test", store);
  const transaction = store.transaction(async () => {
    transactionStarted.resolve();
    await finishTransaction.promise;
    throw new Error("Rollback overlapping transaction");
  });
  const rolledBack = assert.rejects(transaction, /Rollback overlapping transaction/);
  try {
    await transactionStarted.promise;
    allowInsert.resolve();
    await pin;
    assert.equal(getPinnedCatalogueSnapshot(id), null, "an insertion overlapping whole-map rollback is not independently durable");
  } finally {
    allowInsert.resolve();
    finishTransaction.resolve();
    await pin;
    await rolledBack;
  }
  assert.equal(await store.getCatalogueSnapshot(id), null);
  await persistCataloguePin(snapshot, "guidance-test", store);
  assert.equal(inserts, 2, "a rolled-back overlapping write cannot satisfy later persistence");
  assert.deepEqual(await store.getCatalogueSnapshot(id), snapshot);
});
