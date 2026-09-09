import { openMeasuredDatabase, seedPlanReader, seedFunnelReader, comparableStatus } from "./benchmark-readers.mjs";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { serialize } from "node:v8";
import { Worker } from "node:worker_threads";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { semanticValue } from "./benchmark-proof.mjs";
const [id, output] = process.argv.slice(2);
const load = file => import(pathToFileURL(resolve(file)));
const hash = value => createHash("sha256").update(JSON.stringify(semanticValue(value))).digest("hex");
const { loadAgenticConfig } = await load("lib/agentic/config.ts");
const { installCatalogue, goldens } = await load("test/mcp-7-2-3/helpers.ts");
const { profile } = await load("test/ax-refinement/helpers.ts");
const { normalizePlanRequest } = await load("lib/agentic/plan/normalize.ts");
const frozen = await installCatalogue();
const loop = monitorEventLoopDelay({ resolution: 10 }); loop.enable();
const counters = { inputTransfers: 0, inputBytes: 0, checkpointBytes: 0, checkpointFrames: 0, continuations: 0, measurementMs: 0 };
const originalPost = Worker.prototype.postMessage, originalEmit = Worker.prototype.emit;
Worker.prototype.postMessage = function(message, ...args) {
  if (message?.snapshot || message?.kind === "session-continue") {
    const start = performance.now(); const bytes = serialize(message).byteLength;
    counters.inputBytes += bytes; counters.measurementMs += performance.now() - start;
    if (message.snapshot) counters.inputTransfers++; else counters.continuations++;
  }
  return originalPost.call(this, message, ...args);
};
Worker.prototype.emit = function(event, reply, ...args) {
  const cursor = event === "message" && reply?.result?.value?.checkpoint?.cursor;
  if (cursor) { counters.checkpointFrames++; counters.checkpointBytes += typeof cursor === "string" ? Buffer.byteLength(cursor) : cursor.byteLength; }
  return originalEmit.call(this, event, reply, ...args);
};
const cpu = process.cpuUsage(), started = performance.now();
let semantic, inputSha256, extra = {}, close = async () => {};
try {
  if (id === "reads" || id === "funnel") {
    const database = await openMeasuredDatabase(load); close = database.close;
    const reader = id === "reads" ? await seedPlanReader(load, database.sql) : await seedFunnelReader(load, database.sql, hash);
    database.reset(); const coldStart = performance.now(); await reader.poll();
    extra.cold = { wallMs: performance.now() - coldStart, ...database.measurements() };
    database.reset(); const warmStart = performance.now(); const values = [];
    for (let n = 0; n < 20; n++) values.push(await reader.poll());
    extra.warm = { wallMs: performance.now() - warmStart, reads: 20, ...database.measurements() };
    semantic = comparableStatus(values.at(-1)); inputSha256 = hash(reader.input);
  } else {
    const request = id === "anna" || id === "expanded" ? profile("A2") : structuredClone(goldens.d3);
    const normalized = await normalizePlanRequest({ config: loadAgenticConfig(), snapshot: frozen.snapshot, request }); assert.ok("state" in normalized);
    const job = { state: { ...normalized.state, searchEffort: id === "expanded" ? "expanded" : "standard" }, snapshot: frozen.snapshot };
    inputSha256 = hash({ job, ceilings: frozen.ceilings });
    const { MatchWorkerPool } = await load("lib/agentic/plan/match-worker-pool.ts");
    const pool = new MatchWorkerPool(2); close = () => pool.close();
    const run = async sessionId => {
      let checkpoint, previous = 0, result;
      do {
        result = typeof pool.runResidentChunk === "function" ? await pool.runResidentChunk(sessionId, job, { checkpoint, chunkBudget: 4000 })
          : await pool.runChunk(job, { checkpoint, chunkBudget: 4000 });
        assert.ok(result.expansionAttempts - previous <= 4000); previous = result.expansionAttempts; checkpoint = result.checkpoint;
      } while (!result.done);
      assert.ok(previous <= (id === "expanded" ? 64000 : 8000)); if (id === "expanded") assert.ok(previous > 8000);
      return result.result;
    };
    if (id === "mixed") {
      const database = await openMeasuredDatabase(load), reader = await seedPlanReader(load, database.sql);
      const closePool = close; close = async () => { await closePool(); await database.close(); };
      await reader.poll(); database.reset();
      const polls = (async () => { const values = []; for (let n = 0; n < 40; n++) {
        values.push(comparableStatus(await reader.poll())); await new Promise(resolve => setTimeout(resolve, 20));
      } return values; })();
      const [matches, statuses] = await Promise.all([Promise.all([run("one"), run("two")]), polls]);
      semantic = { matches, statuses }; extra.polls = { reads: 40, ...database.measurements() };
    } else semantic = id === "concurrent" ? await Promise.all([run("one"), run("two")]) : await run("one");
    if (id === "d3") assert.ok(performance.now() - started <= 15000, "Standard D3 functional deadline");
    if (id === "expanded") assert.ok(performance.now() - started <= 180000, "Expanded functional deadline");
  }
  const usage = process.cpuUsage(cpu);
  const measurements = { wallMs: performance.now() - started, cpuMs: (usage.user + usage.system) / 1000,
    maxRssBytes: process.resourceUsage().maxRSS * 1024, memory: process.memoryUsage(), eventLoopP95Ms: loop.percentile(95) / 1e6,
    ...counters, ...extra };
  writeFileSync(output, JSON.stringify({ id, inputSha256, semantic: semanticValue(semantic), measurements }, null, 2), { flag: "wx", mode: 0o600 });
} finally { loop.disable(); await close(); }
process.exit(0);
