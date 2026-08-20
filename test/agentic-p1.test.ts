import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { FIXTURE_SUPPLEMENTS } from "../lib/agentic/catalogue/fixtures.ts";
import { parseCheckoutAddress } from "../lib/agentic/checkout-address.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { handleQaJsonRpc } from "../lib/agentic/mcp/qa-dispatcher.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests,
  type AgenticRuntime
} from "../lib/agentic/runtime.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import { simulatePayment } from "../lib/agentic/qa/simulate.ts";
import {
  addMinor,
  asMinor,
  formatMinor,
  payableSnapshot
} from "../lib/agentic/money.ts";

function supplementId(name: string) {
  const found = FIXTURE_SUPPLEMENTS.find((item) => item.name === name);
  assert.ok(found, name);
  return found.supplementId;
}

function runtimeFor(): AgenticRuntime {
  return createAgenticRuntime({
    config: loadAgenticConfig(),
    scope: {
      environment: "dev",
      principalScope: "tester",
      tenantScope: "mattanutra"
    },
    store: createMemoryStore()
  });
}

async function call(runtime: AgenticRuntime, name: string, args: unknown) {
  const response = await handleJsonRpc(runtime, {
    id: 1,
    method: "tools/call",
    params: { arguments: args, name }
  });
  assert.ok(response?.result);
  return response.result.structuredContent as Record<string, unknown>;
}

afterEach(() => {
  setAgenticRuntimeForTests(null);
});

describe("agentic P1 pack fixes", () => {
  it("labels converted Vitamin D3 coverage in IU not mcg", async () => {
    const runtime = runtimeFor();
    const result = await call(runtime, "plan", {
      idempotencyKey: "p1-d3-units-0000001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" },
        requirements: {},
        targets: [
          { amount: 2000, name: "Vitamin D3", supplementId: supplementId("Vitamin D3"), unit: "IU" }
        ]
      }
    });

    const row = (result.coverage as Array<Record<string, unknown>>)[0];
    assert.equal(row.unit, "IU");
    assert.equal(row.requestedAmount, 2000);
    assert.equal(row.deliveredAmount, 2000);
    assert.equal(JSON.stringify(result).includes("retailerSku"), false);
    assert.equal(JSON.stringify(result).includes("sellerId"), false);
    assert.equal(JSON.stringify(result).includes("stockStatus"), false);
  });

  it("does not mark a 50% retained zinc target ready", async () => {
    const runtime = runtimeFor();
    const result = await call(runtime, "plan", {
      idempotencyKey: "p1-retain-zinc-00001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" },
        requirements: {
          retainSupplementIds: [supplementId("Zinc")]
        },
        targets: [
          { amount: 50, name: "Zinc", supplementId: supplementId("Zinc"), unit: "mg" }
        ]
      }
    });

    assert.equal(result.ok, true);
    assert.notEqual(result.status, "ready");
    const row = (result.coverage as Array<Record<string, unknown>>)[0];
    assert.equal(row.unit, "mg");
    assert.equal(row.requestedAmount, 50);
    assert.equal(row.deliveredAmount, 25);
    assert.ok((row.coveragePercent as number) < 90);
  });

  it("invalidates safety acknowledgement after exposure changes", async () => {
    const runtime = runtimeFor();
    const first = await call(runtime, "plan", {
      idempotencyKey: "p1-ack-first-0000001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" },
        requirements: {},
        medicationCodes: ["apixaban"],
        targets: [
          { amount: 1000, name: "Omega-3", supplementId: supplementId("Omega-3"), unit: "mg" }
        ]
      }
    });

    assert.equal(first.status, "needs_input");
    const guidanceIds = (first.safetyGuidance as Array<{ guidanceId: string }>).map(
      (item) => item.guidanceId
    );
    assert.ok(guidanceIds.length > 0);

    const acked = await call(runtime, "plan", {
      expectedRevision: first.revision,
      idempotencyKey: "p1-ack-second-000001",
      planHandle: first.planHandle,
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" },
        requirements: {},
        medicationCodes: ["apixaban"],
        safetyAcknowledgement: {
          confirmed: true,
          guidanceIds,
          revision: first.revision
        },
        targets: [
          { amount: 1000, name: "Omega-3", supplementId: supplementId("Omega-3"), unit: "mg" }
        ]
      }
    });
    assert.equal(acked.status, "ready");

    const changed = await call(runtime, "plan", {
      expectedRevision: acked.revision,
      idempotencyKey: "p1-ack-third-0000001",
      planHandle: first.planHandle,
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" },
        requirements: {},
        medicationCodes: ["apixaban"],
        safetyAcknowledgement: {
          confirmed: true,
          guidanceIds,
          revision: acked.revision
        },
        targets: [
          { amount: 2000, name: "Omega-3", supplementId: supplementId("Omega-3"), unit: "mg" }
        ]
      }
    });
    assert.equal(changed.status, "needs_input");
  });

  it("rejects feedback for a stale plan revision", async () => {
    const runtime = runtimeFor();
    const first = await call(runtime, "plan", {
      idempotencyKey: "p1-fb-first-00000001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" },
        requirements: {},
        targets: [
          { amount: 2000, name: "Vitamin D3", supplementId: supplementId("Vitamin D3"), unit: "IU" }
        ]
      }
    });
    const second = await call(runtime, "plan", {
      expectedRevision: first.revision,
      idempotencyKey: "p1-fb-second-0000001",
      planHandle: first.planHandle,
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "lowest_cost",
        profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" },
        requirements: {},
        targets: [
          { amount: 2000, name: "Vitamin D3", supplementId: supplementId("Vitamin D3"), unit: "IU" }
        ]
      }
    });
    assert.ok((second.revision as number) > (first.revision as number));

    const stale = await call(runtime, "feedback", {
      consentConfirmed: true,
      expectedRevision: first.revision,
      idempotencyKey: "p1-fb-stale-00000001",
      planHandle: first.planHandle,
      summary: "Great coverage."
    });
    assert.equal(stale.ok, false);
    assert.equal((stale.error as { reasonCode: string }).reasonCode, "not_found");

    const current = await call(runtime, "feedback", {
      consentConfirmed: true,
      expectedRevision: second.revision,
      idempotencyKey: "p1-fb-current-0000001",
      planHandle: first.planHandle,
      summary: "Great coverage."
    });
    assert.deepEqual(current, { accepted: true, ok: true });
  });

  it("requires a Thailand address for checkout parsing", () => {
    const missing = parseCheckoutAddress({ country: "TH" }, "TH");
    assert.ok("error" in missing);

    const mismatch = parseCheckoutAddress(
      {
        addressLine1: "12 Sukhumvit",
        city: "Watthana",
        country: "SG",
        customerEmail: "a@b.com",
        customerName: "Ada",
        phone: "0812345678",
        postalCode: "10110",
        province: "Bangkok"
      },
      "TH"
    );
    assert.ok("error" in mismatch);

    const ok = parseCheckoutAddress(
      {
        addressLine1: "12 Sukhumvit",
        city: "Watthana",
        country: "TH",
        customerEmail: "ada@example.com",
        customerName: "Ada Lovelace",
        phone: "0812345678",
        postalCode: "10110",
        province: "Bangkok"
      },
      "TH"
    );
    assert.ok("address" in ok);
  });

  it("keeps QA tools off the public connector and isolation proof passing", async () => {
    const runtime = runtimeFor();
    const listed = await handleJsonRpc(runtime, { id: 1, method: "tools/list" });
    const names = (
      listed?.result?.tools as Array<{ name: string }>
    ).map((item) => item.name);
    assert.deepEqual(names, ["info", "plan", "execute", "order", "support", "feedback"]);

    const proof = await handleQaJsonRpc(runtime, {
      id: 2,
      method: "tools/call",
      params: { arguments: {}, name: "isolationProof" }
    });
    const body = proof?.result?.structuredContent as { passed: boolean; checks: unknown[] };
    assert.equal(body.passed, true);
    assert.ok(body.checks.length > 0);

    const prefixedInfo = await handleJsonRpc(runtime, {
      id: 4,
      method: "tools/call",
      params: { arguments: {}, name: "mattanutra_dev.info" }
    });
    assert.equal(
      (prefixedInfo?.result?.structuredContent as { ok?: boolean })?.ok,
      true
    );
    const prefixedQa = await handleJsonRpc(runtime, {
      id: 5,
      method: "tools/call",
      params: { arguments: {}, name: "mattanutra_dev.packProof" }
    });
    assert.equal(prefixedQa?.error?.code, -32601);

    const continuity = await handleQaJsonRpc(runtime, {
      id: 3,
      method: "tools/call",
      params: { arguments: {}, name: "checkoutContinuityProof" }
    });
    const cont = continuity?.result?.structuredContent as {
      passed: boolean;
      evidence: { paymentConfirmedCount: number; omsSubmitCount: number };
    };
    assert.equal(cont.passed, true);
    assert.equal(cont.evidence.paymentConfirmedCount, 1);
    assert.equal(cont.evidence.omsSubmitCount, 1);
    assert.ok(
      (continuity?.result?.structuredContent as { checks: Array<{ name: string; passed: boolean }> })
        .checks.some((item) => item.name === "payable_includes_shipping" && item.passed)
    );
  });

  it("never concatenates bigint shipping onto satang subtotal", () => {
    assert.equal(asMinor("5000"), 5000);
    assert.equal(asMinor("0"), 0);
    assert.equal(addMinor(asMinor(231000), asMinor("5000"), asMinor("0")), 236000);
    assert.equal(String(231000 + "5000" + "0"), "23100050000");
    const payable = payableSnapshot({
      shippingMinor: "5000",
      subtotalMinor: 231000,
      taxMinor: "0"
    });
    assert.equal(payable.totalPriceMinor, 236000);
    assert.match(formatMinor(236000, "THB", "en-US"), /2,360\.00/);
    assert.equal(formatMinor(236000, "THB", "en-US").includes("231,000,500"), false);
  });

  it("emits J4 cumulative zinc upper-limit guidance at 40 mg", async () => {
    const runtime = runtimeFor();
    const result = await call(runtime, "plan", {
      idempotencyKey: "p1-j4-zinc-00000001",
      request: {
        currentSupplements: [
          {
            dailyAmount: 15,
            name: "Zinc",
            supplementId: supplementId("Zinc"),
            unit: "mg"
          }
        ],
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" },
        requirements: {},
        targets: [
          { amount: 50, name: "Zinc", supplementId: supplementId("Zinc"), unit: "mg" }
        ]
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "needs_input");
    const row = (result.coverage as Array<Record<string, unknown>>)[0];
    assert.equal(row.unit, "mg");
    assert.equal(row.requestedAmount, 50);
    assert.equal(row.currentAmount, 15);
    assert.equal(row.deliveredAmount, 25);
    assert.equal(row.totalExposureAmount, 40);
    assert.equal(row.upperLimitAmount, 40);
    assert.equal(row.status, "upper_limit_risk");
    const codes = (result.safetyGuidance as Array<{ code: string }>).map((item) => item.code);
    assert.ok(codes.includes("dose_review_required"));
    assert.ok(codes.includes("duplicate_or_overlap"));
    assert.equal(JSON.stringify(result).includes('"effect"'), false);
  });

  it("returns a summary in MCP text, not a JSON dump", async () => {
    const runtime = runtimeFor();
    const response = await handleJsonRpc(runtime, {
      id: 1,
      method: "tools/call",
      params: {
        arguments: {
          idempotencyKey: "p1-text-summary-00001",
          request: {
            destinationCountry: "TH",
            locale: "en",
            optimization: "balanced",
            profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" },
            requirements: {},
            targets: [
              {
                amount: 2000,
                name: "Vitamin D3",
                supplementId: supplementId("Vitamin D3"),
                unit: "IU"
              }
            ]
          }
        },
        name: "plan"
      }
    });
    const text = (response?.result?.content as Array<{ text: string }>)[0]?.text;
    const body = response?.result?.structuredContent as { summary: string; status: string };
    assert.equal(body.status, "ready");
    assert.equal(text, body.summary);
    assert.equal(text.trim().startsWith("{"), false);
  });

  it("freezes payable grand total as subtotal plus shipping", async () => {
    const runtime = runtimeFor();
    const created = await call(runtime, "plan", {
      idempotencyKey: "p1-payable-plan-000001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" },
        requirements: {},
        targets: [
          { amount: 2000, name: "Vitamin D3", supplementId: supplementId("Vitamin D3"), unit: "IU" },
          { amount: 1000, name: "Omega-3", supplementId: supplementId("Omega-3"), unit: "mg" },
          { amount: 300, name: "Magnesium", supplementId: supplementId("Magnesium"), unit: "mg" },
          { amount: 1000, name: "Vitamin B12", supplementId: supplementId("Vitamin B12"), unit: "mcg" },
          { amount: 1000, name: "Vitamin C", supplementId: supplementId("Vitamin C"), unit: "mg" }
        ]
      }
    });
    assert.equal(created.status, "ready");
    const executed = await call(runtime, "execute", {
      expectedRevision: created.revision,
      idempotencyKey: "p1-payable-exec-000001",
      planHandle: created.planHandle
    });
    const frozen = executed.frozenPlan as {
      shippingMinor: number;
      subtotalMinor: number;
      taxMinor: number;
      totalPriceMinor: number;
    };
    assert.equal(frozen.subtotalMinor, 231000);
    assert.equal(frozen.shippingMinor, 5000);
    assert.equal(frozen.taxMinor, 0);
    assert.equal(frozen.totalPriceMinor, 236000);
    assert.match(formatMinor(frozen.totalPriceMinor, "THB", "en-US"), /2,360\.00/);
  });

  it("plans J1 from names without currency or supplement IDs", async () => {
    const runtime = runtimeFor();
    const result = await call(runtime, "plan", {
      idempotencyKey: "p1-names-only-0000001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" },
        requirements: {},
        targets: [
          { amount: 2000, name: "Vitamin D", unit: "IU" },
          { amount: 1000, name: "Omega-3", unit: "mg" },
          { amount: 300, name: "Magnesium", unit: "mg" },
          { amount: 1000, name: "B12", unit: "mcg" },
          { amount: 1000, name: "Vitamin C", unit: "mg" }
        ]
      }
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, "ready");
    assert.equal("requestSnapshot" in result, false);
    assert.equal("supplements" in result, false);
    assert.equal(typeof result.productCount, "number");
  });

  it("rejects agent-supplied currency as an unexpected property", async () => {
    const runtime = runtimeFor();
    const result = await call(runtime, "plan", {
      idempotencyKey: "p1-usd-currency-000001",
      request: {
        currency: "USD",
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" },
        requirements: {},
        targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
      }
    });
    assert.equal(result.ok, false);
    assert.equal((result.error as { reasonCode: string }).reasonCode, "unexpected_property");
  });

  it("asks one budget question when a covered stack is over maxPriceMinor", async () => {
    const runtime = runtimeFor();
    const result = await call(runtime, "plan", {
      idempotencyKey: "p1-over-budget-0000001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" },
        requirements: { maxPriceMinor: 100000 },
        targets: [
          { amount: 2000, name: "Vitamin D3", unit: "IU" },
          { amount: 1000, name: "Omega-3", unit: "mg" },
          { amount: 300, name: "Magnesium", unit: "mg" },
          { amount: 1000, name: "Vitamin B12", unit: "mcg" },
          { amount: 1000, name: "Vitamin C", unit: "mg" }
        ]
      }
    });
    assert.equal(result.status, "needs_input");
    const questions = (result.questions as Array<{ questionId: string }>) ?? [];
    assert.ok(questions.length > 0);
    assert.ok(questions.some((item) => item.questionId === "q_max_price"));

    const relaxed = await call(runtime, "plan", {
      expectedRevision: result.revision,
      idempotencyKey: "p1-over-budget-relax-01",
      planHandle: result.planHandle,
      request: {
        answers: [{ choice: "relax_max_price", questionId: "q_max_price" }],
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" },
        requirements: { maxPriceMinor: 100000 },
        targets: [
          { amount: 2000, name: "Vitamin D3", unit: "IU" },
          { amount: 1000, name: "Omega-3", unit: "mg" },
          { amount: 300, name: "Magnesium", unit: "mg" },
          { amount: 1000, name: "Vitamin B12", unit: "mcg" },
          { amount: 1000, name: "Vitamin C", unit: "mg" }
        ]
      }
    });
    assert.equal(relaxed.status, "ready");
  });

  it("drops leftover gap questions when selecting a fully covered option", async () => {
    const runtime = runtimeFor();
    const created = await call(runtime, "plan", {
      idempotencyKey: "p1-select-option-000001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" },
        requirements: {},
        targets: [
          { amount: 2000, name: "Vitamin D3", unit: "IU" },
          { amount: 1000, name: "Omega-3", unit: "mg" },
          { amount: 300, name: "Magnesium", unit: "mg" },
          { amount: 1000, name: "Vitamin B12", unit: "mcg" },
          { amount: 1000, name: "Vitamin C", unit: "mg" }
        ]
      }
    });
    assert.equal(created.status, "ready");
    assert.equal(typeof created.optionId, "string");

    const selected = await call(runtime, "plan", {
      expectedRevision: created.revision,
      idempotencyKey: "p1-select-option-pick-01",
      planHandle: created.planHandle,
      selectOptionId: created.optionId
    });
    assert.equal(selected.ok, true);
    assert.equal(selected.status, "ready");
    const leftover = ((selected.questions as Array<{ questionId: string }>) ?? []).filter(
      (item) => item.questionId.startsWith("q_gap_")
    );
    assert.equal(leftover.length, 0);
  });

  it("keeps info minimal and plan free of internal snapshots", async () => {
    const runtime = runtimeFor();
    const info = await call(runtime, "info", {});
    assert.equal("supplements" in info, false);
    assert.equal("catalogueVersion" in info, false);
    assert.equal(typeof info.schemaChecksum, "string");
    assert.equal(info.migrationVersion, "agentic-3.0.0");

    const plan = await call(runtime, "plan", {
      idempotencyKey: "p1-public-slim-0000001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" },
        requirements: {},
        targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
      }
    });
    assert.equal("requestSnapshot" in plan, false);
    assert.equal("catalogueVersion" in plan, false);
    assert.equal("optimizationEvidence" in plan, false);
    assert.equal("availabilityAsOf" in plan, false);
    assert.ok((plan.productCount as number) >= 1);
    const alternatives = (plan.alternatives as Array<{ productCount?: number; tradeOffs?: unknown }>) ?? [];
    for (const option of alternatives) {
      assert.equal(typeof option.productCount, "number");
      assert.equal(typeof option.tradeOffs, "object");
    }
  });

  it("describes a paid order as completed, not checkout-ready", async () => {
    const runtime = runtimeFor();
    const created = await call(runtime, "plan", {
      idempotencyKey: "p1-paid-text-plan-0001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sexAtBirth: "male" },
        requirements: {},
        targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
      }
    });
    const executed = await call(runtime, "execute", {
      expectedRevision: created.revision,
      idempotencyKey: "p1-paid-text-exec-0001",
      planHandle: created.planHandle
    });
    await simulatePayment({
      config: runtime.config,
      now: new Date().toISOString(),
      orderHandle: String(executed.orderHandle),
      scenario: "success",
      scope: runtime.scope,
      store: runtime.store
    });
    const polled = await handleJsonRpc(runtime, {
      id: 8,
      method: "tools/call",
      params: {
        arguments: { orderHandle: executed.orderHandle },
        name: "order"
      }
    });
    const text = (polled?.result?.content as Array<{ text: string }>)[0]?.text ?? "";
    assert.equal(text.includes("Checkout ready"), false);
    assert.match(text, /paid|completed|confirmed/i);
  });

  it("returns every untested pack ID from packProof", async () => {
    const runtime = runtimeFor();
    const proof = await handleQaJsonRpc(runtime, {
      id: 9,
      method: "tools/call",
      params: { arguments: {}, name: "packProof" }
    });
    const body = proof?.result?.structuredContent as {
      checks: Array<{ id: string; passed: boolean }>;
      passed: boolean;
      untestedIds: string[];
    };
    assert.ok(body.untestedIds.length >= 50);
    assert.equal(body.checks.length, body.untestedIds.length);
    const missing = body.untestedIds.filter(
      (id) => !body.checks.some((item) => item.id === id)
    );
    assert.deepEqual(missing, []);
    const failed = body.checks.filter((item) => !item.passed).map((item) => item.id);
    assert.deepEqual(failed, [], failed.join(","));
  });
});
