import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/** Maintained by subsystem, so new suites in a supported family join every replay. */
export const MATCHER_TEST_FAMILIES = Object.freeze({
  core: /^test\/matcher(?:\/|-)/,
  connector: /^test\/(?:agentic(?:\/|-)|mcp-|published-client-)/,
  catalogue: /^test\/(?:catalogue-(?:alignment|admin)|dose-conversion|nutrient-identity|magnesium-ul-source|pack-facts|product-(?:catalogue|countries|fact-canonical|form|validation)|retail-(?:listing-availability|sellability-pricing)|sale-states-catalogue)/,
  web: /^test\/(?:web-advisory|product-(?:matcher|matching|recommendation|recommendations|coverage)|recommendation-selection|assessment-(?:revisions|store-product-coverage)|formulation-|consistency-r|plan-(?:guidance-adjustments|reveal)|reveal-final|nutrition-(?:journey|report-reveal))/, 
  commerce: /^test\/(?:commerce-transactions|retail-(?:checkout-session|cart-availability|order-workflow|product-checkout|plan-insert)|web-payment-|payment-confirmation-return)/,
  additionalConsumers: /^test\/(?:admin-product-facts|phase3-t01-t08-static|plan-keep-warm-static|product-card-layout|retail-stock-fx|v9-product-master)\.test\.ts$/,
  infrastructure: /^test\/(?:full-test-suite-discovery|mcp-test-discovery|latency-acceptance-policy|dev-advisory-validation|dev-validation-proof)/
});

export function recursiveTestFiles(root, directory = "test", suffix = ".test.ts") {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) return [];
  const collect = folder => readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? collect(path) : entry.isFile() && entry.name.endsWith(suffix)
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
