import assert from "node:assert/strict";

export const bytes = value => Buffer.byteLength(JSON.stringify(value), "utf8");
export function measureCall({ request, response }) {
  const result = response?.result ?? response;
  const structured = result?.structuredContent;
  return { requestBytes: bytes(request), responseBytes: bytes(response),
    structuredBytes: structured === undefined ? 0 : bytes(structured),
    textBytes: (result?.content ?? []).filter(row => row.type === "text").reduce((sum, row) => sum + Buffer.byteLength(row.text, "utf8"), 0),
    fields: structured ? Object.entries(structured).map(([field, value]) => ({ field, bytes: bytes(value) })).sort((a, b) => b.bytes - a.bytes) : [] };
}
export function measureJourney(calls) {
  assert.ok(calls.length, "An empty journey is not evidence");
  const measurements = calls.map(measureCall);
  return { calls: calls.length, requestBytes: measurements.reduce((sum, row) => sum + row.requestBytes, 0),
    responseBytes: measurements.reduce((sum, row) => sum + row.responseBytes, 0), measurements };
}
export function validateInventory(manifest, discovered, executedCases) {
  assert.ok(manifest.length, "Empty scoped inventory");
  assert.equal(new Set(manifest.map(row => row.file)).size, manifest.length, "Duplicate scoped file");
  const cases = manifest.flatMap(row => row.cases);
  assert.equal(new Set(cases).size, cases.length, "Duplicate case ID");
  for (const row of manifest) {
    assert.ok(row.reason.length >= 20 && row.cases.length, "Missing impact reason or cases");
    assert.ok(discovered.includes(row.file), `Missing file ${row.file}`);
    for (const id of row.cases) assert.ok(executedCases.some(name => name.includes(id)), `Unexecuted case ${id}`);
  }
  return true;
}
