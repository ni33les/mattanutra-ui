import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import {
  CATALOGUE_SNAPSHOT_TABLES,
  catalogueSnapshotTableNames
} from "../lib/catalogue-snapshot-tables.ts";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { scripts?: Record<string, string> };
const nextConfigSource = readFileSync(
  new URL("../next.config.ts", import.meta.url),
  "utf8"
);
const assessment = readFileSync(
  new URL("../docs/codebase-cleanup-assessment.md", import.meta.url),
  "utf8"
);
const snapshotScript = readFileSync(
  new URL("../scripts/catalogue-snapshot.ts", import.meta.url),
  "utf8"
);
const reloadScript = readFileSync(
  new URL("../scripts/catalogue-reload.ts", import.meta.url),
  "utf8"
);
const resetCleanScript = readFileSync(
  new URL("../scripts/reset-dev-db-clean.mjs", import.meta.url),
  "utf8"
);
const auditScript = readFileSync(
  new URL("../scripts/audit-codebase.ts", import.meta.url),
  "utf8"
);
const adminSafetyViews = readFileSync(
  new URL("../components/admin/safety-views.tsx", import.meta.url),
  "utf8"
);
const adminDashboardView = readFileSync(
  new URL("../components/admin-dashboard.tsx", import.meta.url),
  "utf8"
);
const adminContentView = readFileSync(
  new URL("../components/admin/content-view.tsx", import.meta.url),
  "utf8"
);
const adminUi = readFileSync(
  new URL("../components/admin/ui.tsx", import.meta.url),
  "utf8"
);
const adminProductView = readFileSync(
  new URL("../components/admin/product-view.tsx", import.meta.url),
  "utf8"
);
const adminProductsService = readFileSync(
  new URL("../lib/admin-products.ts", import.meta.url),
  "utf8"
);
const adminReviewQueueView = readFileSync(
  new URL("../components/admin/review-queue-view.tsx", import.meta.url),
  "utf8"
);
const adminMarketingLeadsView = readFileSync(
  new URL("../components/admin/marketing-leads.tsx", import.meta.url),
  "utf8"
);
const adminSupplementView = readFileSync(
  new URL("../components/admin/supplement-view.tsx", import.meta.url),
  "utf8"
);
const customerCss = readFileSync(
  new URL("../app/customer.css", import.meta.url),
  "utf8"
);
const globalsCss = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8"
);
const repoRoot = new URL("..", import.meta.url);

function lineCount(value: string) {
  return value.split(/\r?\n/).length;
}

function trackedSourceFiles(dir: URL): URL[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (
      entry.name === ".git" ||
      entry.name === ".next" ||
      entry.name === "coverage" ||
      entry.name === "node_modules"
    ) {
      return [];
    }

    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);

    if (entry.isDirectory()) {
      return trackedSourceFiles(url);
    }

    if (!/\.(?:css|json|md|mjs|ts|tsx)$/.test(entry.name)) {
      return [];
    }

    return statSync(url).size < 1_000_000 ? [url] : [];
  });
}

describe("codebase cleanup guardrails", () => {
  it("keeps unauthorized AI provider references out of the repo", () => {
    const provider = ["OPEN", "AI"].join("");
    const forbidden = [
      `${provider}_API_KEY`,
      `${provider}_MODEL`,
      `api.${provider.toLowerCase()}.com`,
      provider,
      `call${provider[0]}${provider.slice(1).toLowerCase()}`,
      `${provider[0]}${provider.slice(1).toLowerCase()}ChatCompletion`
    ];

    for (const file of trackedSourceFiles(repoRoot)) {
      const path = file.pathname;
      const source = readFileSync(file, "utf8");

      for (const term of forbidden) {
        assert.equal(source.includes(term), false, `${path} contains ${term}`);
      }
    }
  });

  it("keeps direct Grok calls on bounded response budgets", () => {
    const directCallPattern = /callGrokChatCompletion\(\{/g;

    for (const file of trackedSourceFiles(new URL("../lib/", import.meta.url))) {
      const path = file.pathname;

      if (path.endsWith("/lib/grok-client.ts")) {
        continue;
      }

      const source = readFileSync(file, "utf8");
      const matches = [...source.matchAll(directCallPattern)];

      for (const match of matches) {
        const callStart = match.index ?? 0;
        const callSnippet = source.slice(callStart, callStart + 700);

        assert.match(
          callSnippet,
          /maxTokens(?:\s*:|\s*,)/,
          `${path} has an unbounded direct Grok call`
        );
      }
    }
  });

  it("defines the cleanup scripts promised by the assessment", () => {
    for (const script of [
      "audit:codebase",
      "catalogue:reload",
      "catalogue:snapshot",
      "db:reset:dev:clean",
      "versions:core:apply",
      "versions:core:check"
    ]) {
      assert.ok(packageJson.scripts?.[script], `${script} must be defined`);
    }
  });

  it("snapshots every product and supplement catalogue table needed for reload", () => {
    const names = catalogueSnapshotTableNames();

    for (const table of [
      "product_admin_audit",
      "product_brand_countries",
      "product_brands",
      "product_countries",
      "product_facts",
      "product_import_runs",
      "product_imports",
      "product_offers",
      "product_versions",
      "products",
      "supplement_admin_audit",
      "supplement_aliases",
      "supplement_safety_limits",
      "supplement_versions",
      "supplements"
    ]) {
      assert.ok(names.includes(table), `${table} must be in snapshot scope`);
    }

    assert.ok(
      CATALOGUE_SNAPSHOT_TABLES.some((table) => !table.requiredForReload),
      "snapshot should distinguish reload-critical tables from useful audit tables"
    );
  });

  it("requires a curated snapshot before a clean dev reset", () => {
    assert.match(resetCleanScript, /MATTANUTRA_CATALOGUE_SNAPSHOT/);
    assert.match(resetCleanScript, /catalogue-reload\.ts/);
    assert.match(resetCleanScript, /--confirm-catalogue-reload/);
  });

  it("writes both portable and database catalogue backups", () => {
    assert.match(snapshotScript, /writeFile\(outputPath/);
    assert.match(snapshotScript, /create schema if not exists/);
    assert.match(snapshotScript, /create table [\s\S]+ as select \* from public/);
  });

  it("keeps reload guarded to dev-like database targets", () => {
    assert.match(reloadScript, /confirm-catalogue-reload/);
    assert.match(reloadScript, /NODE_ENV/);
    assert.match(reloadScript, /production/);
    assert.match(reloadScript, /product_imports/);
    assert.match(reloadScript, /review_task_id: null/);
  });

  it("keeps an honest DB-up assessment artifact", () => {
    for (const section of [
      "Live DB Inventory",
      "Foreign-Key Shape",
      "Current Source-of-Truth Policy",
      "Code Inventory",
      "Cleanup Decisions By Domain",
      "Reloadable Catalogue Snapshot"
    ]) {
      assert.match(assessment, new RegExp(`## ${section}`));
    }
  });

  it("provides a repeatable audit command for future reassessments", () => {
    assert.match(auditScript, /tableCounts/);
    assert.match(auditScript, /codeInventory/);
    assert.match(auditScript, /Direct SQL Write Hotspots/);
  });

  it("keeps admin safety views split by domain roots", () => {
    assert.ok(
      lineCount(adminSafetyViews) < 1000,
      "safety-views should remain the food wrapper plus compatibility exports"
    );
    assert.match(adminProductView, /\bexport\s+function\s+AdminProductsView\b/);
    assert.match(adminSupplementView, /\bexport\s+function\s+AdminSupplementsView\b/);
    assert.match(adminReviewQueueView, /\bexport\s+function\s+AdminReviewQueueView\b/);
    assert.doesNotMatch(adminSafetyViews, /\bfunction\s+ProductModal\b/);
    assert.doesNotMatch(adminSafetyViews, /\bfunction\s+ProductImportReviewModal\b/);
    assert.doesNotMatch(adminSafetyViews, /\bfunction\s+SupplementDetailsModal\b/);
  });

  it("keeps marketplace-era product import helpers out of the active product service", () => {
    assert.doesNotMatch(adminProductsService, /\bimportDiscoveredMarketplaceProducts\b/);
    assert.doesNotMatch(adminProductsService, /\bfactsFromMarketplaceSnapshot\b/);
    assert.doesNotMatch(adminProductsService, /\bmarketplace_discovery\b/);
  });

  it("keeps admin overlays behind shared primitives", () => {
    assert.match(adminUi, /\bexport function AdminModal\b/);
    assert.match(adminUi, /\bexport function AdminDrawer\b/);
    assert.match(adminUi, /DialogBackdrop/);

    for (const [name, source] of [
      ["admin dashboard", adminDashboardView],
      ["admin content", adminContentView],
      ["admin product", adminProductView],
      ["admin review queue", adminReviewQueueView],
      ["admin safety", adminSafetyViews],
      ["admin marketing leads", adminMarketingLeadsView],
      ["admin supplements", adminSupplementView]
    ] as const) {
      assert.doesNotMatch(source, /DialogBackdrop|DialogPanel|DialogTitle/, name);
      assert.doesNotMatch(source, /fixed inset-0 z-50/, name);
      assert.doesNotMatch(source, /aria-modal=\{true\}|role="dialog"/, name);
    }
  });

  it("keeps customer motion and chrome CSS away from admin routes", () => {
    assert.doesNotMatch(globalsCss, /customer\.css/);
    assert.match(customerCss, /\.mn-customer-shell\.mn-reveal-ready \[data-reveal\]/);
    assert.doesNotMatch(customerCss, /(^|\n)\s*\.mn-reveal-ready \[data-reveal\]/);
    assert.doesNotMatch(customerCss, /(^|\n)\s*\.mn-titlebar\b/);
    assert.doesNotMatch(customerCss, /(^|\n)\s*\.mn-site-footer\b/);
  });

  it("keeps local admin dev origins hydrated", () => {
    assert.match(nextConfigSource, /allowedDevOrigins/);
    assert.match(nextConfigSource, /["']localhost["']/);
    assert.match(nextConfigSource, /["']127\.0\.0\.1["']/);
  });
});
