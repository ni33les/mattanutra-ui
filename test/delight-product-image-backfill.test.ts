import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  productTokens,
  tokenScore
} from "@/lib/delight-product-image-backfill";

describe("Delight product image backfill", () => {
  it("scores same-SKU image evidence across dose and pack formatting", () => {
    const tokens = productTokens(
      "BLACKMORES BIO C 1000MG DAILY IMU+ 30 TABS",
      "Blackmores"
    );

    assert.ok(tokens.includes("1000"));
    assert.ok(tokens.includes("30"));
    assert.ok(tokens.includes("c"));
    assert.ok(!tokens.includes("blackmores"));
    assert.ok(!tokens.includes("mg"));

    const strong = tokenScore(
      "BLACKMORES BIO C 1000MG DAILY IMU+ 30 TABS",
      "Blackmores Bio C 1000 Daily Immune 30 tablets product image",
      "Blackmores"
    );
    const weak = tokenScore(
      "BLACKMORES BIO C 1000MG DAILY IMU+ 30 TABS",
      "Blackmores fish oil 1000 omega 3 400 capsules product image",
      "Blackmores"
    );

    assert.ok(strong > 0.75, `expected strong match, got ${strong}`);
    assert.ok(weak < strong, `expected weak match below ${strong}, got ${weak}`);
  });

  it("wires a dry-run-first CLI for missing active Delight images", async () => {
    const [packageJson, scriptSource, librarySource] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("scripts/backfill-delight-product-images.ts", "utf8"),
      readFile("lib/delight-product-image-backfill.ts", "utf8")
    ]);

    assert.match(packageJson, /backfill:delight-product-images/);
    assert.match(scriptSource, /hasArg\("apply"\)/);
    assert.match(scriptSource, /runDelightProductImageBackfill/);
    assert.match(librarySource, /public\.retail_sellable_products/);
    assert.match(librarySource, /products\.image_url is null/);
    assert.match(librarySource, /duckduckgo\.com\/i\.js/);
    assert.match(librarySource, /NON_HEALTH_IMAGE_RESULT_PATTERN/);
    assert.match(librarySource, /cfmoto/);
    assert.match(librarySource, /ayam/);
    assert.match(librarySource, /set\s+image_url = \$\{candidate\.imageUrl\}/);
    assert.match(librarySource, /public\.product_imports/);
    assert.match(librarySource, /delightImageBackfill/);
    assert.doesNotMatch(librarySource, /delete\s+from\s+public\.products/i);
  });
});
