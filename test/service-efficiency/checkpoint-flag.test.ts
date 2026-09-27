import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { input } from "./support.ts";
import { uninstallGoldCatalogue } from "../helpers/gold-catalogue.ts";
import { MatchWorkerPool } from "../../lib/agentic/plan/match-worker-pool.ts";
import { withServiceMeasurements, serviceMeasurements } from "../../lib/service-metrics.ts";
import { create, install, cleanup, runtime, plan } from "../mcp-evidence-images/helpers.ts";

const originalFlag = process.env.MATCHER_DURABLE_CHECKPOINTS_ENABLED;
const originalWorkers = process.env.AX_REFINEMENT_REAL_WORKERS;
afterEach(() => {
  if (originalFlag === undefined) delete process.env.MATCHER_DURABLE_CHECKPOINTS_ENABLED;
  else process.env.MATCHER_DURABLE_CHECKPOINTS_ENABLED = originalFlag;
  if (originalWorkers === undefined) delete process.env.AX_REFINEMENT_REAL_WORKERS;
  else process.env.AX_REFINEMENT_REAL_WORKERS = originalWorkers;
  uninstallGoldCatalogue(); cleanup();
});

for (const effort of ["standard", "expanded"] as const) test(`CKPT-FLAG-01 ${effort} keeps identical work and results without encoding cursors`, async () => {
  const request = await input(); request.state = { ...request.state, searchEffort: effort };
  const pool = new MatchWorkerPool(1);
  try {
    const expected = await pool.run(request);
    await withServiceMeasurements(async () => {
      let reply = await pool.runResidentChunk(effort, request, { chunkBudget: 1, persistCheckpoint: false });
      assert.equal(reply.done, false, "The fixture must exercise a real continuation");
      assert.equal(reply.checkpoint.cursor, undefined);
      let chunks = 1;
      while (!reply.done) {
        reply = await pool.runResidentChunk(effort, request, { checkpoint: reply.checkpoint, chunkBudget: 4000, persistCheckpoint: false });
        assert.equal(reply.inputTransferred, false);
        assert.equal(reply.checkpoint.cursor, undefined); chunks++;
      }
      assert.ok(chunks > 1);
      assert.equal(reply.expansionAttempts, expected.searchSummary!.expansionAttempts);
      assert.equal(reply.checkpoint.expansionBudget, effort === "expanded" ? 64000 : 8000);
      assert.deepEqual(reply.result, expected);
      assert.equal(serviceMeasurements()["checkpoint.encode_ms"], undefined);
      assert.equal(serviceMeasurements()["checkpoint.bytes"], undefined);
    });
  } finally { await pool.close(); }
});

test("CKPT-FLAG-02 lost resident work without a saved cursor fails rather than silently restarting its attempt budget", async () => {
  const request = await input(); let pool = new MatchWorkerPool(1);
  try {
    const first = await pool.runResidentChunk("lost", request, { chunkBudget: 1, persistCheckpoint: false });
    assert.equal(first.done, false); assert.equal(first.expansionAttempts, 1);
    await pool.close(); pool = new MatchWorkerPool(1);
    await withServiceMeasurements(async () => {
      await assert.rejects(pool.runResidentChunk("lost", request, { checkpoint: first.checkpoint, chunkBudget: 4000, persistCheckpoint: false }), /checkpoint.*unavailable/i);
      assert.equal(serviceMeasurements()["worker.execute_ms"], undefined);
    });
  } finally { await pool.close(); }
});

for (const [index, value] of [undefined, "false", "true"].entries()) test(`CKPT-FLAG-03 durable service flag ${value ?? "unset"} controls cursor persistence`, async () => {
  process.env.AX_REFINEMENT_REAL_WORKERS = "1";
  if (value === undefined) delete process.env.MATCHER_DURABLE_CHECKPOINTS_ENABLED;
  else process.env.MATCHER_DURABLE_CHECKPOINTS_ENABLED = value;
  install(); const app = runtime();
  const args = { ...create(), idempotencyKey: `checkpoint-flag-${index}`, targets: [{ name: "Vitamin D3", amount: 1000 + index, unit: "IU", basis: "total_daily" }] };
  await withServiceMeasurements(async () => {
    const result = await plan(app, args); assert.equal(result.status, "ready");
    const scope = app.scope;
    const operation = await app.store.getPlanOperationByKey(`${scope.environment}:${scope.tenantScope}:${scope.principalScope ?? "anon"}`, args.idempotencyKey);
    assert.equal(operation?.status, "complete");
    const checkpoint = operation!.checkpoint as { persistSearchCheckpoints: boolean; search: { cursor?: Uint8Array; expansionAttempts: number }; reservedAttempts: number };
    assert.ok(checkpoint.search?.expansionAttempts > 0, "Must execute fresh work rather than a completed-result cache hit");
    assert.equal(checkpoint.persistSearchCheckpoints, value === "true");
    assert.equal(checkpoint.reservedAttempts, 0);
    if (value === "true") {
      assert.ok(checkpoint.search.cursor instanceof Uint8Array);
      assert.ok(serviceMeasurements()["checkpoint.bytes"]!.total > 0);
    } else {
      assert.equal(checkpoint.search.cursor, undefined);
      assert.equal(serviceMeasurements()["checkpoint.encode_ms"], undefined);
      assert.equal(serviceMeasurements()["checkpoint.bytes"], undefined);
    }
  });
});
