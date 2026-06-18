import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeAdminDashboardRange } from "@/lib/admin-dashboard-data";

describe("admin dashboard time range defaults", () => {
  it("selects month when no explicit time range is provided", () => {
    assert.equal(normalizeAdminDashboardRange(undefined), "month");
    assert.equal(normalizeAdminDashboardRange(""), "month");
    assert.equal(normalizeAdminDashboardRange("not-a-range"), "month");
  });

  it("keeps explicit time ranges unchanged", () => {
    assert.equal(normalizeAdminDashboardRange("week"), "week");
    assert.equal(normalizeAdminDashboardRange("day"), "day");
    assert.equal(normalizeAdminDashboardRange("year"), "year");
  });
});
