import assert from "node:assert/strict";
import { test } from "node:test";
import { createPostgresStore } from "../../lib/agentic/store/postgres.ts";
import { deferUntilDatabaseCommit, withDatabaseTransaction } from "../../lib/db.ts";

test("EFF-TXN-01 agentic transaction installs commit effects and shared helpers reuse its session", async () => {
  let committed = false, sessions = 0;
  const effects: boolean[] = [];
  const sql = Object.assign(async () => [], { begin: async (work: (tx: unknown) => Promise<unknown>) => {
    sessions++; const result = await work(sql); committed = true; return result;
  } });
  const store = createPostgresStore(sql as never);
  await store.transaction(async () => {
    assert.equal(deferUntilDatabaseCommit(() => effects.push(committed)), true);
    await withDatabaseTransaction(sql as never, async () => { assert.equal(committed, false); });
    assert.equal(effects.length, 0);
  });
  assert.deepEqual(effects, [true]); assert.equal(sessions, 1);
});

test("EFF-TXN-02 rolled-back admission emits no post-commit wakeup", async () => {
  const effects: string[] = [];
  const sql = Object.assign(async () => [], { begin: async (work: (tx: unknown) => Promise<unknown>) => work(sql) });
  const store = createPostgresStore(sql as never);
  await assert.rejects(store.transaction(async () => {
    assert.equal(deferUntilDatabaseCommit(() => effects.push("wake")), true);
    throw new Error("admission rollback");
  }), /admission rollback/);
  assert.deepEqual(effects, []);
});

test("LOCK-BOUNDARY-TXN-01 dependency contention retries the rolled-back transaction without duplicate wakeups", async () => {
  let attempts = 0; const effects: number[] = [];
  const sql = Object.assign(async () => [], { begin: async (work: (tx: unknown) => Promise<unknown>) => work(sql) });
  const result = await withDatabaseTransaction(sql as never, async () => {
    const attempt = ++attempts;
    deferUntilDatabaseCommit(() => effects.push(attempt));
    if (attempt === 1) throw Object.assign(new Error("Concurrent task dependency change; retry the transaction"), { code: "40001" });
    return "committed";
  });
  assert.equal(result, "committed"); assert.equal(attempts, 2); assert.deepEqual(effects, [2]);
});

test("LOCK-BOUNDARY-TXN-02 dependency retries stay bounded and unrelated database failures are not replayed", async () => {
  const sql = Object.assign(async () => [], { begin: async (work: (tx: unknown) => Promise<unknown>) => work(sql) });
  let attempts = 0;
  await assert.rejects(withDatabaseTransaction(sql as never, async () => {
    attempts++;
    throw Object.assign(new Error("Concurrent task dependency change; retry the transaction"), { code: "40001" });
  }), /Concurrent task dependency/);
  assert.equal(attempts, 4);
  attempts = 0;
  await assert.rejects(withDatabaseTransaction(sql as never, async () => { attempts++; throw new Error("Other database failure"); }), /Other database failure/);
  assert.equal(attempts, 1);
});
