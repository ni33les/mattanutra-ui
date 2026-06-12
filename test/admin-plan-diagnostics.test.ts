import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const route = readFileSync(
  new URL("../app/api/admin/plan-diagnostics/route.ts", import.meta.url),
  "utf8"
);

describe("admin plan diagnostics", () => {
  it("exposes a separate no-store diagnostics endpoint for one plan journey", () => {
    assert.match(route, /adminDashboardOrClawRequestAllowed/);
    assert.match(route, /A valid planId is required/);
    assert.match(route, /Cache-Control": "no-store"/);
    assert.match(route, /nutritionJourneyStatus/);
  });

  it("includes counts and statuses across customer, worker, payment, communication, and order state", () => {
    assert.match(route, /healthScoreCounts/);
    assert.match(route, /visibleSupplementRecommendationCount/);
    assert.match(route, /hiddenSafetyIngredientCount/);
    assert.match(route, /from public\.tasks/);
    assert.match(route, /from public\.payments/);
    assert.match(route, /from public\.retail_checkout_payments/);
    assert.match(route, /from public\.plan_communication_identities/);
    assert.match(route, /hasActiveLineChannel/);
    assert.match(route, /staleSnapshotFlags/);
    assert.match(route, /productRunOlderThanFormulation/);
  });
});
