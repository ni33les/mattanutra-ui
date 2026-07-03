import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { validateCuratedMasterSnapshot } from "@/lib/catalogue-master-validation";
import {
  CATALOGUE_RELOAD_ORDER,
  CATALOGUE_TRUNCATE_ORDER,
  catalogueSnapshotSelectSql,
  catalogueSnapshotTableNames,
} from "@/lib/catalogue-snapshot-tables";
import { managedFoodSeeds } from "@/lib/managed-foods";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { scripts?: Record<string, string> };
const uatRebuildScript = readFileSync(
  new URL("../scripts/rebuild-uat-db.mjs", import.meta.url),
  "utf8",
);
const uatMinimalSeedScript = readFileSync(
  new URL("../scripts/seed-uat-minimal-runtime.ts", import.meta.url),
  "utf8",
);
const uatPreservedConfigScript = readFileSync(
  new URL("../scripts/uat-preserved-config.ts", import.meta.url),
  "utf8",
);
const uatDeployScript = readFileSync(
  new URL("../scripts/deploy-uat.mjs", import.meta.url),
  "utf8",
);
const uatSmokeScript = readFileSync(
  new URL("../scripts/uat-smoke.mjs", import.meta.url),
  "utf8",
);
const workerCredentialProfiles = readFileSync(
  new URL("../lib/worker-agent-credentials.ts", import.meta.url),
  "utf8",
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
        status: "published",
      },
    ],
    finance_accounts: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "xAI",
      },
    ],
    food_translations: [
      {
        food_id: "food-1",
        locale: "en",
      },
      {
        food_id: "food-1",
        locale: "th",
      },
      {
        food_id: "food-1",
        locale: "zh-CN",
      },
    ],
    foods: [
      {
        id: "food-1",
        image_path: "/foods/salmon.webp",
        is_active: true,
        list_status: "whitelisted",
        normalized_name: "salmon",
      },
    ],
    product_facts: [{ id: "fact-1" }],
    products: [{ id: "product-1" }],
    product_translations: [
      {
        product_id: "product-1",
        locale: "en",
      },
      {
        product_id: "product-1",
        locale: "th",
      },
      {
        product_id: "product-1",
        locale: "zh-CN",
      },
    ],
    supplement_aliases: [{ id: "alias-1" }],
    supplement_safety_limits: [{ id: "limit-1" }],
    supplements: [{ id: "supplement-1" }],
    supplement_translations: [
      {
        supplement_id: "supplement-1",
        locale: "en",
      },
      {
        supplement_id: "supplement-1",
        locale: "th",
      },
      {
        supplement_id: "supplement-1",
        locale: "zh-CN",
      },
    ],
    testimonials: [
      {
        id: "testimonial-1",
        status: "draft",
      },
    ],
    ...overrides,
  };
}

describe("UAT destructive rebuild master data guardrails", () => {
  it("defines UAT snapshot and rebuild commands around existing reset/reload tooling", () => {
    assert.match(
      packageJson.scripts?.["uat:master:snapshot"] ?? "",
      /catalogue-snapshot\.ts/,
    );
    assert.match(
      packageJson.scripts?.["uat:master:snapshot"] ?? "",
      /--strict-master-data/,
    );
    assert.match(
      packageJson.scripts?.["uat:preserve-config"] ?? "",
      /uat-preserved-config\.ts/,
    );
    assert.match(
      packageJson.scripts?.["uat:rebuild"] ?? "",
      /rebuild-uat-db\.mjs/,
    );
    assert.match(
      packageJson.scripts?.["uat:seed:minimal-runtime"] ?? "",
      /seed-uat-minimal-runtime\.ts/,
    );
    assert.match(packageJson.scripts?.["deploy:uat"] ?? "", /deploy-uat\.mjs/);
    assert.match(uatRebuildScript, /scripts\/reset-dev-db\.mjs/);
    assert.match(uatRebuildScript, /scripts\/catalogue-reload\.ts/);
    assert.match(uatRebuildScript, /scripts\/uat-preserved-config\.ts/);
    assert.match(uatRebuildScript, /MATTANUTRA_UAT_PRESERVE_CONFIG/);
    assert.match(uatRebuildScript, /grantMnAccess/);
    assert.match(uatRebuildScript, /DB_ALLOW_DIRECT_CONNECTION/);
    assert.match(uatRebuildScript, /DB_POOL_MAX/);
    assert.match(uatRebuildScript, /admin-access:schema:apply/);
    assert.match(uatRebuildScript, /communications:schema:apply/);
    assert.match(uatRebuildScript, /panya:schema:apply/);
    assert.match(uatRebuildScript, /retail-checkout:schema:apply/);
    assert.match(uatRebuildScript, /retail-stock:schema:apply/);
    assert.match(uatRebuildScript, /product-identifiers:schema:apply/);
    assert.match(uatRebuildScript, /products:soft-delete:schema:apply/);
    assert.match(uatRebuildScript, /product-regulatory:schema:apply/);
    assert.match(uatRebuildScript, /product-offers:schema:remove/);
    assert.match(uatRebuildScript, /supplements:country-availability:schema:apply/);
    assert.match(uatRebuildScript, /foods:schema:apply/);
    assert.match(uatRebuildScript, /locales:schema:apply/);
    assert.match(uatRebuildScript, /versions:core:check/);
    assert.match(uatRebuildScript, /products:validation-consistency/);
    assert.match(uatMinimalSeedScript, /DEV_DB_URL/);
    assert.match(uatMinimalSeedScript, /delight-pharmacy/);
    assert.match(uatMinimalSeedScript, /seedWorkerCredentialsIfMissing/);
    assert.match(uatMinimalSeedScript, /preserveExisting/);
    assert.match(uatMinimalSeedScript, /stock_quantity = 0/);
    assert.match(uatMinimalSeedScript, /stockQuantityResetToZero/);
    assert.match(workerCredentialProfiles, /WORKER_PRODUCTS_AGENT_API_KEY/);
    assert.match(workerCredentialProfiles, /WORKER_CARRIER_AGENT_API_KEY/);
    assert.match(workerCredentialProfiles, /productMatcher/);
    assert.match(workerCredentialProfiles, /carrierCoordinator/);
    assert.match(uatDeployScript, /supplements:country-availability:schema:apply/);
    assert.match(uatDeployScript, /products:soft-delete:schema:apply/);
    assert.match(uatDeployScript, /deriveUatDbUrl/);
    assert.match(uatDeployScript, /UAT_DB_SCHEMA_URL/);
    assert.match(uatDeployScript, /git", \["push", "origin", `HEAD:uat`\]/);
    assert.match(uatDeployScript, /npmCommand, \["run", "uat:smoke"\]/);
    assert.match(uatSmokeScript, /"supplement_country_availability"/);
  });

  it("preserves UAT-only access, communication channel, and credential config", () => {
    for (const tableName of [
      "organisations",
      "people",
      "organisation_memberships",
      "admin_passkey_credentials",
      "agents",
      "agent_credentials",
      "communication_identities",
      "communication_channels",
      "organisation_communication_identities",
      "organisation_notification_preferences",
      "retail_carrier_accounts",
      "organisation_finance_accounts",
    ]) {
      assert.match(
        uatPreservedConfigScript,
        new RegExp(`name: "${tableName}"`),
      );
    }

    assert.match(
      uatPreservedConfigScript,
      /communication_channels\.status = 'active'/,
    );
    assert.match(
      uatPreservedConfigScript,
      /retail_carrier_accounts[\s\S]*status <> 'deleted'/,
    );
    assert.match(uatPreservedConfigScript, /requireNonEmpty: true/);
    assert.match(uatPreservedConfigScript, /snapshot|restore|verify/);
    assert.doesNotMatch(uatPreservedConfigScript, /communication_messages/);
    assert.doesNotMatch(uatPreservedConfigScript, /plan_chat_messages/);
    assert.doesNotMatch(uatPreservedConfigScript, /admin_sessions/);
    assert.doesNotMatch(uatPreservedConfigScript, /worker_sessions/);
    assert.doesNotMatch(uatPreservedConfigScript, /retail_customer_orders/);
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
      "worker_sessions",
    ]) {
      assert.equal(
        names.includes(tableName),
        false,
        `${tableName} must not be snapshotted`,
      );
    }
  });

  it("orders reloads and truncates around foreign-key dependencies", () => {
    assert.ok(
      indexOf("site_locales", CATALOGUE_RELOAD_ORDER) <
        indexOf("testimonials", CATALOGUE_RELOAD_ORDER),
    );
    assert.ok(
      indexOf("supplements", CATALOGUE_RELOAD_ORDER) <
        indexOf("supplement_translations", CATALOGUE_RELOAD_ORDER),
    );
    assert.ok(
      indexOf("finance_accounts", CATALOGUE_RELOAD_ORDER) <
        indexOf("products", CATALOGUE_RELOAD_ORDER),
    );
    assert.ok(
      indexOf("testimonials", CATALOGUE_RELOAD_ORDER) <
        indexOf("blog_posts", CATALOGUE_RELOAD_ORDER),
    );
    assert.ok(
      indexOf("nutrients", CATALOGUE_RELOAD_ORDER) <
        indexOf("food_nutrient_profiles", CATALOGUE_RELOAD_ORDER),
    );
    assert.ok(
      indexOf("foods", CATALOGUE_RELOAD_ORDER) <
        indexOf("food_translations", CATALOGUE_RELOAD_ORDER),
    );
    assert.ok(
      indexOf("products", CATALOGUE_RELOAD_ORDER) <
        indexOf("product_facts", CATALOGUE_RELOAD_ORDER),
    );
    assert.ok(
      indexOf("products", CATALOGUE_RELOAD_ORDER) <
        indexOf("product_identifiers", CATALOGUE_RELOAD_ORDER),
    );
    assert.ok(
      indexOf("products", CATALOGUE_RELOAD_ORDER) <
        indexOf("product_identifier_candidates", CATALOGUE_RELOAD_ORDER),
    );
    assert.ok(
      indexOf("supplements", CATALOGUE_RELOAD_ORDER) <
        indexOf("product_facts", CATALOGUE_RELOAD_ORDER),
    );
    assert.ok(
      indexOf("blog_posts", CATALOGUE_TRUNCATE_ORDER) <
        indexOf("testimonials", CATALOGUE_TRUNCATE_ORDER),
    );
    assert.ok(
      indexOf("food_translations", CATALOGUE_TRUNCATE_ORDER) <
        indexOf("foods", CATALOGUE_TRUNCATE_ORDER),
    );
    assert.ok(
      indexOf("product_facts", CATALOGUE_TRUNCATE_ORDER) <
        indexOf("products", CATALOGUE_TRUNCATE_ORDER),
    );
    assert.ok(
      indexOf("product_identifiers", CATALOGUE_TRUNCATE_ORDER) <
        indexOf("products", CATALOGUE_TRUNCATE_ORDER),
    );
    assert.ok(
      indexOf("product_identifier_candidates", CATALOGUE_TRUNCATE_ORDER) <
        indexOf("products", CATALOGUE_TRUNCATE_ORDER),
    );
    assert.ok(
      indexOf("supplement_translations", CATALOGUE_TRUNCATE_ORDER) <
        indexOf("supplements", CATALOGUE_TRUNCATE_ORDER),
    );
  });

  it("filters archived content out of snapshot SQL", () => {
    assert.match(
      catalogueSnapshotSelectSql("blog_posts"),
      /where status in \('published', 'draft', 'review'\)/i,
    );
    assert.match(
      catalogueSnapshotSelectSql("testimonials"),
      /where status in \('published', 'draft', 'review'\)/i,
    );
    assert.doesNotMatch(
      catalogueSnapshotSelectSql("products"),
      /where status/i,
    );
  });

  it("validates strict master snapshots for food readiness and content scope", () => {
    assert.deepEqual(
      validateCuratedMasterSnapshot(sampleSnapshotTables(), { strict: true })
        .errors,
      [],
    );

    assert.match(
      validateCuratedMasterSnapshot(
        sampleSnapshotTables({
          blog_posts: [{ id: "blog-archived", status: "archived" }],
        }),
        { strict: true },
      ).errors.join("; "),
      /blog_posts includes archived/,
    );

    assert.match(
      validateCuratedMasterSnapshot(
        sampleSnapshotTables({
          finance_accounts: [],
        }),
        { strict: true },
      ).errors.join("; "),
      /finance_accounts/,
    );

    assert.match(
      validateCuratedMasterSnapshot(
        sampleSnapshotTables({
          product_translations: [
            { product_id: "product-1", locale: "en" },
            { product_id: "product-1", locale: "th" },
          ],
        }),
        { strict: true },
      ).errors.join("; "),
      /product product-1 is missing zh-CN translation/,
    );

    assert.deepEqual(
      validateCuratedMasterSnapshot(
        sampleSnapshotTables({
          product_translations: [
            { product_id: "product-1", locale: "en" },
            { product_id: "product-1", locale: "th" },
          ],
        }),
        { allowIncompleteTranslations: true, strict: true },
      ).errors,
      [],
    );

    assert.match(
      validateCuratedMasterSnapshot(
        sampleSnapshotTables({
          supplement_translations: [
            { supplement_id: "supplement-1", locale: "en" },
            { supplement_id: "supplement-1", locale: "th" },
          ],
        }),
        { strict: true },
      ).errors.join("; "),
      /supplement supplement-1 is missing zh-CN translation/,
    );

    assert.match(
      validateCuratedMasterSnapshot(
        sampleSnapshotTables({
          food_translations: [{ food_id: "food-1", locale: "en" }],
        }),
        { strict: true },
      ).errors.join("; "),
      /missing th translation/,
    );

    assert.match(
      validateCuratedMasterSnapshot(
        sampleSnapshotTables({
          food_translations: [
            { food_id: "food-1", locale: "en" },
            { food_id: "food-1", locale: "th" },
          ],
        }),
        { strict: true },
      ).errors.join("; "),
      /missing zh-CN translation/,
    );
  });

  it("ships local image files for every managed food seed", () => {
    for (const food of managedFoodSeeds) {
      assert.equal(
        existsSync(
          join(process.cwd(), "public", food.imagePath.replace(/^\//, "")),
        ),
        true,
        `${food.normalizedName} image must exist`,
      );
    }
  });
});
