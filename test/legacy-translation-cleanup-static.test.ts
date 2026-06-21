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

  it("preserves existing translation rows and version snapshots during cleanup", () => {
    const cleanup = source("scripts/apply-legacy-translation-cleanup-schema.ts");

    assert.match(
      cleanup,
      /on conflict \(product_id, locale\) do nothing/,
      "existing product_translations rows must not be updated during UAT cleanup"
    );
    assert.match(
      cleanup,
      /on conflict \(import_id, locale\) do nothing/,
      "existing product_import_translations rows must not be updated during UAT cleanup"
    );
    assert.doesNotMatch(
      cleanup,
      /product_translations[\s\S]*on conflict \(product_id, locale\) do update/,
      "cleanup must never overwrite UAT product translation text, status, metadata, or timestamps"
    );
    assert.match(
      cleanup,
      /not \(coalesce\(product_versions\.snapshot, '\{\}'::jsonb\) \? 'translations'\)/,
      "product_versions snapshots should only be backfilled when translations are missing"
    );
    assert.match(
      cleanup,
      /process\.argv\.includes\("--require-owner"\)/,
      "owner-only UAT cleanup must be enforceable from the runbook"
    );
  });
});
