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
