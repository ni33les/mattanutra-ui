import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

test("PHARM-DEEP supplied chapter artwork retains its original bytes", () => {
  const reference = JSON.parse(readFileSync("test/pharmacy-reveal/deep-dive-reference.json", "utf8"));
  assert.equal(reference.assets.length, 6);
  assert.match(reference.sourceSha256, /^[a-f0-9]{64}$/);
  for (const asset of reference.assets) {
    assert.equal(createHash("sha256").update(readFileSync(asset.file)).digest("hex"), asset.sha256, asset.file);
  }
});
