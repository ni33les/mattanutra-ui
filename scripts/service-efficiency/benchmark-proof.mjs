import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const benchmarkHash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function semanticValue(value) {
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (value instanceof Map) return [...value].map(semanticValue);
  if (Array.isArray(value)) return value.map(semanticValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, semanticValue(value[key])]));
  return value;
}
export function compareBenchmarkRuns(control, candidate, inventory) {
  assert.ok(inventory.length > 0 && new Set(inventory).size === inventory.length, "Empty or duplicate benchmark inventory");
  for (const rows of [control, candidate]) assert.deepEqual(rows.map(row => row.id).sort(), [...inventory].sort(), "Missing or duplicate benchmark inventory");
  const rows = inventory.map(id => {
    const before = control.find(row => row.id === id), after = candidate.find(row => row.id === id);
    assert.equal(before.inputSha256, after.inputSha256, `Different input: ${id}`);
    assert.deepEqual(semanticValue(before.semantic), semanticValue(after.semantic), `Changed semantic result: ${id}`);
    for (const row of [before, after]) for (const key of ["wallMs", "cpuMs", "maxRssBytes"]) assert.ok(Number.isFinite(row.measurements[key]) && row.measurements[key] >= 0, `Missing measurement: ${id}.${key}`);
    if (!["reads", "funnel"].includes(id)) for (const row of [before, after]) {
      for (const phase of ["queue", "execution"]) {
        const metric = row.measurements[phase];
        assert.ok(metric && Number.isSafeInteger(metric.count) && metric.count > 0 && metric.count === row.measurements.checkpointFrames, `Missing or incomplete dispatch ${phase} probes: ${id}`);
        for (const key of ["totalMs", "p50Ms", "p95Ms", "maxMs"]) assert.ok(Number.isFinite(metric[key]) && metric[key] >= 0, `Invalid ${phase}.${key}: ${id}`);
      }
    }
    return { id, identical: true, semanticSha256: benchmarkHash(semanticValue(after.semantic)), control: before.measurements, candidate: after.measurements };
  });
  return { passed: true, normalization: "Object key order only; typed BigInt and Map encoding. Matching results, array order and work counts preserved exactly.", rows };
}

/** Hard release condition for this work package, separate from descriptive
 * efficiency comparisons. Kernel diagnostics and cached timings cannot pass. */
export function verifyFreshStandardTimings(report, identity) {
  assert.equal(report.kind, 'native-request-to-committed-terminal');
  assert.equal(report.sourceCommit, identity.sourceCommit); assert.equal(report.sourceUnchanged, true);
  assert.deepEqual(report.fixtureHashes, identity.fixtureHashes);
  const fixtures = ['d3', 'daniel-create', 'daniel-refine', 'maya-create'];
  assert.deepEqual(Object.keys(identity.fixtureHashes).sort(), [...fixtures, 'maya-expanded'].sort());
  for (const hash of Object.values(identity.fixtureHashes)) assert.match(hash, /^[a-f0-9]{64}$/);
  assert.deepEqual(report.trials.map(row => `${row.fixture}:${row.trial}`).sort(), fixtures.flatMap(name => [0, 1, 2].map(trial => `${name}:${trial}`)).sort());
  for (const row of report.trials) {
    for (const flag of ['workerRegistered', 'idleWorker', 'catalogueLoaded']) assert.equal(row[flag], true, `${row.fixture}.${flag}`);
    assert.equal(row.completedCacheHit, false); assert.equal(row.attempts, 8000);
    for (const field of ['admissionMs', 'retrievalMs', 'terminalMs']) assert.ok(Number.isFinite(row[field]) && row[field] >= 0 && row[field] < 1000, `${row.fixture}:${row.trial}.${field} must be below 1000ms`);
    assert.match(row.semanticHash, /^[a-f0-9]{64}$/);
    assert.equal(row.semanticHash, report.trials.find(other => other.fixture === row.fixture).semanticHash);
    assert.ok(row.processingBytes > 0 && row.processingBytes < 2048);
    if (row.fixture === 'd3') { assert.ok(row.structuredBytes > 0 && row.structuredBytes < 20000); assert.ok(row.messageBytes >= row.structuredBytes && row.messageBytes < 22000); }
  }
  assert.equal(report.expanded.fixture, 'maya-expanded'); assert.equal(report.expanded.completedCacheHit, false);
  assert.equal(report.expanded.attempts, 64000);
  assert.ok(Number.isFinite(report.expanded.terminalMs) && report.expanded.terminalMs >= 0 && report.expanded.terminalMs <= 180000);
  return { passed: true, trials: report.trials.length, sourceCommit: report.sourceCommit, fixtureHashes: report.fixtureHashes };
}
