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
    return { id, identical: true, semanticSha256: benchmarkHash(semanticValue(after.semantic)), control: before.measurements, candidate: after.measurements };
  });
  return { passed: true, normalization: "Object key order only; typed BigInt and Map encoding. Matching results, array order and work counts preserved exactly.", rows };
}
