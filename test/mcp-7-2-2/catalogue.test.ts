import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { installRealCatalogue, uninstallRealCatalogue } from "../ax-refinement/helpers.ts";
import { correctedAxSnapshot } from "../../lib/agentic/catalogue/ax-corrections.ts";
import { administrationDailyPills } from "../../lib/product-administration.ts";
import { catalogueCorrectionState } from "../../lib/catalogue-corrections.ts";

test("D3_reviewed_administration_preserves_prices_facts_and_unknown_pack", async () => {
  const frozen = await installRealCatalogue("dev");
  try {
    const manifest = JSON.parse(readFileSync("data/catalogue-corrections/mcp-7.2.2-dev.json", "utf8"));
    const correction = manifest.corrections[0]; assert.equal(manifest.corrections.length, 1);
    const before = frozen.snapshot.products.find(row => row.candidate.id === correction.entityId); assert.ok(before);
    assert.equal(before.candidate.administration, null);
    const result = correctedAxSnapshot(frozen.snapshot, manifest);
    const product = result.snapshot.products.find(row => row.candidate.id === correction.entityId); assert.ok(product);
    assert.equal(administrationDailyPills(product.candidate.administration)! * 2, 2);
    assert.equal(product.candidate.administration!.packQuantity, null);
    assert.deepEqual(product.candidate.facts, before.candidate.facts);
    assert.equal(product.unitPriceMinor, before.unitPriceMinor); assert.equal(product.retailerSku, before.retailerSku);
    assert.deepEqual(result.snapshot.supplements, frozen.snapshot.supplements);
    assert.equal(catalogueCorrectionState(correction, correction.before), "pending");
    assert.equal(catalogueCorrectionState(correction, correction.after), "already_applied");
    assert.throws(() => catalogueCorrectionState(correction, { ...correction.before, administration: { route: "topical" } }), /changed/);
  } finally { uninstallRealCatalogue(); }
});
