import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import {
  CATALOGUE_SNAPSHOT_TABLES,
  catalogueSnapshotSelectSql,
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
const adminProductUi = readFileSync(
  new URL("../components/admin/product-view-ui.tsx", import.meta.url),
  "utf8"
);
const adminProductDetailRoute = readFileSync(
  new URL("../app/[locale]/admin/products/[productId]/page.tsx", import.meta.url),
  "utf8"
);
const adminProductUpdateRoute = readFileSync(
  new URL("../app/api/admin/products/[id]/route.ts", import.meta.url),
  "utf8"
);
const adminProductsService = readFileSync(
  new URL("../lib/admin-products.ts", import.meta.url),
  "utf8"
);
const adminRetailFinancialsService = readFileSync(
  new URL("../lib/admin-retail-financials.ts", import.meta.url),
  "utf8"
);
const adminRetailStockService = readFileSync(
  new URL("../lib/admin-retail-stock.ts", import.meta.url),
  "utf8"
);
const adminRetailStockCodecs = readFileSync(
  new URL("../lib/admin-retail-stock-codecs.ts", import.meta.url),
  "utf8"
);
const adminRetailOrderReadModel = readFileSync(
  new URL("../lib/admin-retail-order-read-model.ts", import.meta.url),
  "utf8"
);
const adminRetailStockReadModel = readFileSync(
  new URL("../lib/admin-retail-stock-read-model.ts", import.meta.url),
  "utf8"
);
const adminRetailStockPipeline = readFileSync(
  new URL("../lib/admin-retail-stock-pipeline.ts", import.meta.url),
  "utf8"
);
const adminRetailStockView = readFileSync(
  new URL("../components/admin/retail-stock-view.tsx", import.meta.url),
  "utf8"
);
const adminRetailStockCustomerOrderDisplay = readFileSync(
  new URL(
    "../components/admin/retail-stock/customer-order-display-model.ts",
    import.meta.url
  ),
  "utf8"
);
const adminRetailStockOrderDocuments = readFileSync(
  new URL("../components/admin/retail-stock/order-documents.ts", import.meta.url),
  "utf8"
);
const adminRetailStockShoppingListViewModel = readFileSync(
  new URL(
    "../components/admin/retail-stock/shopping-list-view-model.ts",
    import.meta.url
  ),
  "utf8"
);
const adminRetailStockControls = readFileSync(
  new URL("../components/admin/retail-stock/stock-controls.tsx", import.meta.url),
  "utf8"
);
const retailOrderWorkflowRules = readFileSync(
  new URL("../lib/retail-order-workflow-rules.ts", import.meta.url),
  "utf8"
);
const communicationsService = readFileSync(
  new URL("../lib/communications.ts", import.meta.url),
  "utf8"
);
const productCatalogueCsv = readFileSync(
  new URL("../lib/product-catalogue-csv.ts", import.meta.url),
  "utf8"
);
const productRecommendations = readFileSync(
  new URL("../lib/product-recommendations.ts", import.meta.url),
  "utf8"
);
const systemAgents = readFileSync(
  new URL("../lib/system-agents.ts", import.meta.url),
  "utf8"
);
const dbSchema = readFileSync(new URL("../db-schema.sql", import.meta.url), "utf8");
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
      "uat:master:snapshot",
      "uat:rebuild",
      "versions:core:apply",
      "versions:core:check"
    ]) {
      assert.ok(packageJson.scripts?.[script], `${script} must be defined`);
    }
  });

  it("snapshots every curated master data table needed for reload", () => {
    const names = catalogueSnapshotTableNames();

    for (const table of [
      "blog_posts",
      "finance_accounts",
      "food_aliases",
      "food_nutrient_profiles",
      "food_safety_rules",
      "food_serving_sizes",
      "food_translations",
      "foods",
      "nutrients",
      "product_brand_countries",
      "product_brands",
      "product_countries",
      "product_facts",
      "product_identifier_candidates",
      "product_identifiers",
      "product_import_runs",
      "product_imports",
      "product_import_translations",
      "product_regulatory_approvals",
      "product_translations",
      "product_versions",
      "products",
      "supplement_aliases",
      "supplement_safety_limits",
      "supplement_translations",
      "supplement_versions",
      "supplements",
      "testimonials"
    ]) {
      assert.ok(names.includes(table), `${table} must be in snapshot scope`);
    }

    for (const table of [
      "assessments",
      "bpm",
      "food_admin_audit",
      "finance_transactions",
      "payments",
      "product_admin_audit",
      "supplement_admin_audit",
      "tasks"
    ]) {
      assert.equal(names.includes(table), false, `${table} must stay out of snapshot scope`);
    }

    assert.equal(
      CATALOGUE_SNAPSHOT_TABLES.every((table) => table.requiredForReload),
      true,
      "curated UAT master snapshot should only include reload-critical tables"
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
    assert.match(snapshotScript, /catalogueSnapshotSelectSql/);
    assert.match(catalogueSnapshotSelectSql("products"), /select \* from public\."products"/);
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
    assert.doesNotMatch(auditScript, /legacyTerms,\s*\n\s*legacyTerms,/);
  });

  it("keeps the first cleanup package warning-free by removing confirmed dead symbols", () => {
    const adminViewDatabaseAvailableSource = adminDashboardView.slice(
      adminDashboardView.indexOf("function adminViewDatabaseAvailable"),
      adminDashboardView.indexOf("export function AdminDashboard")
    );

    assert.doesNotMatch(adminViewDatabaseAvailableSource, /productDetailId/);

    for (const [name, source, forbidden] of [
      ["admin product detail route", adminProductDetailRoute, "emptyAdminProductsData"],
      ["retail stock view", adminRetailStockView, "function stockAvailabilityLabel"],
      ["retail financials service", adminRetailFinancialsService, "function objectValue"],
      ["communications service", communicationsService, "function booleanValue"],
      ["product catalogue CSV importer", productCatalogueCsv, "function lineApprovalText"],
      ["system agents", systemAgents, "RETAIL_AGENT_EXECUTABLE_TASK_TYPES"]
    ] as const) {
      assert.equal(source.includes(forbidden), false, `${name} still contains ${forbidden}`);
    }
  });

  it("keeps retail stock cleanup hotspots visible until they are split", () => {
    assert.ok(
      lineCount(adminRetailStockService) <= 6_650,
      "admin retail stock service must not grow before it is decomposed"
    );
    assert.ok(
      lineCount(adminRetailStockView) <= 4_700,
      "admin retail stock view must not grow before it is decomposed"
    );
    assert.match(
      adminRetailStockView,
      /@\/components\/admin\/retail-stock\/customer-order-display/
    );
    assert.match(
      adminRetailStockView,
      /@\/components\/admin\/retail-stock\/order-documents/
    );
    assert.match(
      adminRetailStockView,
      /@\/components\/admin\/retail-stock\/shopping-list-view-model/
    );
    assert.match(
      adminRetailStockView,
      /@\/components\/admin\/retail-stock\/stock-controls/
    );
    for (const forbidden of [
      /function activeShoppingListCoverageUnits/,
      /function buildCustomerOrderWorkflowSteps/,
      /function customerOrderStatusMetricKey/,
      /function printRetailOrderDocument/,
      /function ProductThumbnail/,
      /function StockNumberInput/,
      /type ReorderPurchaseItem\s*=/,
      /type StockDraft\s*=/
    ]) {
      assert.doesNotMatch(
        adminRetailStockView,
        forbidden,
        `retail stock view must not reintroduce ${forbidden}`
      );
    }
    assert.match(
      adminRetailStockCustomerOrderDisplay,
      /export function customerOrderStatusMetricKey/
    );
    assert.match(
      adminRetailStockCustomerOrderDisplay,
      /export function buildCustomerOrderWorkflowSteps/
    );
    assert.match(
      adminRetailStockOrderDocuments,
      /export function printRetailOrderDocument/
    );
    assert.match(
      adminRetailStockShoppingListViewModel,
      /export function activeShoppingListCoverageUnits/
    );
    assert.match(adminRetailStockControls, /export function ProductThumbnail/);
    assert.match(adminRetailStockControls, /export function StockNumberInput/);
    assert.match(adminRetailStockService, /\bexport async function getAdminRetailStockData\b/);
    assert.match(adminRetailStockService, /\bexport async function advanceRetailCustomerOrder\b/);
    assert.match(adminRetailStockService, /\bexport async function recordRetailCustomerOrderPickupBooked\b/);
    assert.match(adminRetailStockService, /@\/lib\/admin-retail-stock-codecs/);
    assert.match(adminRetailStockService, /@\/lib\/admin-retail-order-read-model/);
    assert.match(adminRetailStockService, /@\/lib\/admin-retail-stock-pipeline/);
    assert.match(adminRetailStockService, /@\/lib\/admin-retail-stock-read-model/);
    assert.match(
      adminRetailStockService,
      /export \{ getRetailCustomerOrderActionStates \}/
    );
    assert.match(
      adminRetailStockService,
      /export \{ getRetailStockPipeline \}/
    );
    for (const forbidden of [
      /function routingSnapshotFromMetadata/,
      /function pricingSnapshotFromMetadata/,
      /function deliveryDetailsFromMetadata/,
      /function shipmentFromMetadata/,
      /function mergeCustomerOrderShipment/,
      /function lineAvailabilityFromMetadata/,
      /function getRetailCustomerOrderActionStates/,
      /function getRetailCustomerOrderWorkflowHealth/,
      /function customerOrderWorkflowTimeline/,
      /function isTerminalTaskStatus/,
      /function pipelineStatus/,
      /function aggregatePipelineRows/,
      /function pipelineKey/,
      /function localizedProductTitleExpression/,
      /export async function getRetailStockPipeline/,
      /function stockStatus/,
      /function movementDelta/,
      /function integerOrDefault/,
      /function objectRecord/
    ]) {
      assert.doesNotMatch(
        adminRetailStockService,
        forbidden,
        `retail stock service must not reintroduce ${forbidden}`
      );
    }
    assert.match(adminRetailStockCodecs, /export function stockStatus/);
    assert.match(adminRetailStockCodecs, /export function movementDelta/);
    assert.match(adminRetailStockCodecs, /export function integerOrDefault/);
    assert.match(adminRetailStockCodecs, /export function objectRecord/);
    assert.match(adminRetailOrderReadModel, /export function deliveryDetailsFromMetadata/);
    assert.match(adminRetailOrderReadModel, /export function lineAvailabilityFromMetadata/);
    assert.match(adminRetailOrderReadModel, /export function getRetailCustomerOrderActionStates/);
    assert.match(adminRetailOrderReadModel, /export function customerOrderWorkflowTimeline/);
    assert.match(adminRetailOrderReadModel, /export function mapCustomerOrderLineRow/);
    assert.match(adminRetailOrderReadModel, /export function mapCustomerOrderRow/);
    for (const forbiddenInlineMapper of [
      /carrierAccounts: carrierAccountRows\.map\(\(row\) => \(\{/,
      /customerOrders: customerOrderRows\.map\(\(row\) => \{/,
      /lots: lotRows\.map\(\(row\) => \(\{/,
      /movements: movementRows\.map\(\(row\) => \(\{/,
      /productOptions: productRows\.map\(\(row\) => \(\{/,
      /reorderAdvice: adviceRows\.map\(\(row\) => \(\{/,
      /rows: stockRows\.map\(\(row\) => \(\{/,
      /shoppingLists: shoppingListRows\.map\(\(row\) => \(\{/
    ]) {
      assert.doesNotMatch(
        adminRetailStockService,
        forbiddenInlineMapper,
        `retail stock service must not reintroduce inline mapper ${forbiddenInlineMapper}`
      );
    }
    assert.match(adminRetailStockReadModel, /export function mapRetailCarrierAccountRow/);
    assert.match(adminRetailStockReadModel, /export function mapRetailStockRow/);
    assert.match(adminRetailStockReadModel, /export function mapRetailShoppingListRow/);
    assert.match(adminRetailStockPipeline, /export function retailStockPipelineStatus/);
    assert.match(adminRetailStockPipeline, /export function aggregateRetailStockPipelineRows/);
    assert.match(adminRetailStockPipeline, /export function retailStockPipelineKey/);
    assert.match(adminRetailStockPipeline, /export async function getRetailStockPipeline/);
    assert.match(adminRetailStockPipeline, /export function localizedProductTitleExpression/);
    assert.match(adminRetailStockService, /@\/lib\/retail-order-workflow-rules/);
    assert.doesNotMatch(adminRetailStockService, /\bfunction workflowStageForStatus\b/);
    assert.doesNotMatch(adminRetailStockService, /\bfunction retailOrderWorkflowTaskDetails\b/);
    assert.match(retailOrderWorkflowRules, /\bexport function workflowStageForStatus\b/);
    assert.match(retailOrderWorkflowRules, /\bexport function retailOrderWorkflowTaskDetails\b/);
  });

  it("keeps legacy product matchers quarantined away from live callers", () => {
    assert.match(productRecommendations, /return recommendProductStackFullBeam\(input\)/);

    for (const root of ["../app/", "../components/", "../lib/", "../workers/"] as const) {
      for (const file of trackedSourceFiles(new URL(root, import.meta.url))) {
        const path = file.pathname;

        if (path.endsWith("/lib/product-recommendations.ts")) {
          continue;
        }

        const source = readFileSync(file, "utf8");
        assert.equal(
          source.includes("recommendProductStackV2"),
          false,
          `${path} imports or calls the legacy product matcher`
        );
      }
    }
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

  it("keeps product admin editing on a detail page instead of the old modal", () => {
    assert.match(adminProductDetailRoute, /AdminDashboard/);
    assert.match(adminProductDetailRoute, /productDetailId=\{productId\}/);
    assert.match(adminProductView, /\/admin\/products\/\$\{row\.id\}/);
    assert.match(adminProductView, /\bfunction normalizeProductDetailRow\b/);
    assert.match(adminProductView, /validationCacheStaleReasons: safeArray/);
    assert.doesNotMatch(adminProductView, /sourceProductFdaNumbersFromEvidence/);
    assert.doesNotMatch(adminProductView, /sourceProductIdentifiersFromEvidence/);
    assert.match(adminProductView, /manufacturerOptions\.map/);
    assert.match(adminProductView, /selectedMetricId=\{metricFilter\}/);
    assert.doesNotMatch(adminProductView, /api\/admin\/products\/hygeia\/export/);
    assert.match(adminProductUi, /\bfunction ProductCountryManager\b/);
    assert.match(adminProductUi, /\bconst safeCountryCodes\b/);
    assert.match(adminProductUi, /\bconst identifiers = Array\.isArray\(draft\.identifiers\)/);
    assert.doesNotMatch(adminProductUi, /placeholder="8851234567890"/);
    assert.match(adminProductUi, /<table className=/);
    assert.doesNotMatch(adminProductView, /\bfunction ProductRegulatoryApprovalsEditor\b/);
    assert.doesNotMatch(adminProductView, /\bregulatoryScopeOptions\b/);
    assert.doesNotMatch(adminProductView, /\bregulatoryStatusOptions\b/);
    assert.doesNotMatch(adminProductView, /\bregulatoryRegionOptions\b/);
    assert.match(adminProductView, /\bfunction updateCountryRegulatoryApproval\b/);
    assert.match(adminProductView, /regulatoryApprovals: regulatoryApprovalsForSave\(row\)/);
    assert.match(adminProductView, /product_regulatory_approval_associated/);
    assert.match(adminProductUpdateRoute, /changeNote: body\.changeNote === undefined/);
    assert.match(adminProductUi, /onRegulatoryApprovalChange/);
    assert.match(adminProductUi, /regulatoryAgencyOptionsForCountry/);
    assert.match(adminProductUi, /approvalDisplayLabel/);
    assert.match(adminProductUi, /pricingLabels\?\.notAvailable/);
    assert.match(adminProductUi, /role="dialog"/);
    assert.match(adminProductUi, /saveApprovalDialog/);
    assert.doesNotMatch(adminProductView, /draft\.fdaApprovalNumber/);
    assert.doesNotMatch(adminProductView, /\bProductOffersEditor\b/);
    assert.doesNotMatch(adminProductView, /\bAdminModal\b/);
  });

  it("keeps product offer runtime objects removed", () => {
    for (const route of [
      "../app/api/admin/products/[id]/offers/route.ts",
      "../app/api/admin/products/[id]/offers/[offerId]/route.ts",
      "../app/api/admin/products/[id]/affiliate-links/route.ts",
      "../app/api/admin/products/[id]/affiliate-links/[linkId]/route.ts"
    ]) {
      assert.equal(existsSync(new URL(route, import.meta.url)), false, `${route} must stay removed`);
    }

    for (const [name, root] of [
      ["app", "../app/"],
      ["components", "../components/"],
      ["lib", "../lib/"],
      ["workers", "../workers/"]
    ] as const) {
      for (const file of trackedSourceFiles(new URL(root, import.meta.url))) {
        const path = file.pathname;
        const source = readFileSync(file, "utf8");

        for (const term of [
          "product_offers",
          "product_affiliate_links",
          "offer_id",
          "affiliate_status",
          "affiliate_checked_at",
          "ProductOffersEditor",
          "AdminProductOffer",
          "activeAffiliate",
          "activeOffer",
          "affiliateStatus"
        ]) {
          assert.equal(source.includes(term), false, `${name}:${path} contains ${term}`);
        }
      }
    }

    for (const term of [
      "create table public.product_offers",
      "create table public.product_affiliate_links",
      "offer_id",
      "affiliate_status",
      "affiliate_checked_at"
    ]) {
      assert.equal(dbSchema.includes(term), false, `db-schema.sql contains ${term}`);
    }

    assert.ok(
      packageJson.scripts?.["product-offers:schema:remove"],
      "product offer schema cleanup must be repeatable"
    );
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
