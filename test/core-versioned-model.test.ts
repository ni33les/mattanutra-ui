import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const schema = readFileSync(new URL("../db-schema.sql", import.meta.url), "utf8");
const domainVersions = readFileSync(
  new URL("../lib/domain-versions.ts", import.meta.url),
  "utf8"
);
const assessmentStore = readFileSync(
  new URL("../lib/assessment-store.ts", import.meta.url),
  "utf8"
);
const taskResultApplier = readFileSync(
  new URL("../lib/task-result-applier.ts", import.meta.url),
  "utf8"
);
const taskWorker = readFileSync(
  new URL("../lib/task-worker.ts", import.meta.url),
  "utf8"
);
const taskWorkItems = readFileSync(
  new URL("../lib/task-work-items.ts", import.meta.url),
  "utf8"
);
const adminSupplements = readFileSync(
  new URL("../lib/admin-supplements.ts", import.meta.url),
  "utf8"
);
const adminProducts = readFileSync(
  new URL("../lib/admin-products.ts", import.meta.url),
  "utf8"
);
const manufacturerImporter = readFileSync(
  new URL("../scripts/scrape-manufacturer-products.ts", import.meta.url),
  "utf8"
);

describe("core append-only versioned model", () => {
  it("defines version tables as the core source of truth", () => {
    for (const table of [
      "assessment_versions",
      "nutrition_plan_versions",
      "supplement_versions",
      "product_versions"
    ]) {
      assert.match(schema, new RegExp(`create\\s+table\\s+public\\.${table}\\b`, "i"));
      assert.match(schema, new RegExp(`${table}_no_update_delete`, "i"));
    }

    for (const table of [
      "product_recommendation_runs",
      "product_recommendation_items",
      "supplement_safety_limits"
    ]) {
      assert.match(schema, new RegExp(`${table}_no_update_delete`, "i"));
    }

    assert.match(schema, /\bprevent_domain_version_mutation\s*\(/i);
  });

  it("does not recreate the rejected sidecar history tables", () => {
    assert.doesNotMatch(schema, /\bcreate\s+table\s+public\.assessment_events\b/i);
    assert.doesNotMatch(schema, /\bcreate\s+table\s+public\.supplement_alias_events\b/i);
    assert.doesNotMatch(schema, /\bcreate\s+table\s+public\.product_fact_versions\b/i);
  });

  it("backfills current projections into baseline versions", () => {
    for (const table of [
      "assessment_versions",
      "nutrition_plan_versions",
      "supplement_versions",
      "product_versions"
    ]) {
      assert.match(
        schema,
        new RegExp(`insert\\s+into\\s+public\\.${table}[\\s\\S]+versioned_projection_baseline`, "i"),
        `${table} must receive a baseline version`
      );
    }
  });

  it("routes key mutable writes through version append helpers", () => {
    assert.match(domainVersions, /\bexport\s+async\s+function\s+appendAssessmentVersion\b/);
    assert.match(domainVersions, /\bexport\s+async\s+function\s+appendNutritionPlanVersion\b/);
    assert.match(domainVersions, /\bexport\s+async\s+function\s+appendSupplementVersion\b/);
    assert.match(domainVersions, /\bexport\s+async\s+function\s+appendSupplementAliasVersion\b/);
    assert.doesNotMatch(domainVersions, /\bappendProductFactVersion\b/);

    assert.match(taskResultApplier, /\bappendAssessmentVersion\b/);
    assert.match(taskWorker, /\bappendAssessmentVersion\b/);
    assert.match(taskWorkItems, /\bappendAssessmentVersion\b/);
    assert.match(assessmentStore, /\bappendAssessmentVersion\b/);
    assert.doesNotMatch(assessmentStore, /\binsert\s+into\s+public\.assessment_events\b/);
    assert.match(adminSupplements, /\bappendSupplementVersion\b/);
    assert.match(adminSupplements, /\bappendSupplementAliasVersion\b/);
    assert.doesNotMatch(adminProducts, /\bappendProductFactVersion\b/);
    assert.match(adminProducts, /\binsert\s+into\s+public\.product_versions\b/);
  });

  it("does not clear catalogue data by deleting append-only recommendation history", () => {
    assert.doesNotMatch(
      manufacturerImporter,
      /delete\s+from\s+public\.product_recommendation_items/i
    );
    assert.doesNotMatch(
      manufacturerImporter,
      /delete\s+from\s+public\.product_imports/i
    );
    assert.doesNotMatch(
      manufacturerImporter,
      /delete\s+from\s+public\.product_import_runs/i
    );
    assert.doesNotMatch(
      manufacturerImporter,
      /delete\s+from\s+public\.products/i
    );
  });
});
