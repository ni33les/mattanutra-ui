import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import postgres from "postgres";
import { closeSqlPool, getSql, getWorkerSql, withDatabaseTransaction } from "../lib/db.ts";
import { withRequestLifetime } from "../lib/request-lifetime.ts";

const databaseUrl = process.env.TEST_DB_URL;

describe("bounded database phases on PostgreSQL", {skip: !databaseUrl}, () => {
  before(async () => {
    const url = new URL(databaseUrl!);
    assert.equal(url.hostname, "127.0.0.1", "integration tests require an isolated local database");
    assert.match(url.pathname, /^\/mattanutra_lock_review/);
    process.env.DB_URL = databaseUrl;
    process.env.DB_LOCK_TIMEOUT_MS = "100";
    await getSql()!`create table if not exists public.lock_review_values (id integer primary key, value integer not null)`;
    await getSql()!`insert into public.lock_review_values values (1, 0) on conflict (id) do update set value = 0`;
  });
  after(async () => {
    await getSql()!`drop table public.lock_review_values`;
    await closeSqlPool();
  });

  it("sets timeouts on plain queries from both pools", async () => {
    for (const sql of [getSql()!, getWorkerSql()!]) {
      const rows = await Promise.all(Array.from({length: 3}, () => sql`
        select current_setting('statement_timeout') as statement,
          current_setting('lock_timeout') as lock,
          current_setting('idle_in_transaction_session_timeout') as idle
      `));
      for (const [row] of rows) assert.deepEqual(row, {statement: "15s", lock: "100ms", idle: "10s"});
    }
  });

  it("reuses the transaction across helper pool lookups and rolls back all writes", async () => {
    const sql = getSql()!;
    await assert.rejects(withDatabaseTransaction(sql, async tx => {
      assert.equal(getSql(), tx);
      assert.equal(getWorkerSql(), tx);
      await getSql()!`update public.lock_review_values set value = 1 where id = 1`;
      await getWorkerSql()!`insert into public.lock_review_values values (2, 2)`;
      throw new Error("injected_failure");
    }), /injected_failure/);
    assert.deepEqual([...await sql`select * from public.lock_review_values order by id`], [{id: 1, value: 0}]);
    assert.equal(getSql(), sql);
  });

  it("keeps a usable phase deadline when the statement timeout is explicitly disabled", async () => {
    const previous = process.env.DB_STATEMENT_TIMEOUT_MS;
    process.env.DB_STATEMENT_TIMEOUT_MS = "0";
    try {
      const [row] = await getSql()!`select current_setting('statement_timeout') as statement, pg_sleep(0.02)`;
      assert.equal(row.statement, "0");
    } finally {
      if (previous === undefined) delete process.env.DB_STATEMENT_TIMEOUT_MS;
      else process.env.DB_STATEMENT_TIMEOUT_MS = previous;
    }
  });

  it("cancels active SQL and leaves the pool usable", async () => {
    const started = Date.now();
    await assert.rejects(withRequestLifetime({signal: AbortSignal.timeout(50)}, () => getSql()!`select pg_sleep(2)`));
    assert.ok(Date.now() - started < 1500);
    assert.equal((await getSql()!`select 1 as ok`)[0].ok, 1);
  });

  it("bounds a plain query waiting on another transaction's row lock", async () => {
    const blocker = postgres(databaseUrl!, {max: 1});
    let unlock!: () => void;
    let ready!: () => void;
    const gate = new Promise<void>(resolve => {unlock = resolve;});
    const entered = new Promise<void>(resolve => {ready = resolve;});
    const held = blocker.begin(async tx => {
      await tx`update public.lock_review_values set value = 3 where id = 1`;
      ready();
      await gate;
    });
    try {
      await entered;
      await assert.rejects(getSql()!`update public.lock_review_values set value = 4 where id = 1`, {code: "55P03"});
    } finally {
      unlock(); await held; await blocker.end();
    }
  });

  it("rolls back the whole phase when its deadline expires", async () => {
    const previous = (await getSql()!`select value from public.lock_review_values where id = 1`)[0].value;
    await assert.rejects(withDatabaseTransaction(getSql()!, async tx => {
      await tx`update public.lock_review_values set value = 9 where id = 1`;
      await tx`select pg_sleep(2)`;
    }, 50));
    assert.equal((await getSql()!`select value from public.lock_review_values where id = 1`)[0].value, previous);
  });
});
