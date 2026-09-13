import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { operationCommands } from "../../lib/agentic/store/operation-commands.ts";
import { withDatabaseTransaction } from "../../lib/db.ts";

const id = "fbfb99fe-47a0-4fb8-a679-8f44bcd002ec";
const now = "2026-09-13T02:00:00.000Z";
function fixture(wins = true) {
  let inside = false;
  const notifications: { inside: boolean; args: unknown[] }[] = [];
  const sql = Object.assign(async (strings: TemplateStringsArray, ...args: unknown[]) => {
    if (strings.join("?").includes("pg_notify")) { notifications.push({ inside, args }); return []; }
    return wins ? [{ id, version: 9 }] : [];
  }, { json: (value: unknown) => value, begin: async (work: (tx: unknown) => Promise<unknown>) => {
    inside = true;
    try { return await work(sql); } finally { inside = false; }
  } });
  return { sql: sql as never, notifications };
}
for (const status of ["complete", "failed", "cancelled"] as const) {
  test(`STREAM-PUB-${status} publishes only after terminal commit with identity and version`, async () => {
    const f = fixture();
    await withDatabaseTransaction(f.sql, async () => {
      assert.equal(await operationCommands(f.sql).patchClaimedOperation(id, "lease", { status }, now, null), true);
      assert.equal(f.notifications.length, 0, "No notification under mutation locks");
    });
    await setImmediate();
    assert.equal(f.notifications.length, 1, "A committed terminal result must wake its waiting response");
    assert.equal(f.notifications[0].inside, false);
    assert.deepEqual(JSON.parse(String(f.notifications[0].args[1])), { kind: "plan_operation_changed", operationId: id, version: 9 });
  });
}
test("STREAM-PUB-expiry wakes observers after the durable deadline transition", async () => {
  const f = fixture();
  assert.equal(await operationCommands(f.sql).expireOperation(id, now, { reasonCode: "temporarily_unavailable" }), true);
  await setImmediate();
  assert.equal(f.notifications.length, 1);
});
test("STREAM-PUB-rollback emits no notification", async () => {
  const f = fixture();
  await assert.rejects(withDatabaseTransaction(f.sql, async () => {
    await operationCommands(f.sql).patchClaimedOperation(id, "lease", { status: "complete" }, now, null);
    throw new Error("rollback");
  }), /rollback/);
  await setImmediate(); assert.equal(f.notifications.length, 0);
});
test("STREAM-PUB-lost-owner emits no completion", async () => {
  const f = fixture(false);
  assert.equal(await operationCommands(f.sql).patchClaimedOperation(id, "lost", { status: "complete" }, now, null), false);
  await setImmediate(); assert.equal(f.notifications.length, 0);
});
test("STREAM-PUB-checkpoint does not wake response observers", async () => {
  const f = fixture();
  assert.equal(await operationCommands(f.sql).patchClaimedOperation(id, "lease", { checkpoint: { attempts: 4000 } }, now, now), true);
  await setImmediate(); assert.equal(f.notifications.length, 0);
});
