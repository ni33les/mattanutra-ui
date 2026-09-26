import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/** Maintained by subsystem, so new suites in a supported family join canonical coverage. */
export const MATCHER_TEST_FAMILIES = Object.freeze({
  core: /^test\/(?:matcher(?:\/|-)|practical-matching\/)/,
  connector: /^test\/(?:agentic(?:\/|-)|mcp-|simple-plan\/|published-client-)/,
  catalogue: /^test\/(?:catalogue-|dose-conversion|nutrient-identity|magnesium-ul-source|pack-facts|product-(?:advisory-cache-refresh|catalogue|countries|fact-canonical|form|health-advisory|validation)|retail-(?:listing-availability|sellability-pricing)|sale-states-catalogue)/,
  web: /^test\/(?:web-advisory|web-journey-fix\/|web-reveal-tidy|product-(?:matcher|matching|recommendation|recommendations|coverage)|recommendation-selection|assessment-(?:revisions|store-product-coverage)|formulation-|consistency-r|plan-(?:guidance-adjustments|reveal)|reveal-final|nutrition-(?:journey|report-reveal))/, 
  commerce: /^test\/(?:commerce-transactions|retail-(?:checkout-|cart-availability|order-workflow|product-checkout|plan-insert)|web-payment-|payment-confirmation-return)/,
  additionalConsumers: /^test\/(?:admin-product-(?:facts|reference-retirement)|phase3-t01-t08-static|plan-keep-warm-static|product-card-layout|retail-stock-fx|v9-product-master|healthscore-performance\/availability-catalogue|pharmacy-followup\/market\.integration|reveal-coverage-corrections|web-matching-correctness\/(?:presentation|regressions))\.test\.ts$/,
  refinementInfrastructure: /^test\/(?:ax-refinement|service-efficiency)\//,
  infrastructure: /^test\/(?:code-quality-deduplication|full-test-suite-discovery|mcp-test-discovery|latency-acceptance-policy|dev-advisory-validation|dev-validation-(?:proof|fingerprints))/
});

/** These frozen, in-memory fixtures retain business equality without replaying every suite. */
export const SEMANTIC_REPLAY_FIXTURES = Object.freeze([
  Object.freeze({ file: "test/mcp-evidence-images/contracts.test.ts", artifact: "real-plan-journey.json", expectedCases: 7,
    reason: "Frozen real-product create, refine and read preserve images, quantities, prices and delivery equality.",
    inputs: ["test/fixtures/mcp-evidence-images/manifest.json", "test/fixtures/mcp-evidence-images/dev-20260911.json.gz"] }),
  Object.freeze({ file: "test/simple-plan/documented.test.ts", artifact: "documented-inventory-run.json", expectedCases: 4,
    reason: "Documented clients use independent memory stores and frozen catalogues across three locales and checkout recovery.",
    inputs: ["lib/agentic/catalogue/fixtures.ts", "test/helpers/gold-catalogue.ts"] })
]);

/** Reviewed pure functions: no shared database, HTTP executor or filesystem writes. */
export const INDEPENDENT_NODE_TESTS = Object.freeze([
  "test/bounded-lru.test.ts", "test/sha256.test.ts", "test/dose-conversion.test.ts",
  "test/food-nutrients.test.ts", "test/food-tags.test.ts", "test/plan-feedback.test.ts",
  "test/vo2-estimate.test.ts", "test/product-form.test.ts", "test/nutrient-identity.test.ts",
  "test/task-sequence.test.ts", "test/retail-order-workflow-rules.test.ts"
]);

export function isNodeTestFile(file) {
  return /\.test\.(?:[cm]?[jt]s|[jt]sx)$/.test(file);
}

/** Shared matching and MCP entry points affect the maintained consumer inventory.
 * Resolve these source paths before the development runner's generic categories. */
export function isSharedMatcherSource(file) {
  return /^lib\/(?:matcher\/|agentic\/|product-match|product-recommendation)/.test(file) ||
    /^workers\/product-matcher(?:[-./])/.test(file) ||
    /^app\/api\/(?:mcp|agentic)\//.test(file);
}

export function recursiveTestFiles(root, directory = "test", suffix = null) {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) return [];
  const collect = folder => readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? collect(path) : entry.isFile() && (suffix === null ? isNodeTestFile(entry.name) : entry.name.endsWith(suffix))
      ? [relative(root, path).replaceAll("\\", "/")] : [];
  });
  return collect(absolute).sort();
}

export function matcherTestInventory(nodeFiles) {
  const groups = Object.fromEntries(Object.entries(MATCHER_TEST_FAMILIES).map(([name, pattern]) => [name, nodeFiles.filter(file => pattern.test(file))]));
  return { groups, files: [...new Set(Object.values(groups).flat())].sort() };
}

/** A new direct consumer outside the maintained families must be explicitly classified. */
export function unclassifiedMatcherConsumers(root, nodeFiles, inventory) {
  const included = new Set(inventory);
  const importsMatcher = /(?:from\s*|import\s*\(|readFile(?:Sync)?\s*\()["'`][^"'`]*(?:lib\/(?:matcher\/|agentic\/|product-match|product-recommendation)|workers\/handlers\/(?:product|formulation)|app\/api\/(?:agentic|mcp|retail))/;
  return nodeFiles.filter(file => !included.has(file) && importsMatcher.test(readFileSync(join(root, file), "utf8")));
}
