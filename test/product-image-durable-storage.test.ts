import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("durable product image storage tooling", () => {
  it("wires Spaces probes, upload smoke, and non-durable repair commands", async () => {
    const [
      packageJson,
      deployUat,
      uatSmoke,
      probeScript,
      uploadSmokeScript,
      repairScript
    ] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("scripts/deploy-uat.mjs", "utf8"),
      readFile("scripts/uat-smoke.mjs", "utf8"),
      readFile("scripts/probe-spaces-image-storage.ts", "utf8"),
      readFile("scripts/uat-product-image-upload-smoke.ts", "utf8"),
      readFile("scripts/repair-nondurable-product-images.ts", "utf8")
    ]);

    assert.match(packageJson, /uat:images:storage:probe/);
    assert.match(packageJson, /uat:product-image-upload-smoke/);
    assert.match(packageJson, /products:images:repair-nondurable/);
    assert.match(deployUat, /UAT_IMAGE_STORAGE_PROBE_REQUIRED/);
    assert.match(uatSmoke, /DigitalOcean image storage env/);
    assert.match(probeScript, /DeleteObjectCommand/);
    assert.match(probeScript, /verifyPublicImageUrl/);
    assert.match(uploadSmokeScript, /UAT_PRODUCT_IMAGE_SMOKE_PRODUCT_ID/);
    assert.match(uploadSmokeScript, /getAdminProductDetailData/);
    assert.match(uploadSmokeScript, /getAdminProductListData/);
    assert.match(repairScript, /image_url like '\/uploads\/uat\/%'/);
    assert.doesNotMatch(repairScript, /delete\s+from\s+public\.products/i);
  });
});
