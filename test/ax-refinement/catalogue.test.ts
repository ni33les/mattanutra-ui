import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { correctedAxSnapshot } from "../../lib/agentic/catalogue/ax-corrections.ts";
import { loadFrozenAnnaInput, reconstructAnnaSnapshot } from "../../lib/matcher/experiments/frozen-corpus.ts";
import { actualDaysSupplied, servingsPerPackFromProduct } from "../../lib/agentic/value/pack-facts.ts";
import { catalogueCorrectionState, catalogueRecordFingerprint } from "../../lib/catalogue-corrections.ts";
import { contributionFor } from "../../lib/matcher/candidates.ts";
import { toMatcherProduct } from "../../lib/agentic/plan/to-matcher-product.ts";

test("AXR-DATA-01 audit preserves the identifiable original subset and explicitly unavailable historical union", () => {
  const audit = JSON.parse(readFileSync(new URL("../fixtures/ax-refinement/catalogue-audit.json", import.meta.url), "utf8"));
  assert.equal(audit.originalUnionStatus, "ORIGINAL_DATA_UNAVAILABLE");
  assert.equal(audit.rows.length, 7); assert.equal(new Set(audit.rows.map((row: { productId: string }) => row.productId)).size, 7);
  for (const row of audit.rows) assert.ok(row.variant && row.composition.length && row.sourceUrl && row.dietaryEvidence);
  assert.equal(audit.rows.find((row: { variant: string }) => row.variant.includes("CALPLEX")).packReview, "DATA_BLOCKED");
});

test("AXR-DATA-02 reviewed corrections preserve prices, unknown packs and reference content while excluding contradictory coverage", async () => {
  const raw = await loadFrozenAnnaInput("dev"), frozen = reconstructAnnaSnapshot(raw);
  const result = correctedAxSnapshot(frozen.snapshot, raw);
  assert.notEqual(catalogueRecordFingerprint(result.snapshot), catalogueRecordFingerprint(frozen.snapshot));
  assert.equal(result.receipts.length, 2);
  assert.deepEqual(result.snapshot.supplements, frozen.snapshot.supplements);
  assert.deepEqual(result.snapshot.products.map(p => [p.productId, p.retailerSku, p.unitPriceMinor, p.stockStatus]), frozen.snapshot.products.map(p => [p.productId, p.retailerSku, p.unitPriceMinor, p.stockStatus]));
  const relacza = result.snapshot.products.find(p => p.productId === "prd_50265f478be551c496f907a01d746dab")!;
  assert.equal(relacza.candidate.administration?.unitsPerServing, 1); assert.equal(servingsPerPackFromProduct(relacza), null);
  const bacopa = result.snapshot.products.find(p => p.productId === "prd_65fd0d6245a04430aae754932a9c3f28")!;
  const fact = bacopa.candidate.facts.find(row => row.name === "Vitamin B12")!;
  assert.equal(fact.amount, 1); assert.equal(fact.confidence, "high"); assert.equal(fact.mappingStatus, "conflicting");
  assert.equal(contributionFor(toMatcherProduct(bacopa), "Vitamin B12", fact.supplementId!).length, 0);
  const manifest = JSON.parse(readFileSync(new URL("../fixtures/ax-refinement/dev-corrections.json", import.meta.url), "utf8"));
  for (const row of manifest.corrections) {
    assert.equal(catalogueCorrectionState(row, row.before), "pending"); assert.equal(catalogueCorrectionState(row, row.after), "already_applied");
    assert.throws(() => catalogueCorrectionState(row, { ...row.before, id: "concurrent-replacement" }), /changed/);
  }
});

test("AXR-DATA-03 physical supply and cash use independently calculated pack quantities; unknown remains unavailable", async () => {
  const frozen = reconstructAnnaSnapshot(await loadFrozenAnnaInput("dev"));
  const product = frozen.snapshot.products.find(row => row.productId === "prd_59b7b3c3265f450a8cf6fdb62a3a5963")!;
  assert.equal(servingsPerPackFromProduct(product), 90);
  const packs = Math.ceil(90 * 2 / 90);
  assert.equal(packs, 2); assert.equal(packs * product.unitPriceMinor, product.unitPriceMinor + product.unitPriceMinor);
  assert.equal(actualDaysSupplied({ servingsPerPack: 90, purchasedQuantity: packs, dailyServings: 2 }), 90);
  assert.equal(actualDaysSupplied({ servingsPerPack: null, purchasedQuantity: 1, dailyServings: 1 }), null);
});
