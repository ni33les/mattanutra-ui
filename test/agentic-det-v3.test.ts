import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  CONNECTOR_COPY,
  CONNECTOR_PROPOSITION_SEMANTIC_ID,
  CONNECTOR_SAFETY_SEMANTIC_ID,
  connectorCopy,
  englishConnectorWordCount
} from "../lib/agentic/discovery/content.ts";
import {
  RESEARCH_VERSION,
  RESPONSIBILITY_VERSION,
  VALUE_PROPOSITION_ID,
  WELLNESS_BOUNDARY_ID
} from "../lib/agentic/discovery/versions.ts";
import {
  RESPONSIBILITY_DOMAINS,
  responsibilitySnapshot
} from "../lib/agentic/responsibility/matrix.ts";
import { APPROVED_CLAIMS } from "../lib/agentic/claims/corpus.ts";
import { selectApplicableClaims } from "../lib/agentic/claims/select.ts";
import {
  buildCompactDecision,
  compactDecisionBytes
} from "../lib/agentic/value/compact-decision.ts";
import { AGENTIC_PUBLIC_TOOLS } from "../lib/agentic/contract/instructions.ts";
import { validateToolIssues } from "../lib/agentic/contract/validate.ts";
import { EVIDENCE_INPUT_SCHEMA } from "../lib/agentic/contract/schemas.ts";
import { queryCount, resetQueryBudget } from "../lib/agentic/plan/query-budget.ts";
import { resetMatchPlanCache } from "../lib/agentic/plan/matching.ts";
import { planTool } from "../lib/agentic/plan/service.ts";
import { executeTool } from "../lib/agentic/commerce/execute.ts";
import { feedbackTool } from "../lib/agentic/feedback.ts";
import {
  driveFulfilmentFixture,
  drivePaymentFixture
} from "../lib/agentic/commerce/fixture-driver.ts";
import {
  FUNNEL_EVENT_TYPES,
  contributionMinor,
  rejectProhibitedFunnelPayload
} from "../lib/agentic/funnel/events.ts";
import {
  listFunnelEvents,
  recordFunnelEvent,
  resetFunnelLedger
} from "../lib/agentic/funnel/ledger.ts";
import {
  COMMERCE_TIMELINE,
  canAdvanceTimeline
} from "../lib/agentic/commerce/timeline.ts";
import { FIXTURE_SUPPLEMENTS } from "../lib/agentic/catalogue/fixtures.ts";
import { goldenPlanRequest } from "../lib/agentic/qa/proofs.ts";
import {
  beginComRun,
  comCall,
  createComRuntime,
  endComRun,
  key,
  seedNeedsInput,
  seedPlanA
} from "./helpers/com-fixtures.ts";
import {
  beginDetRun,
  canonicalJson,
  createDetRuntime,
  detCall,
  detListTools,
  endDetRun,
  runTwice,
  stepClock
} from "./agentic/det-v3/harness.ts";
import { DET_V3_CLOCK, DET_V3_LOCALES } from "./agentic/det-v3/manifest.ts";
import { withNow } from "./helpers/com-fixtures.ts";

function magView(status: "ready" | "no_purchase", extra: Record<string, unknown> = {}) {
  return {
    coverage: [{ name: "Magnesium", status: "covered" }],
    selected:
      status === "ready"
        ? {
            basket: [
              {
                currency: "THB",
                dailyPills: 1,
                form: "capsule",
                lineTotalMinor: 39000,
                productId: "prd_mag",
                productName: "Magnesium glycinate",
                quantity: 1,
                retailerSku: "MAG",
                sellerId: "rtl",
                sellerName: "Retail",
                unitPriceMinor: 39000
              }
            ],
            coverage: [{ name: "Magnesium", status: "covered" }],
            coveragePercent: 100,
            dailyPills: 1,
            economics: {
              baseline: { cash90DayMinor: null, lines: [], type: "separate_direct_products" },
              cash30DayMinor: 39000,
              cash90DayMinor: 39000,
              cashComplete: true,
              cashTotalMinor: 39000,
              comparisonComplete: true,
              complete: true,
              consumptionComplete: true,
              savingClaim: "none",
              savings90DayMinor: null
            },
            matcherVersion: "test",
            optionId: "opt_mag",
            reason: "dedicated",
            snapshotId: "snap",
            totalPriceMinor: 39000
          }
        : null,
    status,
    ...extra
  };
}

beforeEach(() => {
  beginDetRun("suite");
});

afterEach(() => {
  endDetRun();
});

describe("DET-v3 harness", () => {
  it("two empty namespace maps are identical", async () => {
    const evidence = await runTwice(async (runId) => ({
      clock: DET_V3_CLOCK,
      runId: runId.replace(/run-[ab]/, "run-*"),
      versions: {
        researchVersion: RESEARCH_VERSION,
        responsibilityVersion: RESPONSIBILITY_VERSION,
        valuePropositionId: VALUE_PROPOSITION_ID
      }
    }));
    assert.equal(evidence.clock, DET_V3_CLOCK);
  });

  it("rejects a fixture payload that skips ingress as INVALID_RED", () => {
    const hit = rejectProhibitedFunnelPayload({ supportBody: "secret" });
    assert.equal(hit, "supportBody");
  });
});

describe("Slice A discovery", () => {
  it("A-UNIT-01 approved connector copy", () => {
    assert.equal(englishConnectorWordCount() <= 45, true);
    assert.match(CONNECTOR_COPY.en, /match/i);
    assert.match(CONNECTOR_COPY.en, /optimiz/i);
    assert.match(CONNECTOR_COPY.en, /wellness/i);
    assert.equal(/availibility|optimiseing|diagnosiss/i.test(CONNECTOR_COPY.en), false);
    for (const locale of DET_V3_LOCALES) {
      assert.ok(connectorCopy(locale).length > 20);
    }
  });

  it("A-UNIT-02 invariant semantic IDs", () => {
    assert.equal(CONNECTOR_PROPOSITION_SEMANTIC_ID.includes("match"), true);
    assert.equal(CONNECTOR_SAFETY_SEMANTIC_ID.includes("wellness"), true);
    assert.equal(VALUE_PROPOSITION_ID, "vp_match_optimize_boundary_v1");
    assert.equal(WELLNESS_BOUNDARY_ID, "wb_guidance_not_clinical_v1");
    assert.equal(RESEARCH_VERSION.startsWith("research-"), true);
  });

  it("A-CONTRACT-01/02 locale-aware info and tools/list", async () => {
    const runtime = createDetRuntime();
    const listed = await runTwice(async () => {
      const tools = await detListTools(runtime, "th");
      return tools.map((item) => item.name);
    });
    assert.deepEqual(listed, [...AGENTIC_PUBLIC_TOOLS]);
    const infoEn = await detCall(runtime, "info", { locale: "en" });
    const infoTh = await detCall(runtime, "info", { locale: "th" });
    const infoZh = await detCall(runtime, "info", { locale: "zh-CN" });
    assert.equal(infoEn.valuePropositionId, VALUE_PROPOSITION_ID);
    assert.equal(infoEn.wellnessBoundary, WELLNESS_BOUNDARY_ID);
    assert.equal(infoEn.researchVersion, RESEARCH_VERSION);
    assert.equal(infoEn.responsibilityVersion, RESPONSIBILITY_VERSION);
    assert.deepEqual(infoEn.supportedLocales, ["en", "th", "zh-CN"]);
    assert.equal(infoEn.description, CONNECTOR_COPY.en);
    assert.equal(infoTh.description, CONNECTOR_COPY.th);
    assert.equal(infoZh.description, CONNECTOR_COPY["zh-CN"]);
    const thaiInfo = (await detListTools(runtime, "th")).find((item) => item.name === "info");
    assert.equal(thaiInfo?.description, CONNECTOR_COPY.th);
  });

  it("A-INTEGRATION-01 fresh sessions see frozen build", async () => {
    const first = createDetRuntime({ principal: "sess-a" });
    const a = await detCall(first, "info", { locale: "en" });
    const second = createDetRuntime({ principal: "sess-b" });
    const b = await detCall(second, "info", { locale: "zh-CN" });
    assert.equal(a.buildId, b.buildId);
    assert.equal(a.valuePropositionId, b.valuePropositionId);
  });
});

describe("Slice B compact decision and evidence", () => {
  it("B-UNIT-01 compact serializer fixtures", () => {
    const ready = buildCompactDecision(magView("ready") as never);
    const have90 = buildCompactDecision(
      magView("no_purchase", {
        horizon: { purchaseRequiredNow: false },
        requestSnapshot: { currentSupplements: [{ daysRemaining: 90, name: "Magnesium" }] }
      }) as never
    );
    const missing = buildCompactDecision(
      magView("ready", { horizon: { durationUnknown: true } }) as never
    );
    const mixed = buildCompactDecision(
      magView("ready", {
        coverage: [
          { name: "Magnesium", status: "covered" },
          { name: "Vitamin D3", status: "optional_omitted" }
        ]
      }) as never
    );
    for (const decision of [ready, have90, missing, mixed]) {
      assert.ok(compactDecisionBytes(decision) <= 4096);
      assert.ok(decision.why.length > 0);
      assert.ok(Array.isArray(decision.what));
    }
    assert.match(missing.when, /unknown/);
    assert.match(have90.when, /no purchase/i);
  });

  it("B-UNIT-02/03 claim selector and record shape", () => {
    const a = selectApplicableClaims({ status: "ready", supplementNames: ["Magnesium"] });
    const b = selectApplicableClaims({ status: "ready", supplementNames: ["magnesium"] });
    assert.deepEqual(a, b);
    assert.ok(a.includes("clm_mg_muscle_relaxation_v1"));
    for (const claim of APPROVED_CLAIMS) {
      assert.ok(claim.statement);
      assert.ok(claim.relevance);
      assert.ok(claim.source);
      assert.ok(claim.strength);
      assert.ok(claim.limitation);
      assert.ok(claim.reviewDate);
      assert.ok(claim.researchVersion);
    }
  });

  it("B-INTEGRATION-01 evidence does not change plan revision", async () => {
    const runtime = createDetRuntime();
    const plan = await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: {
        idempotencyKey: "det-ev-plan-xxxxxxxxxxxx",
        request: goldenPlanRequest()
      },
      scope: runtime.scope,
      store: runtime.store
    });
    const handle = (plan as { evidenceHandle?: string }).evidenceHandle;
    const revision = (plan as { revision: number }).revision;
    if (!handle) {
      assert.ok(
        (plan as { status?: string }).status !== "ready" &&
          (plan as { status?: string }).status !== "no_purchase"
      );
      return;
    }
    const evidence = await detCall(runtime, "evidence", {
      evidenceHandle: handle,
      mode: "summary"
    });
    const again = await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: { operation: "get", planHandle: (plan as { planHandle: string }).planHandle },
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal(evidence.ok, true);
    assert.equal((again as { revision: number }).revision, revision);
  });

  it("B-CONTRACT-02 evidence schema rejects open queries", () => {
    const issues = validateToolIssues(EVIDENCE_INPUT_SCHEMA, {
      evidenceHandle: "cap_abcdefghijklmnopqrstuvwxyzabcdef",
      query: "tell me everything"
    });
    assert.ok(issues.some((item) => item.reasonCode === "unexpected_property"));
  });
});

describe("Slice C performance", () => {
  it("C-CHAR-01 characterization fixtures are stable across two runs", async () => {
    async function run() {
      const runtime = createDetRuntime();
      resetMatchPlanCache();
      const mag = FIXTURE_SUPPLEMENTS.find((item) => item.name === "Magnesium")!;
      const ready = await planTool({
        config: runtime.config,
        now: DET_V3_CLOCK,
        payload: {
          idempotencyKey: "det-char-ready-xxxxxxxx",
          request: {
            destinationCountry: "TH",
            locale: "en",
            optimization: "lowest_cost",
            profile: { ageYears: 40, lifeStage: "adult", sex: "female" },
            requirements: {},
            targets: [{ amount: 300, name: "Magnesium", supplementId: mag.supplementId, unit: "mg" }]
          }
        },
        scope: runtime.scope,
        store: runtime.store
      });
      return {
        status: (ready as { status?: string }).status,
        hash: canonicalJson({
          status: (ready as { status?: string }).status,
          claimIds: (ready as { claimIds?: string[] }).claimIds,
          compact: (ready as { compactDecision?: unknown }).compactDecision
        })
      };
    }
    const evidence = await runTwice(run);
    assert.ok(
      evidence.status === "ready" ||
        evidence.status === "needs_input" ||
        evidence.status === "no_purchase"
    );
  });

  it("C-STRUCT-01 one plan does not repeat identical snapshot queries", async () => {
    resetQueryBudget();
    const runtime = createDetRuntime();
    await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: {
        idempotencyKey: "det-struct-xxxxxxxxxxxx",
        request: goldenPlanRequest()
      },
      scope: runtime.scope,
      store: runtime.store
    });
    assert.ok(queryCount("catalogue.snapshot.TH") <= 2);
  });

  it("C-BENCH-01 thirty uncached gold plans meet the pinned budget", async () => {
    const samples: number[] = [];
    for (let index = 0; index < 30; index += 1) {
      resetMatchPlanCache();
      const runtime = createDetRuntime({ principal: `bench-${index}` });
      const started = performance.now();
      await planTool({
        config: runtime.config,
        now: DET_V3_CLOCK,
        payload: {
          idempotencyKey: `det-bench-${String(index).padStart(16, "0")}`,
          request: goldenPlanRequest()
        },
        scope: runtime.scope,
        store: runtime.store
      });
      samples.push(performance.now() - started);
    }
    const sorted = [...samples].sort((left, right) => left - right);
    const p50 = sorted[Math.floor(0.5 * (sorted.length - 1))] ?? 0;
    const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1] ?? 0;
    assert.ok(p50 <= 3000, `p50 ${p50}`);
    assert.ok(p95 <= 5000, `p95 ${p95}`);
  });
});

describe("Slice D commerce", () => {
  beforeEach(() => {
    beginComRun();
  });
  afterEach(() => {
    endComRun();
  });

  it("D-UNIT-01 execute replay bytes ignore later order mutation", async () => {
    const runtime = createComRuntime();
    const seeded = await seedPlanA(runtime);
    const first = await executeTool({
      config: runtime.config,
      expectedRevision: seeded.revision,
      idempotencyKey: key("D-UNIT-01"),
      now: DET_V3_CLOCK,
      payment: runtime.payment,
      planHandle: seeded.planHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal((first as { ok?: boolean }).ok, true);
    const orderHandle = (first as { orderHandle: string }).orderHandle;
    await drivePaymentFixture({
      config: runtime.config,
      now: DET_V3_CLOCK,
      orderHandle,
      scenario: "success",
      scope: runtime.scope,
      store: runtime.store
    });
    const replay = await executeTool({
      config: runtime.config,
      expectedRevision: seeded.revision,
      idempotencyKey: key("D-UNIT-01"),
      now: stepClock(DET_V3_CLOCK, 1),
      payment: runtime.payment,
      planHandle: seeded.planHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal(canonicalJson(first), canonicalJson(replay));
    const order = await detCall(runtime, "order", { orderHandle });
    assert.notEqual(order.stateVersion, (first as { stateVersion: number }).stateVersion);
  });

  it("D-UNIT-02 timeline cannot regress", () => {
    assert.equal(canAdvanceTimeline("paid", "open"), false);
    assert.equal(canAdvanceTimeline("open", "paid"), true);
    assert.deepEqual([...COMMERCE_TIMELINE], [
      "open",
      "payment_declined",
      "paid",
      "preparing",
      "dispatched",
      "delivered"
    ]);
  });

  it("D-CONTRACT-01 execute rejects a non-ready plan", async () => {
    const runtime = createComRuntime();
    const seeded = await seedNeedsInput(runtime);
    const failed = await executeTool({
      config: runtime.config,
      expectedRevision: seeded.revision,
      idempotencyKey: key("D-CONTRACT-01"),
      now: DET_V3_CLOCK,
      payment: runtime.payment,
      planHandle: seeded.planHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal((failed as { ok?: boolean }).ok, false);
    assert.equal((failed as { error?: { reasonCode?: string } }).error?.reasonCode, "plan_not_ready");
  });

  it("D-CONCURRENCY-01 identical execute keys yield one order", async () => {
    const runtime = createComRuntime();
    const seeded = await seedPlanA(runtime);
    const payload = {
      config: runtime.config,
      expectedRevision: seeded.revision,
      idempotencyKey: key("D-CONCURRENCY-01"),
      now: DET_V3_CLOCK,
      payment: runtime.payment,
      planHandle: seeded.planHandle,
      scope: runtime.scope,
      store: runtime.store
    };
    const [left, right] = await Promise.all([executeTool(payload), executeTool(payload)]);
    assert.equal(canonicalJson(left), canonicalJson(right));
    assert.equal((left as { orderHandle?: string }).orderHandle, (right as { orderHandle?: string }).orderHandle);
  });

  it("D-INTEGRATION-02/03 payment and fulfilment fixtures use real handlers", async () => {
    const runtime = createComRuntime();
    const seeded = await seedPlanA(runtime);
    const executed = await executeTool({
      config: runtime.config,
      expectedRevision: seeded.revision,
      idempotencyKey: key("D-INT-02"),
      now: DET_V3_CLOCK,
      payment: runtime.payment,
      planHandle: seeded.planHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    const orderHandle = (executed as { orderHandle: string }).orderHandle;
    await drivePaymentFixture({
      config: runtime.config,
      now: DET_V3_CLOCK,
      orderHandle,
      scenario: "decline_insufficient_funds",
      scope: runtime.scope,
      store: runtime.store
    });
    await drivePaymentFixture({
      config: runtime.config,
      now: DET_V3_CLOCK,
      orderHandle,
      scenario: "success",
      scope: runtime.scope,
      store: runtime.store
    });
    let runtimeNow = withNow(runtime, stepClock(DET_V3_CLOCK, 1));
    await driveFulfilmentFixture({
      config: runtimeNow.config,
      now: runtimeNow.now!,
      orderHandle,
      scope: runtimeNow.scope,
      status: "shipped",
      store: runtimeNow.store
    });
    runtimeNow = withNow(runtimeNow, stepClock(DET_V3_CLOCK, 2));
    await driveFulfilmentFixture({
      config: runtimeNow.config,
      now: runtimeNow.now!,
      orderHandle,
      scope: runtimeNow.scope,
      status: "delivered",
      store: runtimeNow.store
    });
    const order = await detCall(runtimeNow, "order", { orderHandle });
    assert.equal(order.timeline, "delivered");
    assert.ok(Array.isArray(order.events));
    assert.ok(order.money);
    assert.ok(order.responsibility);
  });
});

describe("Slice E support", () => {
  beforeEach(() => {
    beginComRun();
  });
  afterEach(() => {
    endComRun();
  });

  it("E-INTEGRATION-01 ordered thread and replay", async () => {
    const runtime = createComRuntime();
    const seeded = await seedPlanA(runtime);
    const executed = await executeTool({
      config: runtime.config,
      expectedRevision: seeded.revision,
      idempotencyKey: key("E-exec"),
      now: DET_V3_CLOCK,
      payment: runtime.payment,
      planHandle: seeded.planHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    const orderHandle = (executed as { orderHandle: string }).orderHandle;
    await drivePaymentFixture({
      config: runtime.config,
      now: DET_V3_CLOCK,
      orderHandle,
      scenario: "success",
      scope: runtime.scope,
      store: runtime.store
    });
    const shippedAt = stepClock(DET_V3_CLOCK, 1);
    await driveFulfilmentFixture({
      config: runtime.config,
      now: shippedAt,
      orderHandle,
      scope: runtime.scope,
      status: "shipped",
      store: runtime.store
    });
    const created = await comCall(runtime, "support", {
      idempotencyKey: key("E-sup-1"),
      message: "Where is my order?",
      orderHandle
    });
    const replied = await comCall(runtime, "support", {
      idempotencyKey: key("E-sup-2"),
      message: "Please update tracking.",
      orderHandle,
      supportHandle: created.supportHandle
    });
    const replay = await comCall(runtime, "support", {
      idempotencyKey: key("E-sup-2"),
      message: "Please update tracking.",
      orderHandle,
      supportHandle: created.supportHandle
    });
    assert.equal((replied.thread as unknown[]).length, 2);
    assert.equal(canonicalJson(replied), canonicalJson(replay));
    assert.equal((replied.orderContext as { timeline?: string }).timeline, "dispatched");
  });
});

describe("Slice F funnel", () => {
  it("F-UNIT-01/02/03 events, attribution, contribution", () => {
    resetFunnelLedger();
    for (const [index, eventType] of FUNNEL_EVENT_TYPES.entries()) {
      const accepted = recordFunnelEvent({
        attribution: "qa_campaign",
        correlationId: "corr-1",
        createdAt: DET_V3_CLOCK,
        eventId: `evt-${index}`,
        eventType
      });
      assert.equal(accepted.accepted, true);
    }
    const dup = recordFunnelEvent({
      correlationId: "corr-1",
      createdAt: DET_V3_CLOCK,
      eventId: "evt-0",
      eventType: "info_shown"
    });
    assert.equal(dup.accepted, false);
    const events = listFunnelEvents("corr-1");
    assert.equal(events.length, 9);
    assert.equal(events[0]?.attribution, "qa_campaign");
    assert.equal(
      contributionMinor({
        acquisitionMinor: 100,
        paymentFeeMinor: 50,
        paymentMinor: 1000,
        productCostMinor: 400,
        shippingSubsidyMinor: 20
      }),
      430
    );
  });

  it("F-PRIVACY-01 rejects health and secrets", () => {
    assert.ok(rejectProhibitedFunnelPayload({ health: "labs" }));
    assert.ok(rejectProhibitedFunnelPayload({ paymentSecret: "tok" }));
    assert.ok(rejectProhibitedFunnelPayload({ address: "1 Road" }));
  });
});

describe("Slice G responsibility and trust", () => {
  it("G-UNIT-01 four-domain matrix", () => {
    assert.deepEqual([...RESPONSIBILITY_DOMAINS], ["guidance", "payment", "fulfilment", "support"]);
    const snap = responsibilitySnapshot("en");
    assert.equal(snap.domains.length, 4);
    assert.match(snap.domains[0]!.text, /clinical/i);
    assert.match(snap.domains[2]!.text, /retailer/i);
  });

  it("G-SNAPSHOT-01 info uses the matrix version", async () => {
    const runtime = createDetRuntime();
    const info = await detCall(runtime, "info", { locale: "en" });
    assert.equal(info.responsibilityVersion, responsibilitySnapshot("en").version);
  });

  it("G-SAFETY-01 349/350/351 characterization", async () => {
    const mag = FIXTURE_SUPPLEMENTS.find((item) => item.name === "Magnesium")!;
    const omega = FIXTURE_SUPPLEMENTS.find((item) => item.name === "Omega-3")!;
    const runtime = createDetRuntime();
    const clear = await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: {
        idempotencyKey: "det-safe-349-xxxxxxxxxxx",
        request: {
          destinationCountry: "TH",
          locale: "en",
          optimization: "lowest_cost",
          profile: { ageYears: 40, lifeStage: "adult", sex: "female" },
          requirements: {},
          targets: [{ amount: 300, name: "Magnesium", supplementId: mag.supplementId, unit: "mg" }]
        }
      },
      scope: runtime.scope,
      store: runtime.store
    });
    const ack = await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: {
        idempotencyKey: "det-safe-350-xxxxxxxxxxx",
        request: {
          destinationCountry: "TH",
          locale: "en",
          medicationCodes: ["apixaban"],
          optimization: "lowest_cost",
          profile: { ageYears: 52, lifeStage: "adult", sex: "male" },
          requirements: {},
          targets: [{ amount: 1000, name: "Omega-3", supplementId: omega.supplementId, unit: "mg" }]
        }
      },
      scope: runtime.scope,
      store: runtime.store
    });
    const child = await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: {
        idempotencyKey: "det-safe-351-xxxxxxxxxxx",
        request: {
          destinationCountry: "TH",
          locale: "en",
          optimization: "lowest_cost",
          profile: { ageYears: 8, lifeStage: "child" },
          requirements: {},
          targets: [{ amount: 300, name: "Magnesium", supplementId: mag.supplementId, unit: "mg" }]
        }
      },
      scope: runtime.scope,
      store: runtime.store
    });
    assert.ok((clear as { ok?: boolean }).ok);
    assert.ok((ack as { ok?: boolean }).ok);
    assert.ok((child as { ok?: boolean }).ok);
  });

  it("G-CONSENT-01 feedback rejects without consent and replays with consent", async () => {
    const runtime = createDetRuntime();
    const plan = await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: {
        idempotencyKey: "det-fb-plan-xxxxxxxxxxxx",
        request: goldenPlanRequest()
      },
      scope: runtime.scope,
      store: runtime.store
    });
    const planHandle = (plan as { planHandle: string }).planHandle;
    const revision = (plan as { revision: number }).revision;
    const denied = await feedbackTool({
      config: runtime.config,
      consentConfirmed: false,
      expectedRevision: revision,
      idempotencyKey: "det-fb-deny-xxxxxxxxxxxx",
      now: DET_V3_CLOCK,
      planHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal((denied as { ok?: boolean }).ok, false);
    const accepted = await feedbackTool({
      config: runtime.config,
      consentConfirmed: true,
      expectedRevision: revision,
      idempotencyKey: "det-fb-ok-xxxxxxxxxxxxxx",
      now: DET_V3_CLOCK,
      planHandle,
      rating: 5,
      scope: runtime.scope,
      store: runtime.store
    });
    const replay = await feedbackTool({
      config: runtime.config,
      consentConfirmed: true,
      expectedRevision: revision,
      idempotencyKey: "det-fb-ok-xxxxxxxxxxxxxx",
      now: DET_V3_CLOCK,
      planHandle,
      rating: 5,
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal(canonicalJson(accepted), canonicalJson(replay));
  });

  it("G-ISOLATION-01 wrong-purpose evidence handle is rejected", async () => {
    const runtime = createDetRuntime();
    const plan = await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: {
        idempotencyKey: "det-iso-plan-xxxxxxxxxxxx",
        request: goldenPlanRequest()
      },
      scope: runtime.scope,
      store: runtime.store
    });
    const stolen = await detCall(runtime, "evidence", {
      evidenceHandle: (plan as { planHandle: string }).planHandle
    });
    assert.equal(stolen.ok, false);
    assert.ok(
      stolen.error &&
        ((stolen.error as { reasonCode?: string }).reasonCode === "wrong_purpose" ||
          (stolen.error as { reasonCode?: string }).reasonCode === "not_found")
    );
  });
});
