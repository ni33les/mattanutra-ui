import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIVE_PUBLIC, liveCall, livePost, stamp } from "./helpers/live-mcp.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const TH_ADDRESS = {
  addressLine1: "88 Silom Road",
  city: "Bangkok",
  country: "TH",
  customerEmail: "live-com@example.test",
  customerName: "Live Com",
  phone: "+66812345678",
  postalCode: "10500",
  province: "Bangkok"
};

describe("live DEV commercial end to end", () => {
  it("LIVE-COM-01 plan execute mock-pay order support on public DEV", async () => {
    const info = await liveCall(LIVE_PUBLIC, "info", { locale: "en" });
    assert.equal(info.structured.ok, true);
    assert.equal("orderHandle" in info.structured, false);

    const plan = await liveCall(LIVE_PUBLIC, "plan", {
      idempotencyKey: stamp("com-plan"),
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "lowest_cost",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
      }
    });
    assert.equal(plan.structured.ok, true);
    assert.equal(plan.structured.status, "ready");
    assert.equal("orderHandle" in plan.structured, false);
    const basket = Array.isArray(plan.structured.basket) ? plan.structured.basket : [];
    assert.ok(basket.length >= 1);
    assert.equal(
      basket.some((item) => asRecord(item).source === "fixture"),
      false
    );

    const executed = await liveCall(LIVE_PUBLIC, "execute", {
      expectedRevision: plan.structured.revision,
      idempotencyKey: stamp("com-exec"),
      planHandle: plan.structured.planHandle
    });
    assert.equal(executed.structured.ok, true);
    assert.equal(typeof executed.structured.orderHandle, "string");
    assert.equal(typeof executed.structured.checkoutUrl, "string");
    const checkoutUrl = String(executed.structured.checkoutUrl);
    const checkoutAccess = new URL(checkoutUrl).searchParams.get("order");
    assert.ok(checkoutAccess && checkoutAccess.length > 8);

    const payUrl = `${new URL(LIVE_PUBLIC).origin}/api/mcp/checkout/${encodeURIComponent(checkoutAccess)}/pay`;
    const paid = await livePost(payUrl, {
      address: TH_ADDRESS,
      agentAuthorized: true,
      scenario: "success"
    });
    assert.equal(paid.status, 200, JSON.stringify(paid.structured));
    assert.equal(paid.structured.ok, true);
    assert.equal(paid.structured.paymentStatus, "paid");

    const order = await liveCall(LIVE_PUBLIC, "order", {
      orderHandle: executed.structured.orderHandle
    });
    assert.equal(order.structured.ok, true);
    assert.equal(order.structured.paymentStatus, "paid");
    const blob = JSON.stringify(order.structured).toLowerCase();
    assert.equal(blob.includes("checkout ready"), false);

    const support = await liveCall(LIVE_PUBLIC, "support", {
      idempotencyKey: stamp("com-support"),
      message: "Where is this order?",
      orderHandle: executed.structured.orderHandle
    });
    assert.equal(
      support.structured.ok,
      true,
      JSON.stringify({
        ok: support.structured.ok,
        reasonCode: support.structured.reasonCode,
        message: support.structured.message
      })
    );
    assert.equal(typeof support.structured.supportHandle, "string");
    assert.match(
      String(support.structured.messageId),
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });
});

