import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { adminViewPermission } from "../lib/admin-rbac.ts";

describe("product coverage improvement insights", () => {
  it("retires the old coverage improvement dashboard view", () => {
    const dashboardContent = readFileSync(
      "components/admin/dashboard-content.tsx",
      "utf8"
    );
    const dashboard = readFileSync("components/admin-dashboard.tsx", "utf8");
    const page = readFileSync("app/[locale]/admin/dashboard/page.tsx", "utf8");
    const zhContent = readFileSync(
      "components/admin/dashboard-content.zh-CN.json",
      "utf8"
    );

    assert.doesNotMatch(dashboardContent, /"coverage-improvement-insights"/);
    assert.doesNotMatch(dashboardContent, /Coverage Improvement/);
    assert.doesNotMatch(zhContent, /覆盖改进/);
    assert.doesNotMatch(dashboard, /AdminCoverageImprovementInsightsView/);
    assert.doesNotMatch(page, /getAdminCoverageImprovementInsightsData\(range, locale\)/);
    assert.match(dashboardContent, /"product-coverage"/);
    assert.match(dashboardContent, /"product-optimisation"/);
    assert.match(dashboardContent, /"plan-coverage-simulator"/);
    assert.equal(
      adminViewPermission("product-coverage"),
      "marketing.read"
    );
    assert.equal(
      adminViewPermission("product-optimisation"),
      "marketing.read"
    );
    assert.equal(
      adminViewPermission("plan-coverage-simulator"),
      "marketing.read"
    );
  });
});
