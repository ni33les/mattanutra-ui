import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

test("LOCK-CPU-01 productive product workers use the same two-slot capacity as MCP and web computation", async () => {
  const { workerProfileConcurrency } = await import("../../lib/worker-profile-concurrency.ts");
  assert.equal(workerProfileConcurrency("products", {}), 2);
  assert.equal(workerProfileConcurrency("products", {WORKER_CONCURRENCY:"1"}),2);
  assert.equal(workerProfileConcurrency("products", {WORKER_PRODUCTS_CONCURRENCY:"1",MATCHER_CPU_SLOTS:"2"}),2);
  assert.equal(workerProfileConcurrency("products", {MATCHER_CPU_SLOTS:"3"}),3);
});

test("LOCK-CPU-02 other worker profiles retain their independent configured concurrency", async () => {
  const { workerProfileConcurrency } = await import("../../lib/worker-profile-concurrency.ts");
  assert.equal(workerProfileConcurrency("email",{}),1);
  assert.equal(workerProfileConcurrency("healthscore",{WORKER_HEALTHSCORE_CONCURRENCY:"6"}),6);
  assert.equal(workerProfileConcurrency("email",{WORKER_CONCURRENCY:"4",MATCHER_CPU_SLOTS:"2"}),4);
  assert.equal(workerProfileConcurrency("email",{WORKER_EMAIL_CONCURRENCY:"999"}),8);
});

test("LOCK-CPU-03 the actual external runner uses the productive dispatch configuration", () => {
  const source=readFileSync("workers/runner.ts","utf8");
  assert.match(source,/workerProfileConcurrency\(profileMode/);
  assert.doesNotMatch(source,/function workerConcurrency\(/);
});
