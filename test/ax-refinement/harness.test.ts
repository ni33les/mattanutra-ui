import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { validateImpact, validateSelection, semanticValue } from "../../scripts/run-ax-refinement-tests.mjs";
import { experimentHygiene } from "../../scripts/run-matcher-experiment-tests.mjs";

test("AXR-HYG-01 preserves the complete requirement inventory and detects omitted execution", () => {
  const impact = JSON.parse(readFileSync(new URL("./impact.json", import.meta.url), "utf8"));
  validateImpact(impact);
  assert.equal(impact.requirements.filter((row: { id: string }) => !row.id.startsWith("AXR-SRCH") && !row.id.startsWith("AXR-DEPLOY")).length, 25);
  const missing = structuredClone(impact); missing.requirements.pop();
  assert.throws(() => validateImpact(missing), /requirement/i);
  assert.throws(() => validateSelection(["a.test.ts"], []), /execut/i);
  assert.throws(() => validateSelection(["a.test.ts"], ["b.test.ts"]), /execut/i);
  assert.doesNotThrow(() => validateSelection(["a.test.ts"], ["a.test.ts"]));
  for (const source of ["test.skip('x',()=>assert.ok(true))", "test.only('x',()=>{})", "test('x', {retries:1},()=>{})", "test('x',()=>{if(!data)return; assert.equal(data,1)})"]) {
    assert.ok(experimentHygiene(source, "hygiene-probe.ts").length > 0, source);
  }
});

test("AXR-HYG-02 semantic comparison preserves dose, money, option order and source timestamps", () => {
  const result = { status: "ready", options: [{ id: "sku-a", dose: .6, price: 53500 }, { id: "sku-b", dose: 1, price: 10000 }], sourceVerifiedAt: "2026-09-07" };
  assert.deepEqual(semanticValue(result), semanticValue({ options: result.options, status: result.status, sourceVerifiedAt: result.sourceVerifiedAt }));
  assert.notDeepEqual(semanticValue(result), semanticValue({ ...result, options: [...result.options].reverse() }));
  assert.notDeepEqual(semanticValue(result), semanticValue({ ...result, options: [{ ...result.options[0], dose: .61 }, result.options[1]] }));
  assert.notDeepEqual(semanticValue(result), semanticValue({ ...result, sourceVerifiedAt: "2026-09-08" }));
});

test("AXR-REG-03 scoped override retains six exact profiles and independently identified historical inputs", () => {
  const directory = new URL("../fixtures/ax-refinement/", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", directory), "utf8"));
  const bytes = readFileSync(new URL("six-profiles.json", directory));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.profilesSha256);
  const profiles = JSON.parse(bytes.toString());
  assert.deepEqual(profiles.map((row: { id: string }) => row.id), ["A1", "A2", "A3", "A4", "A5", "A6"]);
  assert.equal(profiles[1].request.targets[2].name, "Algae Omega-3");
  assert.equal(profiles[1].request.requirements.omega3SourcePreference, "algae_only");
  assert.equal(profiles[5].request.currentSupplements[0].daysRemaining, 90);
  assert.equal(manifest.originalCatalogueContentHash, null);
  assert.equal(manifest.originalReportStatus, "ORIGINAL_DATA_UNAVAILABLE");
});
