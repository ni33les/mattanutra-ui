import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { validateCuratedMasterSnapshot } from "@/lib/catalogue-master-validation";
import {
  CATALOGUE_RELOAD_ORDER,
  CATALOGUE_TRUNCATE_ORDER,
  catalogueSnapshotSelectSql,
  catalogueSnapshotTableNames
} from "@/lib/catalogue-snapshot-tables";
import { managedFoodSeeds } from "@/lib/managed-foods";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { scripts?: Record<string, string> };
const uatRebuildScript = readFileSync(
  new URL("../scripts/rebuild-uat-db.mjs", import.meta.url),
  "utf8"
);

function indexOf(tableName: string, order: readonly string[]) {
  const index = order.indexOf(tableName);

  assert.notEqual(index, -1, `${tableName} must be present`);

  return index;
}

function sampleSnapshotTables(overrides: Record<string, unknown[]> = {}) {
  return {
    blog_posts: [
      {
        id: "blog-1",
        status: "published"
      }
    ],
    finance_accounts: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "xAI"
      }
    ],
    food_translations: [
      {
        food_id: "food-1",
        locale: "en"
      },
      {
        food_id: "food-1",
        locale: "th"
      },
      {
        food_id: "food-1",
        locale: "zh-CN"
      }
    ],
    foods: [
      {
        id: "food-1",
        image_path: "/foods/salmon.webp",
        is_active: true,
        list_status: "whitelisted",
        normalized_name: "salmon"
      }
    ],
    product_facts: [{ id: "fact-1" }],
    products: [{ id: "product-1" }],
    supplement_aliases: [{ id: "alias-1" }],
    supplement_safety_limits: [{ id: "limit-1" }],
    supplements: [{ id: "supplement-1" }],
    testimonials: [
      {
        id: "testimonial-1",
        status: "draft"
      }
    ],
    ...overrides
  };
}

describe("UAT destructive rebuild master data guardrails", () => {
  it("defines UAT snapshot and rebuild commands around existing reset/reload tooling", () => {
    assert.match(packageJson.scripts?.["uat:master:snapshot"] ?? "", /catalogue-snapshot\.ts/);
    assert.match(packageJson.scripts?.["uat:master:snapshot"] ?? "", /--strict-master-data/);
    assert.match(packageJson.scripts?.["uat:rebuild"] ?? "", /rebuild-uat-db\.mjs/);
    assert.match(uatRebuildScript, /scripts\/reset-dev-db\.mjs/);
    assert.match(uatRebuildScript, /scripts\/catalogue-reload\.ts/);
    assert.match(uatRebuildScript, /foods:schema:apply/);
    assert.match(uatRebuildScript, /locales:schema:apply/);
    assert.match(uatRebuildScript, /versions:core:check/);
    assert.match(uatRebuildScript, /products:validation-consistency/);
  });

  it("keeps runtime and admin audit tables out of the curated master snapshot", () => {
    const names = catalogueSnapshotTableNames();

    for (const tableName of [
      "assessments",
      "bpm",
      "finance_transactions",
      "food_admin_audit",
      "payments",
      "product_admin_audit",
      "supplement_admin_audit",
      "tasks",
      "worker_sessions"
    ]) {
      assert.equal(names.includes(tableName), false, `${tableName} must not be snapshotted`);
    }
  });

  it("orders reloads and truncates around foreign-key dependencies", () => {
    assert.ok(indexOf("site_locales", CATALOGUE_RELOAD_ORDER) < indexOf("testimonials", CATALOGUE_RELOAD_ORDER));
    assert.ok(indexOf("finance_accounts", CATALOGUE_RELOAD_ORDER) < indexOf("products", CATALOGUE_RELOAD_ORDER));
    assert.ok(indexOf("testimonials", CATALOGUE_RELOAD_ORDER) < indexOf("blog_posts", CATALOGUE_RELOAD_ORDER));
    assert.ok(indexOf("nutrients", CATALOGUE_RELOAD_ORDER) < indexOf("food_nutrient_profiles", CATALOGUE_RELOAD_ORDER));
    assert.ok(indexOf("foods", CATALOGUE_RELOAD_ORDER) < indexOf("food_translations", CATALOGUE_RELOAD_ORDER));
    assert.ok(indexOf("products", CATALOGUE_RELOAD_ORDER) < indexOf("product_facts", CATALOGUE_RELOAD_ORDER));
    assert.ok(indexOf("supplements", CATALOGUE_RELOAD_ORDER) < indexOf("product_facts", CATALOGUE_RELOAD_ORDER));
    assert.ok(indexOf("blog_posts", CATALOGUE_TRUNCATE_ORDER) < indexOf("testimonials", CATALOGUE_TRUNCATE_ORDER));
    assert.ok(indexOf("food_translations", CATALOGUE_TRUNCATE_ORDER) < indexOf("foods", CATALOGUE_TRUNCATE_ORDER));
    assert.ok(indexOf("product_facts", CATALOGUE_TRUNCATE_ORDER) < indexOf("products", CATALOGUE_TRUNCATE_ORDER));
  });

  it("filters archived content out of snapshot SQL", () => {
    assert.match(
      catalogueSnapshotSelectSql("blog_posts"),
      /where status in \('published', 'draft', 'review'\)/i
    );
    assert.match(
      catalogueSnapshotSelectSql("testimonials"),
      /where status in \('published', 'draft', 'review'\)/i
    );
    assert.doesNotMatch(catalogueSnapshotSelectSql("products"), /where status/i);
  });

  it("validates strict master snapshots for food readiness and content scope", () => {
    assert.deepEqual(validateCuratedMasterSnapshot(sampleSnapshotTables(), { strict: true }).errors, []);

    assert.match(
      validateCuratedMasterSnapshot(sampleSnapshotTables({
        blog_posts: [{ id: "blog-archived", status: "archived" }]
      }), { strict: true }).errors.join("; "),
      /blog_posts includes archived/
    );

    assert.match(
      validateCuratedMasterSnapshot(sampleSnapshotTables({
        finance_accounts: []
      }), { strict: true }).errors.join("; "),
      /finance_accounts/
    );

    assert.match(
      validateCuratedMasterSnapshot(sampleSnapshotTables({
        food_translations: [{ food_id: "food-1", locale: "en" }]
      }), { strict: true }).errors.join("; "),
      /missing th translation/
    );

    assert.match(
      validateCuratedMasterSnapshot(sampleSnapshotTables({
        food_translations: [
          { food_id: "food-1", locale: "en" },
          { food_id: "food-1", locale: "th" }
        ]
      }), { strict: true }).errors.join("; "),
      /missing zh-CN translation/
    );
  });

  it("ships local image files for every managed food seed", () => {
    for (const food of managedFoodSeeds) {
      assert.equal(
        existsSync(join(process.cwd(), "public", food.imagePath.replace(/^\//, ""))),
        true,
        `${food.normalizedName} image must exist`
      );
    }
  });
});
