import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LIVE_ORIGIN,
  LIVE_PUBLIC,
  LIVE_QA,
  liveCall,
  magCurrentRequest,
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
  if (items.some((item) => item.action === "acknowledge")) {
    return "acknowledge";
  }
  return "clear";
}

function scheduleBucket(plan: Record<string, unknown>, horizon: number) {
  return asRecord(asRecord(plan.orderSchedule)[String(horizon)]);
}

describe("live v1.4 DUR/CON/CAN/IDENT regression", () => {
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
      request: magCurrentRequest(300)
    });
    const plan = created.structured;
    const row = magCoverage(plan);
    const questions = Array.isArray(plan.questions) ? plan.questions.map(asRecord) : [];
    const duration = questions.filter((item) =>
      String(item.questionId).startsWith("q_inventory_duration_")
    );
    assert.equal(plan.ok, true);
    assert.equal(plan.status, "needs_input");
    assert.equal(Number(row?.currentAmount), 300);
    assert.equal(plan.cash30DayMinor ?? null, null);
    assert.equal(plan.cash90DayMinor ?? null, null);
    assert.notEqual(plan.cash30DayMinor, 0);
    assert.notEqual(plan.cash90DayMinor, 0);
    assert.equal(plan.cashComplete, false);
    assert.equal(scheduleBucket(plan, 30).available, false);
    assert.equal(scheduleBucket(plan, 30).reasonCode, "current_inventory_duration_unknown");
    assert.equal(scheduleBucket(plan, 90).available, false);
    assert.equal(duration.length, 1);
    assert.equal(plan.nextReplenishmentDay ?? null, null);
  });

  it("LIVE-CON-01 unknown acquisition keeps full_horizon and null consumption", async () => {
    const created = await liveCall(LIVE_PUBLIC, "plan", {
      idempotencyKey: stamp("con01"),
      request: magCurrentRequest(300, 30)
    });
    const plan = created.structured;
    const economics = economicsOf(plan);
    assert.equal(plan.ok, true);
    assert.equal(String(economics.consumptionScope ?? plan.consumptionScope), "full_horizon");
    assert.equal(economics.consumption90DayMinor ?? null, null);
    assert.equal(economics.consumption30DayMinor ?? null, null);
    assert.notEqual(economics.consumption90DayMinor, 0);
    assert.equal(economics.consumptionComplete ?? plan.consumptionComplete, false);
    assert.notEqual(String(economics.consumptionScope), "newly_purchased");
    assert.equal(typeof plan.cash30DayMinor === "number" || plan.cashComplete === true, true);
  });

  it("LIVE-CAN-01 300 vs 349 hashes differ and 349/350/351 stay distinct", async () => {
    const lowKey = stamp("can-low");
    const highKey = stamp("can-high");
    const low = await liveCall(LIVE_PUBLIC, "plan", {
      idempotencyKey: lowKey,
      request: magCurrentRequest(300, 90)
    });
    const high = await liveCall(LIVE_PUBLIC, "plan", {
      idempotencyKey: highKey,
      request: magCurrentRequest(349, 90)
    });
    const lowReplay = await liveCall(LIVE_PUBLIC, "plan", {
      idempotencyKey: lowKey,
      request: magCurrentRequest(300, 90)
    });
    const a349 = high;
    const a350 = await liveCall(LIVE_PUBLIC, "plan", {
      idempotencyKey: stamp("can-350"),
      request: magCurrentRequest(350, 90)
    });
    const a351 = await liveCall(LIVE_PUBLIC, "plan", {
      idempotencyKey: stamp("can-351"),
      request: magCurrentRequest(351, 90)
    });
    const hash = (plan: Record<string, unknown>) => String(asRecord(plan.canonical).hash ?? "");
    assert.equal(Number(magCoverage(low.structured)?.currentAmount), 300);
    assert.equal(Number(magCoverage(high.structured)?.currentAmount), 349);
    assert.notEqual(hash(low.structured), hash(high.structured));
    assert.equal(hash(low.structured), hash(lowReplay.structured));
    assert.equal(magSafetyAction(a349.structured), "clear");
    assert.equal(magSafetyAction(a350.structured), "acknowledge");
    assert.equal(magSafetyAction(a351.structured), "block");
    assert.equal(
      new Set([hash(a349.structured), hash(a350.structured), hash(a351.structured)]).size,
      3
    );
  });
});
