import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  allowedAdminViews,
  isAdminDashboardView,
  permissionsForRole
} from "../lib/admin-rbac.ts";

const retiredModules = [
  "components/admin/recommendation-insights-view.tsx",
  "components/admin/coverage-improvement-insights-view.tsx",
  "lib/admin-recommendation-insights.ts",
  "lib/admin-coverage-improvement-insights.ts"
];

test("retired admin insight implementations leave the maintained source tree", () => {
  assert.deepEqual(retiredModules.filter(existsSync), []);
});

test("live catalogue types do not depend on retired insight implementations", () => {
  for (const path of [
    "lib/admin-product-mappers.ts",
    "lib/admin-product-types.ts",
    "lib/admin-supplements.ts"
  ]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /admin-recommendation-insights/);
  }
});

test("current coverage views retain platform authorization and stay unavailable to retailers", () => {
  const platformViews = allowedAdminViews({
    permissions: permissionsForRole("platform_admin"),
    role: "platform_admin"
  }, "platform");
  const retailerViews = allowedAdminViews({
    permissions: permissionsForRole("retail_admin"),
    role: "retail_admin"
  }, "tenant");

  for (const view of ["product-coverage", "product-optimisation", "plan-coverage-simulator"] as const) {
    assert.equal(isAdminDashboardView(view), true, view);
    assert.equal(platformViews.includes(view), true, view);
    assert.equal(retailerViews.includes(view), false, view);
  }
  for (const view of ["product-insights", "supplement-insights", "food-insights", "coverage-improvement-insights"]) {
    assert.equal(isAdminDashboardView(view), false, view);
    assert.equal(platformViews.some((candidate) => candidate === view), false, view);
  }
});
