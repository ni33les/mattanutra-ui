import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => file && existsSync(file));
}

describe("legacy product translation cleanup", () => {
  it("keeps fixed product translation columns out of the schema", () => {
    const schema = source("db-schema.sql");

    assert.doesNotMatch(schema, /\btitle_en\b/);
    assert.doesNotMatch(schema, /\btitle_th\b/);
    assert.doesNotMatch(schema, /\bdescription_en\b/);
    assert.doesNotMatch(schema, /\bdescription_th\b/);
    assert.match(schema, /CREATE TABLE public\.product_translations/);
    assert.match(schema, /CREATE TABLE public\.product_import_translations/);
  });

  it("limits legacy DB-column reads to the cleanup migration", () => {
    const allowed = new Set([
      "scripts/apply-legacy-translation-cleanup-schema.ts"
    ]);
    const offenders = trackedFiles()
      .filter((file) =>
        /\.(?:ts|tsx|sql)$/.test(file) &&
        !allowed.has(file) &&
        !file.startsWith("db-rollout/")
      )
      .flatMap((file) => {
        const text = source(file);
        const matches = text.match(
          /\b(?:products|product_imports|product_versions)\.(?:title_en|title_th|description_en|description_th)\b/g
        );

        return matches ? [`${file}: ${matches.join(", ")}`] : [];
      });

    assert.deepEqual(offenders, []);
  });

  it("keeps deprecated request keys isolated to the translation normalizer and cleanup migration", () => {
    const allowed = new Set([
      "lib/product-translation-input.ts",
      "scripts/apply-legacy-translation-cleanup-schema.ts",
      "test/legacy-translation-cleanup-static.test.ts",
      "test/product-catalogue-csv.test.ts",
      "test/zh-cn-localization-static.test.ts"
    ]);
    const offenders = trackedFiles()
      .filter((file) =>
        /\.(?:ts|tsx)$/.test(file) &&
        !allowed.has(file) &&
        !file.startsWith("db-rollout/")
      )
      .flatMap((file) => {
        const text = source(file);
        const matches = text.match(
          /\b(?:titleEn|titleTh|descriptionEn|descriptionTh)\b/g
        );

        return matches ? [`${file}: ${matches.join(", ")}`] : [];
      });

    assert.deepEqual(offenders, []);
  });
});
