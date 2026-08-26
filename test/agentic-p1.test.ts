import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";
import { FIXTURE_SUPPLEMENTS } from "../lib/agentic/catalogue/fixtures.ts";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";
import { parseCheckoutAddress } from "../lib/agentic/checkout-address.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { planTool } from "../lib/agentic/plan/service.ts";
import { executeTool } from "../lib/agentic/commerce/execute.ts";
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
import { setMatcherSafetyCeilings } from "../lib/matcher/safety-ceilings.ts";

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

beforeEach(() => {
  installGoldCatalogue();
});

afterEach(() => {
  uninstallGoldCatalogue();
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
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
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
    const zinc = FIXTURE_SUPPLEMENTS.find((item) => item.name === "Zinc");
    assert.ok(zinc);
    setMatcherSafetyCeilings([
      {
        lifeStage: "adult",
        maxAmount: 40,
        maxUnit: "mg",
        name: "Zinc",
        sourceScope: "supplemental",
        subjectId: zinc.supplementId
      }
    ]);
    const runtime = runtimeFor();
    const result = await call(runtime, "plan", {
      idempotencyKey: "p1-retain-zinc-00001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
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
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        medicationCodes: ["apixaban"],
        targets: [
          { amount: 1000, name: "Omega-3", supplementId: supplementId("Omega-3"), unit: "mg" }
        ]
      }
    });

    assert.equal(first.status, "needs_input");
    const guidanceIds = first.guidanceIds as string[];
    assert.ok(Array.isArray(guidanceIds) && guidanceIds.length > 0);
    assert.equal(first.requiresSafetyAcknowledgement, true);
    assert.deepEqual(first.medicationCodes, ["apixaban"]);
    const fromGuidance = (first.safetyGuidance as Array<{ guidanceId: string }>).map(
      (item) => item.guidanceId
    );
    assert.deepEqual(guidanceIds, fromGuidance);

    const acked = await call(runtime, "plan", {
      expectedRevision: first.revision,
      idempotencyKey: "p1-ack-second-000001",
      planHandle: first.planHandle,
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
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
    assert.deepEqual(acked.medicationCodes, ["apixaban"]);

    const changed = await call(runtime, "plan", {
      expectedRevision: acked.revision,
      idempotencyKey: "p1-ack-third-0000001",
      planHandle: first.planHandle,
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
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
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
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
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
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

  it("requires a matching destination country for checkout parsing", () => {
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
    const bareInfo = await handleJsonRpc(runtime, {
      id: 6,
      method: "tools/call",
      params: { arguments: {}, name: "info" }
    });
    assert.equal((bareInfo?.result?.structuredContent as { ok?: boolean })?.ok, true);
    const doublePrefixed = await handleJsonRpc(runtime, {
      id: 7,
      method: "tools/call",
      params: { arguments: {}, name: "mattanutra_dev.mattanutra_dev.info" }
    });
    assert.equal(
      (doublePrefixed?.result?.structuredContent as { ok?: boolean })?.ok,
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
    const zinc = FIXTURE_SUPPLEMENTS.find((item) => item.name === "Zinc");
    assert.ok(zinc);
    setMatcherSafetyCeilings([
      {
        maxAmount: 40,
        maxUnit: "mg",
        name: "Zinc",
        subjectId: zinc.supplementId
      }
    ]);
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
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
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
            profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
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
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
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
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
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
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
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
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: { maxPriceMinor: 1000 },
        targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
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
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: { maxPriceMinor: 1000 },
        targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
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
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
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
    assert.ok(Array.isArray(info.supportedCountries));
    assert.ok(
      (info.supportedCountries as Array<{ countryCode: string }>).every(
        (item) => /^[A-Z]{2}$/.test(item.countryCode)
      )
    );

    const plan = await call(runtime, "plan", {
      idempotencyKey: "p1-public-slim-0000001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
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

  it("keeps client-visible trade-offs free of matcher internals", async () => {
    const runtime = runtimeFor();
    const plan = await call(runtime, "plan", {
      idempotencyKey: "p1-tradeoffs-public-01",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
      }
    });
    const encoded = JSON.stringify(plan).toLowerCase();
    assert.equal(encoded.includes("beam"), false);
    assert.equal(encoded.includes("snapshot"), false);
    assert.equal(encoded.includes("tie-break"), false);
    assert.equal(encoded.includes("tie break"), false);
    const tradeOffs = plan.tradeOffs as { summary?: string };
    assert.equal(typeof tradeOffs?.summary, "string");
    assert.equal(/beam|snapshot|tie-?break|version/i.test(tradeOffs.summary ?? ""), false);
  });

  it("describes a paid order as completed, not checkout-ready", async () => {
    const runtime = runtimeFor();
    const created = await call(runtime, "plan", {
      idempotencyKey: "p1-paid-text-plan-0001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
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

  it("omits null placeholders and empty collections from blocked plan payloads", async () => {
    const runtime = runtimeFor();
    const plan = await call(runtime, "plan", {
      idempotencyKey: "p1-d410-blocked-00001",
      request: {
        conditionCodes: ["ckd"],
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [{ amount: 300, name: "Magnesium", unit: "mg" }]
      }
    });
    assert.equal(plan.status, "blocked");
    const guidanceIds = plan.guidanceIds as string[] | undefined;
    assert.ok(Array.isArray(guidanceIds) && guidanceIds.length > 0);
    assert.equal(plan.requiresSafetyAcknowledgement, true);
    assert.deepEqual(plan.conditionCodes, ["ckd"]);
    const encoded = JSON.stringify(plan);
    assert.equal(encoded.includes(":null"), false);
    assert.equal(/:\s*\[\]/.test(encoded), false);
    assert.equal(encoded.includes("rulesVersion"), true);
    assert.equal(encoded.includes("ruleId"), true);
    const guidance = plan.safetyGuidance as Array<{
      ruleId: string;
      rulesVersion: string;
    }>;
    assert.ok(guidance.length > 0);
    assert.ok(guidance.every((item) => item.ruleId.length > 0 && item.rulesVersion.length > 0));
  });

  it("exposes a DEV checkout test scenario selector", () => {
    const panel = readFileSync(new URL("../components/agentic-checkout-panel.tsx", import.meta.url), "utf8");
    assert.match(panel, /name="scenario"/);
    assert.match(panel, /decline_insufficient_funds/);
    assert.match(panel, /<select/);
    assert.match(panel, /method="post"/);
    assert.match(panel, /type="submit"/);
    assert.match(panel, /native HTML form/);
    assert.match(panel, /application\/x-www-form-urlencoded/);
    assert.match(panel, /name="customerName"/);
    assert.match(panel, /name="agentAuthorized"/);
    assert.match(panel, /scenario=expire/);
    assert.match(panel, /three_ds_cancelled/);
    assert.match(panel, /scenario=refund/);
    assert.match(panel, /partial_refund/);
    assert.match(panel, /refundable/);
    assert.match(panel, /paid page keeps an authorized refund form/);
    const website = readFileSync(
      new URL("../components/mcp-website-checkout-panel.tsx", import.meta.url),
      "utf8"
    );
    const page = readFileSync(
      new URL("../app/[locale]/mcp/checkout/[checkoutAccess]/page.tsx", import.meta.url),
      "utf8"
    );
    assert.match(website, /Pay securely and place order|labels\.continue/);
    assert.match(website, /EmbeddedCheckout/);
    assert.equal(website.includes("Continue to Stripe Test Mode"), false);
    assert.match(page, /McpWebsiteCheckoutPanel/);
    assert.match(page, /loadAgenticCheckoutProducts/);
    const adapter = readFileSync(
      new URL("../lib/agentic/commerce/stripe-adapter.ts", import.meta.url),
      "utf8"
    );
    assert.match(adapter, /ui_mode: "embedded_page"/);
    assert.match(adapter, /\/mcp\/checkout\/\$\{encodeURIComponent\(input\.checkoutAccess\)\}\/return/);
    const executeSource = readFileSync(
      new URL("../lib/agentic/commerce/execute.ts", import.meta.url),
      "utf8"
    );
    assert.match(executeSource, /successUrl/);
    assert.match(executeSource, /\/en\/order\/track/);
    const returnPage = readFileSync(
      new URL("../app/[locale]/mcp/checkout/[checkoutAccess]/return/page.tsx", import.meta.url),
      "utf8"
    );
    assert.match(returnPage, /resolveAgenticPaidTrackingPath/);
    assert.match(website, /name="success_url"/);
    assert.match(panel, /props\.paid \|\| Boolean\(props\.refundable\)/);
    assert.match(page, /paymentStatus === "refunded"/);
    assert.match(page, /partially_refunded/);
  });

  it("accepts Creatine by official name and does not call it a legacy ID", async () => {
    const runtime = runtimeFor();
    const plan = await call(runtime, "plan", {
      idempotencyKey: "p1-creatine-name-00001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [
          { amount: 2000, name: "Vitamin D3", unit: "IU" },
          { amount: 1000, name: "Omega-3", unit: "mg" },
          { amount: 300, name: "Magnesium", unit: "mg" },
          { amount: 5, name: "Creatine", unit: "g" }
        ]
      }
    });
    assert.equal(plan.ok, true);
    assert.notEqual(plan.status, undefined);
    const encoded = JSON.stringify(plan).toLowerCase();
    assert.equal(encoded.includes("legacy id"), false);
    assert.ok((plan.coverage as Array<{ name?: string }>).some((row) =>
      String(row.name).toLowerCase().includes("creatine")
    ));

    const unknown = await call(runtime, "plan", {
      idempotencyKey: "p1-unknown-name-00001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [
          { amount: 2000, name: "Vitamin D3", unit: "IU" },
          { amount: 1, name: "Unobtainium", unit: "mg" }
        ]
      }
    });
    assert.equal(unknown.ok, true);
    const leftovers = (unknown.leftovers as Array<{ name?: string; reason?: string }>) ?? [];
    assert.ok(leftovers.some((item) =>
      String(item.name).toLowerCase() === "unobtainium" && item.reason === "not_in_catalogue"
    ));
    assert.equal(JSON.stringify(unknown).toLowerCase().includes("legacy ids are not accepted"), false);
  });

  it("omits alternatives that duplicate the selected stack", async () => {
    const runtime = runtimeFor();
    const plan = await call(runtime, "plan", {
      idempotencyKey: "p1-no-twin-alt-00001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [
          { amount: 2000, name: "Vitamin D3", unit: "IU" },
          { amount: 1000, name: "Omega-3", unit: "mg" },
          { amount: 300, name: "Magnesium", unit: "mg" }
        ]
      }
    });
    const selectedIds = ((plan.basket as Array<{ productId: string }>) ?? [])
      .map((item) => item.productId)
      .slice()
      .sort()
      .join("|");
    const alternatives = (plan.alternatives as Array<{
      basket?: Array<{ productId: string }>;
      optionId?: string;
      tradeOffs?: { summary?: string };
    }>) ?? [];
    for (const option of alternatives) {
      const ids = (option.basket ?? [])
        .map((item) => item.productId)
        .slice()
        .sort()
        .join("|");
      assert.notEqual(ids, selectedIds);
      assert.notEqual(option.optionId, plan.optionId);
    }
  });

  it("agrees error category with error_code and treats missing order as an error", async () => {
    const runtime = runtimeFor();
    const created = await call(runtime, "plan", {
      idempotencyKey: "p1-err-shape-plan-001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
      }
    });
    const stale = await call(runtime, "plan", {
      expectedRevision: 99,
      idempotencyKey: "p1-err-shape-stale-01",
      planHandle: created.planHandle,
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
      }
    });
    const staleError = stale.error as {
      category: string;
      error_code: string;
      reasonCode: string;
    };
    assert.equal(stale.ok, false);
    assert.equal(staleError.reasonCode, "revision_conflict");
    assert.equal(staleError.category, "ABORTED");
    assert.equal(staleError.error_code, "ABORTED");

    const missing = await handleJsonRpc(runtime, {
      id: 11,
      method: "tools/call",
      params: {
        arguments: { orderHandle: "missing-order-handle-not-found-0001" },
        name: "order"
      }
    });
    assert.equal(missing?.result?.isError, true);
    const missingBody = missing?.result?.structuredContent as {
      error?: { category: string; error_code: string; reasonCode: string };
      ok?: boolean;
    };
    assert.equal(missingBody.ok, false);
    assert.equal(missingBody.error?.reasonCode, "not_found");
    assert.equal(missingBody.error?.category, "NOT_FOUND");
    assert.equal(missingBody.error?.error_code, "NOT_FOUND");
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

  it("accepts pregnant lifeStage with Folate and Folic acid aliases", async () => {
    const runtime = runtimeFor();
    const folate = await call(runtime, "plan", {
      idempotencyKey: "p1-pregnant-folate-001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 32, lifeStage: "pregnant", sex: "female" },
        requirements: {},
        targets: [{ amount: 400, name: "Folate", unit: "mcg" }]
      }
    });
    assert.equal(folate.ok, true);
    assert.notEqual(folate.status, undefined);
    assert.ok((folate.coverage as Array<{ name?: string }>).some((row) =>
      String(row.name).toLowerCase().includes("folate")
    ));

    const alias = await call(runtime, "plan", {
      idempotencyKey: "p1-pregnant-folic-001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 32, lifeStage: "pregnant", sex: "female" },
        requirements: {},
        targets: [{ amount: 400, name: "Folic acid", unit: "mcg" }]
      }
    });
    assert.equal(alias.ok, true);
    assert.equal((alias.error as { reasonCode?: string } | undefined)?.reasonCode, undefined);
  });

  it("recognises Calcium, Vitamin B6, Iodine and Selenium by name", async () => {
    const runtime = runtimeFor();
    const plan = await call(runtime, "plan", {
      idempotencyKey: "p1-extra-names-000001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "female" },
        requirements: {},
        targets: [
          { amount: 600, name: "Calcium", unit: "mg" },
          { amount: 10, name: "Vitamin B6", unit: "mg" },
          { amount: 150, name: "Iodine", unit: "mcg" },
          { amount: 55, name: "Selenium", unit: "mcg" }
        ]
      }
    });
    assert.equal(plan.ok, true);
    const names = ((plan.coverage as Array<{ name?: string }>) ?? []).map((row) =>
      String(row.name).toLowerCase()
    );
    assert.ok(names.some((name) => name.includes("calcium")));
    assert.ok(names.some((name) => name.includes("b6") || name.includes("vitamin b6")));
    assert.ok(names.some((name) => name.includes("iodine")));
    assert.ok(names.some((name) => name.includes("selenium")));
  });

  it("reuses a planHandle hours later and expires it after the 7-day TTL", async () => {
    const runtime = runtimeFor();
    const created = await call(runtime, "plan", {
      idempotencyKey: "p1-plan-ttl-create-01",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
      }
    });
    assert.equal(created.ok, true);
    const later = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    const reused = await planTool({
      config: runtime.config,
      now: later,
      payload: {
        expectedRevision: created.revision as number,
        idempotencyKey: "p1-plan-ttl-reuse-001",
        planHandle: String(created.planHandle),
        request: {
          destinationCountry: "TH",
          locale: "en",
          optimization: "balanced",
          profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
          requirements: {},
          targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
        }
      },
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal("ok" in reused && reused.ok, true);

    const expired = await planTool({
      config: runtime.config,
      now: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
      payload: {
        expectedRevision: created.revision as number,
        idempotencyKey: "p1-plan-ttl-expire-01",
        planHandle: String(created.planHandle),
        request: {
          destinationCountry: "TH",
          locale: "en",
          optimization: "balanced",
          profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
          requirements: {},
          targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
        }
      },
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal("ok" in expired && expired.ok, false);
    assert.equal(
      (expired as { error?: { reasonCode?: string } }).error?.reasonCode,
      "not_found"
    );
  });

  it("advances unpaid checkouts to expired and cancelled via named scenarios", async () => {
    const runtime = runtimeFor();
    const expirePlan = await call(runtime, "plan", {
      idempotencyKey: "p1-expire-plan-000001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
      }
    });
    const expireExec = await call(runtime, "execute", {
      expectedRevision: expirePlan.revision,
      idempotencyKey: "p1-expire-exec-000001",
      planHandle: expirePlan.planHandle
    });
    const expired = await simulatePayment({
      config: runtime.config,
      now: new Date().toISOString(),
      orderHandle: String(expireExec.orderHandle),
      scenario: "expire",
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal((expired as { orderStatus?: string }).orderStatus, "expired");

    const cancelPlan = await call(runtime, "plan", {
      idempotencyKey: "p1-cancel-plan-000001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
      }
    });
    const cancelExec = await call(runtime, "execute", {
      expectedRevision: cancelPlan.revision,
      idempotencyKey: "p1-cancel-exec-000001",
      planHandle: cancelPlan.planHandle
    });
    const cancelled = await simulatePayment({
      config: runtime.config,
      now: new Date().toISOString(),
      orderHandle: String(cancelExec.orderHandle),
      scenario: "three_ds_cancelled",
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal((cancelled as { orderStatus?: string }).orderStatus, "cancelled");
    assert.equal((cancelled as { messageKey?: string }).messageKey, "order.cancelled");
  });

  it("binds acknowledge_safety answers and returns revision_conflict on stale execute", async () => {
    const runtime = runtimeFor();
    const first = await call(runtime, "plan", {
      idempotencyKey: "p1-ack-answer-first-01",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        medicationCodes: ["apixaban"],
        targets: [{ amount: 1000, name: "Omega-3", unit: "mg" }]
      }
    });
    assert.equal(first.status, "needs_input");
    const questions = (first.questions as Array<{ questionId?: string }>) ?? [];
    assert.ok(questions.some((item) => item.questionId === "q_safety_ack"));

    const acked = await call(runtime, "plan", {
      expectedRevision: first.revision,
      idempotencyKey: "p1-ack-answer-second01",
      planHandle: first.planHandle,
      request: {
        answers: [{ choice: "acknowledge_safety", questionId: "q_safety_ack" }],
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        medicationCodes: ["apixaban"],
        targets: [{ amount: 1000, name: "Omega-3", unit: "mg" }]
      }
    });
    assert.equal(acked.status, "ready");

    const stale = await executeTool({
      config: runtime.config,
      expectedRevision: first.revision as number,
      idempotencyKey: "p1-stale-exec-0000001",
      now: new Date().toISOString(),
      payment: runtime.payment,
      planHandle: String(acked.planHandle),
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal("ok" in stale && stale.ok, false);
    assert.equal(
      (stale as { error?: { reasonCode?: string } }).error?.reasonCode,
      "revision_conflict"
    );
  });

  it("scores D1-09 from info schemaChecksum and migrationVersion", async () => {
    const runtime = runtimeFor();
    const info = await call(runtime, "info", { locale: "en" });
    assert.equal(typeof info.schemaChecksum, "string");
    assert.equal((info.schemaChecksum as string).length, 64);
    assert.equal(info.migrationVersion, "agentic-3.0.0");
    assert.equal("supplements" in info, false);
  });

  it("returns D5-07 medicationCodes plus safetyAcknowledgement and D5-09 blocked guidanceIds", async () => {
    const runtime = runtimeFor();
    const first = await call(runtime, "plan", {
      idempotencyKey: "p1-d507-plan-0000001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        medicationCodes: ["apixaban"],
        targets: [{ amount: 1000, name: "Omega-3", unit: "mg" }]
      }
    });
    assert.equal(first.status, "needs_input");
    assert.equal(first.requiresSafetyAcknowledgement, true);
    assert.ok(Array.isArray(first.guidanceIds) && (first.guidanceIds as string[]).length > 0);
    assert.ok(
      ((first.questions as Array<{ questionId?: string }>) ?? []).some(
        (item) => item.questionId === "q_safety_ack"
      )
    );
    const acked = await call(runtime, "plan", {
      expectedRevision: first.revision,
      idempotencyKey: "p1-d507-ack-0000001",
      planHandle: first.planHandle,
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        medicationCodes: ["apixaban"],
        safetyAcknowledgement: {
          confirmed: true,
          guidanceIds: first.guidanceIds as string[],
          revision: first.revision as number
        },
        targets: [{ amount: 1000, name: "Omega-3", unit: "mg" }]
      }
    });
    assert.equal(acked.status, "ready");

    const blocked = await call(runtime, "plan", {
      idempotencyKey: "p1-d509-block-000001",
      request: {
        conditionCodes: ["ckd"],
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 60, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [{ amount: 300, name: "Magnesium", unit: "mg" }]
      }
    });
    assert.equal(blocked.status, "blocked");
    assert.ok(Array.isArray(blocked.guidanceIds) && (blocked.guidanceIds as string[]).length > 0);
    assert.equal(blocked.requiresSafetyAcknowledgement, true);
    assert.deepEqual(blocked.conditionCodes, ["ckd"]);
  });

  it("reuses one planHandle twice for D6 revision increments", async () => {
    const runtime = runtimeFor();
    const first = await call(runtime, "plan", {
      idempotencyKey: "p1-d5-08-create-0001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
      }
    });
    const second = await call(runtime, "plan", {
      expectedRevision: first.revision,
      idempotencyKey: "p1-d5-08-revise-0001",
      planHandle: first.planHandle,
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "lowest_cost",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
      }
    });
    assert.equal(second.ok, true);
    assert.ok((second.revision as number) > (first.revision as number));
    const third = await call(runtime, "plan", {
      expectedRevision: second.revision,
      idempotencyKey: "p1-d5-09-reuse-00001",
      planHandle: first.planHandle,
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "fewest_pills",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
      }
    });
    assert.equal(third.ok, true);
    assert.equal(third.planHandle, first.planHandle);
    assert.ok((third.revision as number) > (second.revision as number));
  });

  it("refunds a separate paid checkout for D7-09", async () => {
    const runtime = runtimeFor();
    const plan = await call(runtime, "plan", {
      idempotencyKey: "p1-d709-plan-0000001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
      }
    });
    const executed = await call(runtime, "execute", {
      expectedRevision: plan.revision,
      idempotencyKey: "p1-d709-exec-0000001",
      planHandle: plan.planHandle
    });
    await simulatePayment({
      config: runtime.config,
      now: new Date().toISOString(),
      orderHandle: String(executed.orderHandle),
      scenario: "success",
      scope: runtime.scope,
      store: runtime.store
    });
    const refunded = await simulatePayment({
      config: runtime.config,
      now: new Date().toISOString(),
      orderHandle: String(executed.orderHandle),
      scenario: "refund",
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal((refunded as { paymentStatus?: string }).paymentStatus, "refunded");
  });

  it("joins MCP pay to the same retail checkout fulfill path", () => {
    const pay = readFileSync(
      new URL("../app/api/mcp/checkout/[checkoutAccess]/pay/route.ts", import.meta.url),
      "utf8"
    );
    const simulate = readFileSync(new URL("../lib/agentic/qa/simulate.ts", import.meta.url), "utf8");
    const join = readFileSync(
      new URL("../lib/agentic/commerce/retail-join.ts", import.meta.url),
      "utf8"
    );
    const checkout = readFileSync(
      new URL("../lib/retail-product-checkout.ts", import.meta.url),
      "utf8"
    );
    const feedback = readFileSync(new URL("../lib/agentic/feedback.ts", import.meta.url), "utf8");
    const order = readFileSync(
      new URL("../lib/agentic/commerce/order.ts", import.meta.url),
      "utf8"
    );
    const support = readFileSync(new URL("../lib/agentic/support.ts", import.meta.url), "utf8");

    assert.match(pay, /joinMcpPaidOrderToRetail/);
    assert.match(pay, /processing_then_success/);
    assert.match(pay, /providerEventId: `\$\{event.providerEventId\}_success`/);
    assert.match(simulate, /joinMcpPaidOrderToRetail/);
    assert.match(pay, /postedScenario/);
    assert.equal(pay.includes('form.get("scenario") ?? "success"'), false);
    assert.match(pay, /Stripe Test Mode does not accept mock payment scenarios/);
    assert.match(join, /fulfillAgenticRetailCheckout/);
    assert.match(checkout, /pharmacyRrpPayableAmounts/);
    assert.equal(checkout.includes("retailerPayableAmount: item.unitPriceAmount"), false);
    assert.match(order, /contributionMargin/);
    assert.match(join, /products.status = 'approved'/);
    assert.equal(join.includes("insert into public.products"), false);
    assert.equal(join.includes("insert into public.retail_sellable_products"), false);
    const snapshot = readFileSync(
      new URL("../lib/agentic/catalogue/snapshot.ts", import.meta.url),
      "utf8"
    );
    const live = readFileSync(
      new URL("../lib/agentic/catalogue/live.ts", import.meta.url),
      "utf8"
    );
    const tracking = readFileSync(
      new URL("../app/[locale]/order/track/[token]/page.tsx", import.meta.url),
      "utf8"
    );
    const checkoutPage = readFileSync(
      new URL("../app/[locale]/mcp/checkout/[checkoutAccess]/page.tsx", import.meta.url),
      "utf8"
    );
    const workflow = readFileSync(
      new URL("../lib/retail-order-workflow.ts", import.meta.url),
      "utf8"
    );
    const schema = readFileSync(
      new URL("../lib/agentic/contract/schemas.ts", import.meta.url),
      "utf8"
    );
    assert.match(snapshot, /cachedLiveRetailSnapshot/);
    assert.doesNotMatch(live, /getLiveSaleEligibleRetailerCandidateSets/);
    assert.doesNotMatch(live, /loadProductRows/);
    assert.match(live, /assessRetailSellability/);
    assert.match(live, /isSaleEligible/);
    assert.match(live, /sellerId\}:\$\{mapped\.productId\}/);
    const mapper = readFileSync(
      new URL("../lib/agentic/public-mapper.ts", import.meta.url),
      "utf8"
    );
    assert.match(mapper, /imageUrl/);
    assert.match(checkoutPage, /redirect\(paidTracking\)/);
    assert.match(checkoutPage, /resolveAgenticPaidTrackingPath/);
    assert.match(checkoutPage, /destinationCountry=\{order\.destinationCountry\}/);
    const mcpPanel = readFileSync(
      new URL("../components/mcp-website-checkout-panel.tsx", import.meta.url),
      "utf8"
    );
    assert.equal(mcpPanel.includes('value="Thailand"'), false);
    assert.match(mcpPanel, /displayCountryName/);
    const market = readFileSync(
      new URL("../lib/agentic/catalogue/market.ts", import.meta.url),
      "utf8"
    );
    assert.match(market, /cannotDeliverMessage/);
    assert.match(market, /unsupported_country/);
    assert.match(market, /listDeliverableMarkets/);
    const checkoutReturn = readFileSync(
      new URL("../lib/agentic/commerce/checkout-return.ts", import.meta.url),
      "utf8"
    );
    assert.match(checkoutReturn, /from=mcp/);
    assert.match(tracking, /returnToAgent/);
    assert.match(tracking, /Please return to your AI Agent Chat/);
    assert.match(workflow, /Payment was received/);
    assert.equal(workflow.includes("Thank you for trusting MattaNutra"), false);
    assert.match(schema, /required: \["ageYears", "sex", "lifeStage"\]/);
    assert.equal(schema.includes("sexAtBirth"), false);
    assert.match(join, /persistMcpPlanFeedback/);
    assert.match(join, /persistAssessmentSubmission/);
    assert.match(join, /insertFormulationVersion/);
    assert.match(join, /source: "mcp_plan"/);
    assert.match(join, /assessments\.plan_id is the same/);
    const planService = readFileSync(
      new URL("../lib/agentic/plan/service.ts", import.meta.url),
      "utf8"
    );
    assert.match(planService, /persistCanonicalWebPlan/);
    assert.match(planService, /persistMcpAssessment/);
    assert.match(checkout, /async function fulfillRetailCheckoutPayment/);
    assert.match(checkout, /export async function completeMockRetailCheckout/);
    assert.match(checkout, /export async function fulfillAgenticRetailCheckout/);
    assert.match(checkout, /recordRetailCheckoutFinance/);
    assert.match(checkout, /createRetailCustomerOrderFromPayment/);
    assert.match(feedback, /persistMcpPlanFeedback/);
    assert.match(feedback, /savePlanFeedback|persistMcpPlanFeedback/);
    assert.match(order, /getRetailLink/);
    assert.match(support, /lookupRetailOrderForAgentic/);
  });

  it("executes the same ready revision twice with different idempotency keys", async () => {
    const runtime = runtimeFor();
    const plan = await call(runtime, "plan", {
      idempotencyKey: "p1-d1010-plan-000001",
      request: {
        destinationCountry: "TH",
        locale: "en",
        optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" },
        requirements: {},
        targets: [{ amount: 2000, name: "Vitamin D3", unit: "IU" }]
      }
    });
    const first = await call(runtime, "execute", {
      expectedRevision: plan.revision,
      idempotencyKey: "p1-d1010-exec-a-0001",
      planHandle: plan.planHandle
    });
    const second = await call(runtime, "execute", {
      expectedRevision: plan.revision,
      idempotencyKey: "p1-d1010-exec-b-0001",
      planHandle: plan.planHandle
    });
    const firstOk = first.ok === true && typeof first.orderHandle === "string";
    const secondOk = second.ok === true && typeof second.orderHandle === "string";
    const secondConflict =
      second.ok === false &&
      (second.error as { reasonCode?: string } | undefined)?.reasonCode === "revision_conflict";
    assert.equal(firstOk, true);
    assert.ok(secondOk || secondConflict);
    if (secondOk) {
      assert.notEqual(second.orderHandle, first.orderHandle);
    }
  });
});
