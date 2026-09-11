import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LIVE_ORIGIN,
  LIVE_PUBLIC,
  LIVE_QA,
  liveCompletedCall as liveCall,
  magCurrentRequest,
  observeIsolatedStoredPlan,
  stamp
} from "./helpers/live-mcp.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function economicsOf(plan: Record<string, unknown>) {
  const options = Array.isArray(plan.options) ? plan.options.map(asRecord) : [];
  const recommended = options.find((item) => item.recommended) ?? options[0] ?? {};
  return asRecord(recommended.economics ?? plan);
}

function magCoverage(plan: Record<string, unknown>) {
  const rows = Array.isArray(plan.coverage) ? plan.coverage.map(asRecord) : [];
  return rows.find((row) => /magnesium/i.test(String(row.name))) ?? null;
}

function magSafetyAction(plan: Record<string, unknown>) {
  const items = (Array.isArray(plan.safetyGuidance) ? plan.safetyGuidance : []).map(asRecord);
  if (plan.status === "blocked" || items.some((item) => item.action === "block")) {
    return "block";
  }
  if (items.some((item) => item.code === "dose_review_required")) {
    return "review";
  }
  return "clear";
}

function scheduleBucket(plan: Record<string, unknown>, horizon: number) {
  return asRecord(asRecord(plan.orderSchedule)[String(horizon)]);
}

describe("current HTTP protocol and retained DUR/CON/CAN/IDENT financial regression", () => {
  it("LIVE-IDENT public origin and QA share one build and schema checksum", async () => {
    const pub = await liveCall(LIVE_PUBLIC, "info", { locale: "en" });
    const origin = await liveCall(LIVE_ORIGIN, "info", { locale: "en" });
    const qa = await liveCall(LIVE_QA, "preflight", {});
    assert.equal(pub.status, 200);
    assert.equal(origin.status, 200);
    assert.equal(pub.structured.ok, true);
    assert.match(String(pub.structured.buildId), /^[0-9a-f]{40}$/);
    assert.equal(pub.structured.buildId, origin.structured.buildId);
    assert.equal(pub.headers["x-agentic-build-id"], pub.structured.buildId);
    assert.match(String(pub.structured.schemaChecksum), /^[0-9a-f]{64}$/);
    assert.equal(pub.structured.schemaChecksum, origin.structured.schemaChecksum);
    const manifest = asRecord(qa.structured.manifest);
    assert.equal(pub.structured.schemaChecksum, manifest.schemaChecksum);
  });

  it("LIVE-DUR-01 missing daysRemaining does not invent horizon coverage or zero cash", async () => {
    const created = await liveCall(LIVE_PUBLIC, "plan", {
      idempotencyKey: stamp("dur01"),
      ...magCurrentRequest(300)
    });
    assert.equal(created.structured.ok, true, JSON.stringify(created.structured));
    const plan = await observeIsolatedStoredPlan(created.structured.planHandle, created.structured.revision);
    const row = magCoverage(plan);
    const questions = Array.isArray(plan.questions) ? plan.questions.map(asRecord) : [];
    const duration = questions.filter((item) =>
      String(item.questionId).startsWith("q_inventory_duration_")
    );
    assert.equal(plan.status, "no_purchase");
    assert.equal(Number(row?.currentAmount), 300);
    assert.equal(plan.cash30DayMinor ?? null, null);
    assert.equal(plan.cash90DayMinor ?? null, null);
    assert.notEqual(plan.cash30DayMinor, 0);
    assert.notEqual(plan.cash90DayMinor, 0);
    assert.equal(plan.cashComplete, false);
    assert.equal(scheduleBucket(plan, 30).available, false);
    assert.equal(scheduleBucket(plan, 30).reasonCode, "current_inventory_duration_unknown");
    assert.equal(scheduleBucket(plan, 90).available, false);
    assert.equal(duration.length, 0);
    assert.equal(plan.nextReplenishmentDay ?? null, null);
  });

  it("LIVE-CON-01 unknown acquisition keeps full_horizon and null consumption", async () => {
    const created = await liveCall(LIVE_PUBLIC, "plan", {
      idempotencyKey: stamp("con01"),
      ...magCurrentRequest(300, 30)
    });
    assert.equal(created.structured.ok, true, JSON.stringify(created.structured));
    const plan = await observeIsolatedStoredPlan(created.structured.planHandle, created.structured.revision);
    const economics = economicsOf(plan);
    assert.equal(String(economics.consumptionScope ?? plan.consumptionScope), "full_horizon");
    assert.equal(economics.consumption90DayMinor ?? null, null);
    assert.equal(economics.consumption30DayMinor ?? null, null);
    assert.notEqual(economics.consumption90DayMinor, 0);
    assert.equal(economics.consumptionComplete ?? plan.consumptionComplete, false);
    assert.notEqual(String(economics.consumptionScope), "newly_purchased");
    assert.equal(plan.cashComplete, false);
    assert.equal(plan.cash90DayMinor, null);
  });

  it("LIVE-CAN-01 300 vs 349 hashes differ and 349/350/351 stay distinct", async () => {
    const lowKey = stamp("can-low");
    const highKey = stamp("can-high");
    const low = await liveCall(LIVE_PUBLIC, "plan", {
      idempotencyKey: lowKey,
      ...magCurrentRequest(300, 90)
    });
    const high = await liveCall(LIVE_PUBLIC, "plan", {
      idempotencyKey: highKey,
      ...magCurrentRequest(349, 90)
    });
    const lowReplay = await liveCall(LIVE_PUBLIC, "plan", {
      idempotencyKey: lowKey,
      ...magCurrentRequest(300, 90)
    });
    const a349 = high;
    const a350 = await liveCall(LIVE_PUBLIC, "plan", {
      idempotencyKey: stamp("can-350"),
      ...magCurrentRequest(350, 90)
    });
    const a351 = await liveCall(LIVE_PUBLIC, "plan", {
      idempotencyKey: stamp("can-351"),
      ...magCurrentRequest(351, 90)
    });
    const stored = new Map<Record<string, unknown>,Record<string, unknown>>();
    for (const response of [low, high, lowReplay, a350, a351]) {
      assert.equal(response.structured.ok, true, JSON.stringify(response.structured));
      stored.set(response.structured, await observeIsolatedStoredPlan(response.structured.planHandle, response.structured.revision));
    }
    const hash = (plan: Record<string, unknown>) => String(asRecord(plan.canonical).hash ?? "");
    assert.equal(Number(magCoverage(stored.get(low.structured)!)?.currentAmount), 300);
    assert.equal(Number(magCoverage(stored.get(high.structured)!)?.currentAmount), 349);
    assert.notEqual(hash(stored.get(low.structured)!), hash(stored.get(high.structured)!));
    assert.equal(hash(stored.get(low.structured)!), hash(stored.get(lowReplay.structured)!));
    assert.equal(magSafetyAction(stored.get(a349.structured)!), "clear");
    assert.equal(magSafetyAction(stored.get(a350.structured)!), "review");
    assert.equal(magSafetyAction(stored.get(a351.structured)!), "review");
    assert.notEqual(stored.get(a351.structured)!.status, "blocked");
    assert.equal(
      new Set([hash(stored.get(a349.structured)!), hash(stored.get(a350.structured)!), hash(stored.get(a351.structured)!)]).size,
      3
    );
  });
});
