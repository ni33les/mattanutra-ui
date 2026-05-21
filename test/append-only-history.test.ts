import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const schema = readFileSync(new URL("../db-schema.sql", import.meta.url), "utf8");
const domainHistory = readFileSync(
  new URL("../lib/domain-history.ts", import.meta.url),
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

describe("append-only domain history", () => {
  it("defines canonical history tables with immutable triggers", () => {
    for (const table of [
      "assessment_events",
      "supplement_versions",
      "supplement_alias_events",
      "product_fact_versions"
    ]) {
      assert.match(schema, new RegExp(`create\\s+table\\s+public\\.${table}\\b`, "i"));
      assert.match(schema, new RegExp(`${table}_no_update_delete`, "i"));
    }

    for (const table of [
      "product_versions",
      "supplement_safety_limits",
      "product_recommendation_runs",
      "product_recommendation_items"
    ]) {
      assert.match(schema, new RegExp(`${table}_no_update_delete`, "i"));
    }

    assert.match(schema, /\bprevent_domain_history_mutation\s*\(/i);
  });

  it("backfills current projections into baseline history", () => {
    for (const table of [
      "assessment_events",
      "supplement_versions",
      "supplement_alias_events",
      "product_fact_versions"
    ]) {
      assert.match(
        schema,
        new RegExp(`insert\\s+into\\s+public\\.${table}[\\s\\S]+append_only_baseline`, "i"),
        `${table} must receive a baseline backfill`
      );
    }
  });

  it("routes key mutable writes through history append helpers", () => {
    assert.match(domainHistory, /\bexport\s+async\s+function\s+appendAssessmentEvent\b/);
    assert.match(domainHistory, /\bexport\s+async\s+function\s+appendSupplementVersion\b/);
    assert.match(domainHistory, /\bexport\s+async\s+function\s+appendSupplementAliasEvent\b/);
    assert.match(domainHistory, /\bexport\s+async\s+function\s+appendProductFactVersion\b/);

    assert.match(taskResultApplier, /\bappendAssessmentEvent\b/);
    assert.match(taskWorker, /\bappendAssessmentEvent\b/);
    assert.match(taskWorkItems, /\bappendAssessmentEvent\b/);
    assert.match(assessmentStore, /\binsert\s+into\s+public\.assessment_events\b/);
    assert.match(adminSupplements, /\bappendSupplementVersion\b/);
    assert.match(adminSupplements, /\bappendSupplementAliasEvent\b/);
    assert.match(adminProducts, /\bappendProductFactVersion\b/);
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
