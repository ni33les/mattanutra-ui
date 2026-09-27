import assert from "node:assert/strict";
import type postgres from "postgres";

/** Prove a reader finishes before releasing a real, independent writer. */
export async function whileWriterHeld<T>(sql: postgres.Sql, lock: (tx: postgres.TransactionSql) => Promise<unknown>, read: () => Promise<T>, commit = false) {
  let release!: () => void, entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const rollback = new Error("rollback contention fixture");
  const writer = sql.begin(async tx => { await lock(tx); entered(); await gate; if (!commit) throw rollback; })
    .catch(error => { if (error !== rollback) throw error; });
  let operation: Promise<T> | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([ready, writer.then(() => { throw new Error("Writer never acquired its fixture lock"); })]);
    operation = read();
    const result = await Promise.race([
      operation.then(value => ({ value })),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1000); })
    ]);
    assert.ok(result, "Read must finish while the independent writer still owns its lock");
    return result.value;
  } finally {
    if (timer) clearTimeout(timer);
    release(); await writer; if (operation) await Promise.allSettled([operation]);
  }
}
