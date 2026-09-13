import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const reference = JSON.parse(readFileSync("test/pharmacy-landing/reference.json", "utf8"));
const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

test("PHARM-LANDING assets retain the supplied font and mascot bytes", () => {
  assert.equal(reference.sources.length, 2);
  assert.equal(reference.assets.length, 5);
  for (const asset of reference.assets) assert.equal(hash(asset.file), asset.sha256, asset.file);
  assert.deepEqual(reference.views.map((view: { locale: string; width: number }) => [view.locale, view.width]),
    [["en", 1280], ["en", 390], ["th", 1280], ["th", 390]]);
});

test("PHARM-LANDING retains the existing site header, footer and journey wrapper", () => {
  assert.equal(hash(reference.shell.file), reference.shell.sha256);
});
