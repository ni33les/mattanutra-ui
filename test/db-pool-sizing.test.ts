import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { getSql, getWorkerSql } from "../lib/db.ts";

const keys = ["DB_URL", "DB_POOL_MAX", "DB_WORKER_POOL_MAX", "DB_POOL_ROLE", "MATTANUTRA_ENV"] as const;
let previous: Record<string, string | undefined>;

beforeEach(() => {
  previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  // Inspect the real client configuration. Older releases eagerly probe the
  // connection; confine those probes to a non-service loopback port.
  process.env.DB_URL = "postgres://pool_test:unused@127.0.0.1:1/pool_test";
  delete process.env.DB_POOL_MAX;
  delete process.env.DB_WORKER_POOL_MAX;
  delete process.env.DB_POOL_ROLE;
});

afterEach(async () => {
  try {
    delete process.env.DB_POOL_ROLE;
    await Promise.all([getSql()?.end({ timeout: 0 }), getWorkerSql()?.end({ timeout: 0 })]);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

for (const [environment, size] of [["dev", 30], ["uat", 30], ["prd", 37]] as const) {
  test(`${environment} honours its configured ${size}-connection application and worker pools`, () => {
    process.env.MATTANUTRA_ENV = environment;
    process.env.DB_POOL_MAX = String(size);
    process.env.DB_WORKER_POOL_MAX = String(size);
    const interactive = getSql();
    const worker = getWorkerSql();
    assert.ok(interactive);
    assert.ok(worker);
    assert.equal(interactive.options.max, size);
    assert.equal(worker.options.max, size);
    assert.notEqual(interactive, worker);
    process.env.DB_POOL_ROLE = "worker";
    assert.equal(getSql(), worker);
  });
}

test("explicit smaller test and maintenance pools remain independent", () => {
  process.env.DB_POOL_MAX = "1";
  process.env.DB_WORKER_POOL_MAX = "2";
  assert.equal(getSql()?.options.max, 1);
  assert.equal(getWorkerSql()?.options.max, 2);
});

test("omitted and invalid configuration retains conservative six-connection fallbacks", () => {
  assert.equal(getSql()?.options.max, 6);
  process.env.DB_WORKER_POOL_MAX = "invalid";
  assert.equal(getWorkerSql()?.options.max, 6);
});

test("pool configuration remains bounded from one to 37 connections", () => {
  process.env.DB_POOL_MAX = "0";
  process.env.DB_WORKER_POOL_MAX = "1000";
  assert.equal(getSql()?.options.max, 1);
  assert.equal(getWorkerSql()?.options.max, 37);
});
