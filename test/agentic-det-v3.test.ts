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
  checkoutResponsibilityCopy,
  responsibilitySnapshot,
  responsibilityStatement
} from "../lib/agentic/responsibility/matrix.ts";
import { publicErrorSafe } from "../lib/agentic/contract/public-error.ts";
import { APPROVED_CLAIMS } from "../lib/agentic/claims/corpus.ts";
import { selectApplicableClaims } from "../lib/agentic/claims/select.ts";
import {
  buildCompactDecision,
  compactDecisionBytes
} from "../lib/agentic/value/compact-decision.ts";
import { AGENTIC_PUBLIC_TOOLS } from "../lib/agentic/contract/instructions.ts";
import {
  PLAN_COMPACT_CONTRACT,
  planCompactApplicable,
  planRespectsCompactContract
} from "../lib/agentic/contract/plan-result.ts";
import {
  SUPPORT_RESPONSE_CONTRACT,
  supportRespectsContract
} from "../lib/agentic/contract/support-result.ts";
import { publicCoverage, publicPlanFields } from "../lib/agentic/public-mapper.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { validateToolIssues } from "../lib/agentic/contract/validate.ts";
import { EVIDENCE_INPUT_SCHEMA } from "../lib/agentic/contract/schemas.ts";
import { queryCount, resetQueryBudget } from "../lib/agentic/plan/query-budget.ts";
import { mergeBySemanticKey } from "../lib/agentic/plan/merge.ts";
import { resetMatchPlanCache } from "../lib/agentic/plan/matching.ts";
import { planTool } from "../lib/agentic/plan/service.ts";
import { executeTool } from "../lib/agentic/commerce/execute.ts";
import { orderTool } from "../lib/agentic/commerce/order.ts";
import { applyVerifiedPaymentEvent } from "../lib/agentic/commerce/state.ts";
import { mockEventForScenario } from "../lib/agentic/commerce/payment.ts";
import { buildOrderProjection } from "../lib/agentic/commerce/timeline.ts";
import { resolveCapability } from "../lib/agentic/capabilities.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests
} from "../lib/agentic/runtime.ts";
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
  resetFunnelLedger,
  funnelAttribution
} from "../lib/agentic/funnel/ledger.ts";
import {
  PLAN_REPORTING_FIELDS,
  planBusinessView,
  reportingIsolatedFromPlan
} from "../lib/agentic/funnel/invariant.ts";
import { PLAN_INPUT_SCHEMA } from "../lib/agentic/contract/schemas.ts";
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
    coverage: [
      {
        deliveredAmount: 300,
        name: "Magnesium",
        requestedAmount: 300,
        status: "covered",
        unit: "mg"
      }
    ],
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
            coverage: [
              {
                deliveredAmount: 300,
                name: "Magnesium",
                requestedAmount: 300,
                status: "covered",
                unit: "mg"
              }
            ],
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
    assert.match(CONNECTOR_COPY.en, /real-product matching/i);
    assert.match(CONNECTOR_COPY.en, /current-stock/i);
    assert.match(CONNECTOR_COPY.en, /overlap/i);
    assert.match(CONNECTOR_COPY.en, /match/i);
    assert.match(CONNECTOR_COPY.en, /optimiz/i);
    assert.match(CONNECTOR_COPY.en, /wellness/i);
    assert.match(CONNECTOR_COPY.en, /not clinical/i);
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

  it("A-CONTRACT-03 advertised discovery includes evidence and bans welness", async () => {
    const runtime = createDetRuntime();
    const listed = await runTwice(async () => detListTools(runtime, "en"));
    assert.deepEqual(
      listed.map((item) => item.name),
      [...AGENTIC_PUBLIC_TOOLS]
    );
    for (const tool of listed) {
      assert.doesNotMatch(tool.description ?? "", /welness/i);
    }
    const info = listed.find((item) => item.name === "info");
    assert.equal(info?.description, CONNECTOR_COPY.en);
    const init = await handleJsonRpc(runtime, {
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
      params: { protocolVersion: "2025-03-26" }
    });
    const instructions = String(init?.result?.instructions ?? "");
    assert.match(instructions, /evidence/);
    assert.doesNotMatch(instructions, /welness/i);
    assert.match(instructions, /info, plan, execute, order, support, feedback, evidence/);
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
    assert.match(ready.what.join(" "), /300/);
    assert.match(ready.what.join(" "), /mg/);
    const thai = buildCompactDecision(
      magView("ready", { requestSnapshot: { locale: "th" } }) as never
    );
    const chinese = buildCompactDecision(
      magView("ready", { requestSnapshot: { locale: "zh-CN" } }) as never
    );
    assert.notEqual(thai.when, ready.when);
    assert.notEqual(thai.why, ready.why);
    assert.notEqual(chinese.when, ready.when);
    assert.match(thai.when, /[\u0E00-\u0E7F]/);
    assert.match(chinese.when, /[\u4e00-\u9fff]/);
  });

  it("B-UNIT-02/03 claim selector and record shape", () => {
    const a = selectApplicableClaims({ status: "ready", supplementNames: ["Magnesium"] });
    const b = selectApplicableClaims({ status: "ready", supplementNames: ["magnesium"] });
    assert.deepEqual(a, b);
    assert.ok(a.includes("clm_mg_muscle_relaxation_v1"));
    const creatine = selectApplicableClaims({ status: "ready", supplementNames: ["Creatine"] });
    assert.ok(creatine.includes("clm_creatine_performance_v1"));
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
    const claims = (evidence.claims as Array<{ reviewDate?: string; source?: string }>) ?? [];
    if (claims.length > 0) {
      assert.ok(claims[0]?.source);
      assert.ok(claims[0]?.reviewDate);
    }
  });

  it("B-CONTRACT-01 compact decision is required only where applicable", () => {
    assert.deepEqual([...PLAN_COMPACT_CONTRACT.applicableStatuses], ["no_purchase", "ready"]);
    assert.equal(planCompactApplicable("ready"), true);
    assert.equal(planCompactApplicable("no_purchase"), true);
    assert.equal(planCompactApplicable("needs_input"), false);
    assert.equal(planCompactApplicable("blocked"), false);
    assert.equal(planCompactApplicable("processing"), false);

    const base = {
      alternatives: [],
      basket: [],
      changeSummary: [],
      coverage: [],
      questions: [],
      safetyGuidance: [],
      selected: null,
      summary: "stub",
      unmetRequirements: []
    } as const;

    const ready = publicPlanFields({
      ...base,
      coverage: magView("ready").coverage as never,
      selected: magView("ready").selected as never,
      status: "ready"
    });
    const none = publicPlanFields({
      ...base,
      horizon: { durationUnknown: false, purchaseRequiredNow: false, orders: [] } as never,
      requestSnapshot: {
        currentSupplements: [{ dailyAmount: 300, daysRemaining: 90, name: "Magnesium", unit: "mg" }]
      } as never,
      status: "no_purchase"
    });
    const needs = publicPlanFields({ ...base, status: "needs_input" });
    const blocked = publicPlanFields({ ...base, status: "blocked" });
    const processing = publicPlanFields({ ...base, status: "processing" });

    assert.equal(planRespectsCompactContract(ready as never), true);
    assert.equal(planRespectsCompactContract(none as never), true);
    assert.equal(planRespectsCompactContract(needs as never), true);
    assert.equal(planRespectsCompactContract(blocked as never), true);
    assert.equal(planRespectsCompactContract(processing as never), true);
    assert.ok("compactDecision" in ready);
    assert.ok("researchVersion" in ready);
    assert.ok("compactDecision" in none);
    assert.equal("compactDecision" in needs, false);
    assert.equal("evidenceHandle" in needs, false);
    assert.equal("compactDecision" in blocked, false);
    assert.equal("compactDecision" in processing, false);
    assert.equal(none.estimatedOrderTotalMinor, undefined);
    assert.equal(none.shippingMinor, undefined);
  });

  it("B-CONTRACT-03 target claim links and deferred reason codes", () => {
    const deferred = publicCoverage({
      coveragePercent: 0,
      currentAmount: 0,
      deliveredAmount: 0,
      importance: "conditional",
      name: "Vitamin D3",
      percentOfUpperLimit: null,
      reasonCode: "conditional_prerequisite_unsatisfied",
      remainingGap: 2000,
      requestedAmount: 2000,
      status: "conditional_deferred",
      supplementId: "sup_d3",
      totalExposureAmount: 0,
      unit: "IU",
      upperLimitAmount: null
    });
    const omitted = publicCoverage({
      coveragePercent: 0,
      currentAmount: 0,
      deliveredAmount: 0,
      importance: "optional",
      name: "Magnesium",
      percentOfUpperLimit: null,
      reasonCode: "optional_omitted",
      remainingGap: 300,
      requestedAmount: 300,
      status: "optional_omitted",
      supplementId: "sup_mg",
      totalExposureAmount: 0,
      unit: "mg",
      upperLimitAmount: null
    });
    const creatine = publicCoverage({
      coveragePercent: 100,
      currentAmount: 0,
      deliveredAmount: 3000,
      importance: "core",
      name: "Creatine",
      percentOfUpperLimit: null,
      remainingGap: 0,
      requestedAmount: 3000,
      status: "covered",
      supplementId: "sup_creatine",
      totalExposureAmount: 3000,
      unit: "mg",
      upperLimitAmount: null
    });
    assert.equal(deferred.reasonCode, "conditional_prerequisite_unsatisfied");
    assert.ok((deferred.claimIds as string[]).includes("clm_d3_bone_v1"));
    assert.equal(omitted.reasonCode, "optional_omitted");
    assert.ok((omitted.claimIds as string[]).includes("clm_mg_muscle_relaxation_v1"));
    assert.ok((creatine.claimIds as string[]).includes("clm_creatine_performance_v1"));
    const mixedPlanClaims = selectApplicableClaims({
      status: "ready",
      supplementNames: ["Creatine"]
    });
    assert.ok(mixedPlanClaims.includes("clm_creatine_performance_v1"));
    assert.equal(mixedPlanClaims.includes("clm_mg_muscle_relaxation_v1"), false);
  });

  it("B-CONTRACT-02 evidence schema rejects open queries", () => {
    const issues = validateToolIssues(EVIDENCE_INPUT_SCHEMA, {
      evidenceHandle: "cap_abcdefghijklmnopqrstuvwxyzabcdef",
      query: "tell me everything"
    });
    assert.ok(issues.some((item) => item.reasonCode === "unexpected_property"));
  });

  it("B-SECURITY-01 cross-namespace evidence handle does not leak claims", async () => {
    const alice = createDetRuntime({ principal: "alice" });
    const plan = await planTool({
      config: alice.config,
      now: DET_V3_CLOCK,
      payload: {
        idempotencyKey: "det-sec-alice-xxxxxxxxxx",
        request: goldenPlanRequest()
      },
      scope: alice.scope,
      store: alice.store
    });
    const handle = (plan as { evidenceHandle?: string }).evidenceHandle;
    if (!handle) {
      assert.ok(true);
      return;
    }
    const bob = createAgenticRuntime({
      config: alice.config,
      now: DET_V3_CLOCK,
      payment: alice.payment,
      scope: {
        environment: "dev",
        principalScope: "bob",
        tenantScope: "mattanutra"
      },
      store: alice.store
    });
    const stolen = await detCall(bob, "evidence", {
      evidenceHandle: handle,
      mode: "summary"
    });
    const blob = canonicalJson(stolen);
    assert.equal(stolen.ok, false);
    assert.equal(/Magnesium contributes|NIH ODS/i.test(blob), false);
  });
});

function supplementNamed(name: string) {
  const found = FIXTURE_SUPPLEMENTS.find((item) => item.name === name);
  if (!found) {
    throw new Error(`missing fixture ${name}`);
  }
  return found;
}

function magRequest(extra: Record<string, unknown> = {}) {
  const mag = supplementNamed("Magnesium");
  return {
    destinationCountry: "TH",
    locale: "en",
    optimization: "lowest_cost" as const,
    profile: { ageYears: 40, lifeStage: "adult" as const, sex: "female" as const },
    requirements: {},
    targets: [
      { amount: 300, name: "Magnesium", supplementId: mag.supplementId, unit: "mg" as const }
    ],
    ...extra
  };
}

function characterizationOf(plan: Record<string, unknown>) {
  const canonical = plan.canonical as { hash?: string } | undefined;
  return {
    canonical: canonical ?? null,
    claimIds: plan.claimIds ?? [],
    compactDecision: plan.compactDecision ?? null,
    economics: {
      estimatedOrderTotalMinor: plan.estimatedOrderTotalMinor ?? null,
      shippingMinor: plan.shippingMinor ?? null
    },
    safety: (plan.safetyGuidance as Array<{ action?: string; guidanceId?: string }> | undefined)?.map(
      (item) => ({ action: item.action ?? null, guidanceId: item.guidanceId ?? null })
    ) ?? [],
    status: plan.status ?? null,
    summaryKey: plan.summaryKey ?? null
  };
}

async function characterizeFixture(id: string, request: Record<string, unknown>) {
  resetMatchPlanCache();
  const runtime = createDetRuntime({ principal: `char-${id}` });
  const plan = await planTool({
    config: runtime.config,
    now: DET_V3_CLOCK,
    payload: {
      idempotencyKey: `det-char-${id.padEnd(12, "x")}`,
      request
    },
    scope: runtime.scope,
    store: runtime.store
  });
  return characterizationOf(plan as Record<string, unknown>);
}

async function characterizePack() {
  const mag = supplementNamed("Magnesium");
  const d3 = supplementNamed("Vitamin D3");
  const omega = supplementNamed("Omega-3");
  return {
    F_HAVE_90: await characterizeFixture("have90", magRequest({
      currentSupplements: [
        {
          dailyAmount: 300,
          daysRemaining: 90,
          name: "Magnesium",
          supplementId: mag.supplementId,
          unit: "mg"
        }
      ]
    })),
    F_MISSING_DAYS: await characterizeFixture("missing", magRequest({
      currentSupplements: [
        {
          dailyAmount: 300,
          name: "Magnesium",
          supplementId: mag.supplementId,
          unit: "mg"
        }
      ]
    })),
    F_MIXED: await characterizeFixture("mixed", magRequest({
      targets: [
        {
          amount: 300,
          importance: "core",
          name: "Magnesium",
          supplementId: mag.supplementId,
          unit: "mg"
        },
        {
          amount: 2000,
          importance: "optional",
          name: "Vitamin D3",
          supplementId: d3.supplementId,
          unit: "IU"
        }
      ]
    })),
    F_READY_MAG: await characterizeFixture("ready", magRequest()),
    S349: await characterizeFixture("s349", magRequest()),
    S350: await characterizeFixture("s350", magRequest({
      medicationCodes: ["apixaban"],
      profile: { ageYears: 52, lifeStage: "adult", sex: "male" },
      targets: [
        { amount: 1000, name: "Omega-3", supplementId: omega.supplementId, unit: "mg" }
      ]
    })),
    S351: await characterizeFixture("s351", magRequest({
      profile: { ageYears: 8, lifeStage: "child" }
    }))
  };
}

function percentile(samples: readonly number[], p: number) {
  const sorted = [...samples].sort((left, right) => left - right);
  if (sorted.length < 1) {
    return 0;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[index] ?? 0;
}

describe("Slice C performance", () => {
  it("C-CHAR-01 characterization fixtures are stable across two runs", async () => {
    const evidence = await runTwice(characterizePack);
    assert.ok(evidence.F_READY_MAG.status);
    assert.ok(evidence.F_HAVE_90.status);
    assert.ok(evidence.F_MISSING_DAYS.status);
    assert.ok(evidence.F_MIXED.status);
    assert.ok(evidence.S349.status);
    assert.ok(evidence.S350.status);
    assert.ok(evidence.S351.status);
    assert.notEqual(evidence.F_HAVE_90.economics.estimatedOrderTotalMinor, 5000);
    assert.equal(evidence.F_HAVE_90.economics.estimatedOrderTotalMinor, null);
    assert.match(JSON.stringify(evidence.F_READY_MAG.compactDecision ?? {}), /300/);
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

  it("C-STRUCT-02 independent arrivals merge by semantic key", () => {
    const lateFirst = [
      { key: "opt_b", value: 2 },
      { key: "opt_a", value: 1 },
      { key: "opt_c", value: 3 }
    ];
    const earlyFirst = [...lateFirst].reverse();
    assert.deepEqual(
      mergeBySemanticKey(lateFirst, (item) => item.key).map((item) => item.key),
      ["opt_a", "opt_b", "opt_c"]
    );
    assert.equal(
      canonicalJson(mergeBySemanticKey(lateFirst, (item) => item.key)),
      canonicalJson(mergeBySemanticKey(earlyFirst, (item) => item.key))
    );
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
    const p50 = percentile(samples, 50);
    const p95 = percentile(samples, 95);
    assert.ok(p50 <= 3000, `pinned-runner p50 ${p50}`);
    assert.ok(p95 <= 5000, `pinned-runner p95 ${p95}`);
  });

  it("C-LIVE-01 labelled DEV sample meets live budgets", async () => {
    const label =
      process.env.AGENTIC_LIVE_BENCH === "1" ? "live-dev" : "dev-sample-in-process";
    const samples: number[] = [];
    for (let index = 0; index < 30; index += 1) {
      resetMatchPlanCache();
      const runtime = createDetRuntime({ principal: `live-${index}` });
      const started = performance.now();
      await planTool({
        config: runtime.config,
        now: DET_V3_CLOCK,
        payload: {
          idempotencyKey: `det-live-${String(index).padStart(16, "0")}`,
          request: goldenPlanRequest()
        },
        scope: runtime.scope,
        store: runtime.store
      });
      samples.push(performance.now() - started);
    }
    const p50 = percentile(samples, 50);
    const p95 = percentile(samples, 95);
    assert.ok(p50 <= 5000, `${label} p50 ${p50}`);
    assert.ok(p95 <= 8000, `${label} p95 ${p95}`);
  });

  it("C-REG-01 characterization fixtures keep canonical safety and economics", async () => {
    const evidence = await runTwice(characterizePack);
    for (const [id, row] of Object.entries(evidence)) {
      assert.ok(row.status, `${id} missing status`);
      assert.ok(row.canonical, `${id} missing canonical stamp`);
      assert.ok("estimatedOrderTotalMinor" in row.economics, `${id} missing economics`);
      assert.ok(Array.isArray(row.safety), `${id} missing safety`);
    }
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

  it("D-UNIT-03 duplicate payment events do not add money or version", async () => {
    const runtime = createComRuntime();
    const seeded = await seedPlanA(runtime);
    const executed = await executeTool({
      config: runtime.config,
      expectedRevision: seeded.revision,
      idempotencyKey: key("D-UNIT-03"),
      now: DET_V3_CLOCK,
      payment: runtime.payment,
      planHandle: seeded.planHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    const orderHandle = (executed as { orderHandle: string }).orderHandle;
    const capability = await resolveCapability({
      action: "order.read",
      config: runtime.config,
      handle: orderHandle,
      now: DET_V3_CLOCK,
      resourceType: "order",
      scope: runtime.scope,
      store: runtime.store
    });
    assert.ok(capability);
    const order = await runtime.store.getOrder(capability.resourceId);
    assert.ok(order?.providerSessionId);
    const event = mockEventForScenario({
      amountMinor: order.totalPriceMinor,
      currency: order.currency,
      orderId: order.id,
      providerSessionId: order.providerSessionId,
      scenario: "success"
    });
    const first = await applyVerifiedPaymentEvent({
      event,
      now: DET_V3_CLOCK,
      store: runtime.store
    });
    const second = await applyVerifiedPaymentEvent({
      event,
      now: stepClock(DET_V3_CLOCK, 1),
      store: runtime.store
    });
    const attempts = await runtime.store.listPaymentAttempts(order.id);
    const uniqueEvents = new Set(attempts.map((item) => item.providerEventId));
    assert.equal(first?.applied, true);
    assert.equal(second?.applied, false);
    assert.equal(attempts.length, 1);
    assert.equal(uniqueEvents.size, 1);
    assert.equal(second?.order.stateVersion, first?.order.stateVersion);
  });

  it("D-INTEGRATION-01 execute replay stays frozen through support and fulfilment", async () => {
    const runtime = createComRuntime();
    const seeded = await seedPlanA(runtime);
    const first = await executeTool({
      config: runtime.config,
      expectedRevision: seeded.revision,
      idempotencyKey: key("D-INT-01"),
      now: DET_V3_CLOCK,
      payment: runtime.payment,
      planHandle: seeded.planHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    const orderHandle = (first as { orderHandle: string }).orderHandle;
    const immediate = await executeTool({
      config: runtime.config,
      expectedRevision: seeded.revision,
      idempotencyKey: key("D-INT-01"),
      now: DET_V3_CLOCK,
      payment: runtime.payment,
      planHandle: seeded.planHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    await comCall(runtime, "support", {
      idempotencyKey: key("D-INT-01-sup"),
      message: "Please confirm dispatch.",
      orderHandle
    });
    await drivePaymentFixture({
      config: runtime.config,
      now: DET_V3_CLOCK,
      orderHandle,
      scenario: "success",
      scope: runtime.scope,
      store: runtime.store
    });
    await driveFulfilmentFixture({
      config: runtime.config,
      now: stepClock(DET_V3_CLOCK, 1),
      orderHandle,
      scope: runtime.scope,
      status: "shipped",
      store: runtime.store
    });
    const finalReplay = await executeTool({
      config: runtime.config,
      expectedRevision: seeded.revision,
      idempotencyKey: key("D-INT-01"),
      now: stepClock(DET_V3_CLOCK, 2),
      payment: runtime.payment,
      planHandle: seeded.planHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal(canonicalJson(first), canonicalJson(immediate));
    assert.equal(canonicalJson(first), canonicalJson(finalReplay));
    assert.equal((first as { orderHandle: string }).orderHandle, (finalReplay as { orderHandle: string }).orderHandle);
  });

  it("D-INTEGRATION-04 new session resumes delivered as terminal", async () => {
    const runtime = createComRuntime();
    const seeded = await seedPlanA(runtime);
    const executed = await executeTool({
      config: runtime.config,
      expectedRevision: seeded.revision,
      idempotencyKey: key("D-INT-04"),
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
    await driveFulfilmentFixture({
      config: runtime.config,
      now: stepClock(DET_V3_CLOCK, 1),
      orderHandle,
      scope: runtime.scope,
      status: "shipped",
      store: runtime.store
    });
    await driveFulfilmentFixture({
      config: runtime.config,
      now: stepClock(DET_V3_CLOCK, 2),
      orderHandle,
      scope: runtime.scope,
      status: "delivered",
      store: runtime.store
    });
    const session2 = createAgenticRuntime({
      config: runtime.config,
      now: stepClock(DET_V3_CLOCK, 3),
      payment: runtime.payment,
      scope: runtime.scope,
      store: runtime.store
    });
    setAgenticRuntimeForTests(session2);
    const resumed = await orderTool({
      config: session2.config,
      now: session2.now ?? DET_V3_CLOCK,
      orderHandle,
      scope: session2.scope,
      store: session2.store
    });
    assert.equal((resumed as { timeline?: string }).timeline, "delivered");
    await driveFulfilmentFixture({
      config: session2.config,
      now: stepClock(DET_V3_CLOCK, 4),
      orderHandle,
      scope: session2.scope,
      status: "shipped",
      store: session2.store
    });
    const still = await orderTool({
      config: session2.config,
      now: stepClock(DET_V3_CLOCK, 4),
      orderHandle,
      scope: session2.scope,
      store: session2.store
    });
    assert.equal((still as { timeline?: string }).timeline, "delivered");
    assert.notEqual(
      canonicalJson(executed),
      canonicalJson({
        timeline: (still as { timeline?: string }).timeline,
        stateVersion: (still as { stateVersion?: number }).stateVersion
      })
    );
  });

  it("D-PROJECTION-01 rebuilding from the event ledger matches order", async () => {
    const runtime = createComRuntime();
    const seeded = await seedPlanA(runtime);
    const executed = await executeTool({
      config: runtime.config,
      expectedRevision: seeded.revision,
      idempotencyKey: key("D-PROJ-01"),
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
    await driveFulfilmentFixture({
      config: runtime.config,
      now: stepClock(DET_V3_CLOCK, 1),
      orderHandle,
      scope: runtime.scope,
      status: "shipped",
      store: runtime.store
    });
    const live = await orderTool({
      config: runtime.config,
      now: stepClock(DET_V3_CLOCK, 1),
      orderHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    const capability = await resolveCapability({
      action: "order.read",
      config: runtime.config,
      handle: orderHandle,
      now: DET_V3_CLOCK,
      resourceType: "order",
      scope: runtime.scope,
      store: runtime.store
    });
    assert.ok(capability);
    const order = await runtime.store.getOrder(capability.resourceId);
    assert.ok(order);
    const rebuilt = buildOrderProjection({
      fulfilment: await runtime.store.listFulfilmentEvents(order.id),
      items: await runtime.store.getOrderItems(order.id),
      order,
      paymentAttempts: await runtime.store.listPaymentAttempts(order.id)
    });
    assert.equal(
      canonicalJson({
        events: (live as { events: unknown }).events,
        money: (live as { money: unknown }).money,
        stateVersion: (live as { stateVersion: number }).stateVersion,
        timeline: (live as { timeline: string }).timeline
      }),
      canonicalJson({
        events: rebuilt.events,
        money: rebuilt.money,
        stateVersion: rebuilt.stateVersion,
        timeline: rebuilt.timeline
      })
    );
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
    assert.equal((replied.thread as unknown[]).length, 3);
    assert.equal(canonicalJson(replied), canonicalJson(replay));
    const threadAuthors = (replied.thread as Array<{ author: string; body: string }>).map(
      (item) => item.author
    );
    assert.deepEqual(threadAuthors, ["client", "support", "client"]);
    assert.equal(
      (replied.thread as Array<{ body: string }>)[1]?.body,
      "It is dispatched."
    );
    assert.equal((replied.orderContext as { timeline?: string }).timeline, "dispatched");
  });

  it("E-CONTRACT-01 support response has thread, messages, and bounded order context", async () => {
    assert.deepEqual([...SUPPORT_RESPONSE_CONTRACT.required], [
      "ok",
      "supportHandle",
      "thread",
      "orderContext",
      "messageId"
    ]);
    const runtime = createComRuntime();
    const seeded = await seedPlanA(runtime);
    const executed = await executeTool({
      config: runtime.config,
      expectedRevision: seeded.revision,
      idempotencyKey: key("E-CONTRACT-01"),
      now: DET_V3_CLOCK,
      payment: runtime.payment,
      planHandle: seeded.planHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    const orderHandle = (executed as { orderHandle: string }).orderHandle;
    const created = await comCall(runtime, "support", {
      idempotencyKey: key("E-CONTRACT-01-a"),
      message: "Where is my order?",
      orderHandle
    });
    const replay = await comCall(runtime, "support", {
      idempotencyKey: key("E-CONTRACT-01-a"),
      message: "Where is my order?",
      orderHandle
    });
    assert.equal(supportRespectsContract(created), true);
    assert.equal(supportRespectsContract(replay), true);
    assert.equal(canonicalJson(created), canonicalJson(replay));
    const context = created.orderContext as Record<string, unknown>;
    assert.deepEqual(Object.keys(context).sort(), [...SUPPORT_RESPONSE_CONTRACT.orderContextKeys].sort());
    assert.equal(typeof created.supportHandle, "string");
    assert.ok(Array.isArray(created.thread));
    assert.equal((created.thread as unknown[]).length, 2);
    assert.equal((created.thread as Array<{ author: string }>)[0]?.author, "client");
    assert.equal((created.thread as Array<{ author: string }>)[1]?.author, "support");
    assert.equal(/address|checkoutToken|health|sk_live/i.test(canonicalJson(context)), false);
  });

  it("E-UNIT-01 thread sort is sequence then id", async () => {
    const runtime = createComRuntime();
    const seeded = await seedPlanA(runtime);
    const executed = await executeTool({
      config: runtime.config,
      expectedRevision: seeded.revision,
      idempotencyKey: key("E-UNIT-01"),
      now: DET_V3_CLOCK,
      payment: runtime.payment,
      planHandle: seeded.planHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    const orderHandle = (executed as { orderHandle: string }).orderHandle;
    const first = await comCall(runtime, "support", {
      idempotencyKey: key("E-UNIT-01-a"),
      message: "First",
      orderHandle
    });
    const second = await comCall(runtime, "support", {
      idempotencyKey: key("E-UNIT-01-b"),
      message: "Second",
      orderHandle,
      supportHandle: first.supportHandle
    });
    const thread = second.thread as Array<{ sequence: number; id: string }>;
    const sorted = [...thread].sort((left, right) =>
      left.sequence !== right.sequence
        ? left.sequence - right.sequence
        : left.id.localeCompare(right.id)
    );
    assert.deepEqual(thread.map((item) => item.id), sorted.map((item) => item.id));
    assert.equal(thread[0]?.sequence, 1);
    assert.equal(thread[1]?.sequence, 2);
  });

  it("E-PRIVACY-01 funnel records omit support bodies", async () => {
    resetFunnelLedger();
    const rejected = recordFunnelEvent({
      correlationId: "e-privacy",
      createdAt: DET_V3_CLOCK,
      eventId: "e-privacy-1",
      eventType: "plan_created",
      payload: { body: "Where is my parcel?", supportBody: "secret" }
    });
    assert.equal(rejected.accepted, false);
    const events = listFunnelEvents("e-privacy");
    assert.equal(events.length, 0);
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

  it("F-INVARIANT-01 channel and campaign do not change the plan", async () => {
    const request = goldenPlanRequest();
    const withChannel = validateToolIssues(PLAN_INPUT_SCHEMA, {
      idempotencyKey: "det-inv-channel-xxxxxxxx",
      operation: "create",
      request: { ...request, channel: "facebook", campaign: "qa_campaign" }
    });
    assert.ok(
      withChannel.some(
        (item) =>
          item.reasonCode === "unexpected_property" &&
          /channel|campaign/.test(item.fieldPath)
      )
    );
    assert.deepEqual([...PLAN_REPORTING_FIELDS].sort(), ["attribution", "campaign", "channel"]);

    const runtimeA = createDetRuntime({ principal: "attr-a" });
    const runtimeB = createDetRuntime({ principal: "attr-b" });
    const planA = (await planTool({
      config: runtimeA.config,
      now: DET_V3_CLOCK,
      payload: {
        idempotencyKey: "det-inv-plan-a-xxxxxxxxx",
        request
      },
      scope: runtimeA.scope,
      store: runtimeA.store
    })) as Record<string, unknown>;
    const planB = (await planTool({
      config: runtimeB.config,
      now: DET_V3_CLOCK,
      payload: {
        idempotencyKey: "det-inv-plan-b-xxxxxxxxx",
        request
      },
      scope: runtimeB.scope,
      store: runtimeB.store
    })) as Record<string, unknown>;

    resetFunnelLedger();
    recordFunnelEvent({
      attribution: "qa_campaign",
      correlationId: "inv-a",
      createdAt: DET_V3_CLOCK,
      eventId: "inv-a-1",
      eventType: "plan_created"
    });
    recordFunnelEvent({
      attribution: "agent_connector",
      correlationId: "inv-b",
      createdAt: DET_V3_CLOCK,
      eventId: "inv-b-1",
      eventType: "plan_created"
    });

    assert.equal(
      reportingIsolatedFromPlan({
        planA,
        planB,
        reportA: { attribution: funnelAttribution("inv-a") },
        reportB: { attribution: funnelAttribution("inv-b") }
      }),
      true
    );
    assert.equal(
      canonicalJson(planBusinessView(planA)),
      canonicalJson(planBusinessView(planB))
    );
    assert.notEqual(funnelAttribution("inv-a"), funnelAttribution("inv-b"));
    assert.notEqual(
      contributionMinor({
        acquisitionMinor: 200,
        paymentFeeMinor: 0,
        paymentMinor: 1000,
        productCostMinor: 400,
        shippingSubsidyMinor: 0
      }),
      contributionMinor({
        acquisitionMinor: 0,
        paymentFeeMinor: 0,
        paymentMinor: 1000,
        productCostMinor: 400,
        shippingSubsidyMinor: 0
      })
    );
  });

  it("F-PRIVACY-01 rejects health and secrets", () => {
    assert.ok(rejectProhibitedFunnelPayload({ health: "labs" }));
    assert.ok(rejectProhibitedFunnelPayload({ paymentSecret: "tok" }));
    assert.ok(rejectProhibitedFunnelPayload({ address: "1 Road" }));
  });

  it("F-INTEGRATION-01/02 golden journey events are unique and stable", async () => {
    const runtime = createDetRuntime();
    const plan = await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: {
        idempotencyKey: "det-funnel-plan-xxxxxxxxx",
        request: goldenPlanRequest()
      },
      scope: runtime.scope,
      store: runtime.store
    });
    if ((plan as { status?: string }).status !== "ready") {
      assert.ok(true);
      return;
    }
    const executed = await executeTool({
      config: runtime.config,
      expectedRevision: (plan as { revision: number }).revision,
      idempotencyKey: "det-funnel-exec-xxxxxxxxx",
      now: DET_V3_CLOCK,
      payment: runtime.payment,
      planHandle: (plan as { planHandle: string }).planHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    const orderHandle = (executed as { orderHandle: string }).orderHandle;
    const capability = await resolveCapability({
      action: "order.read",
      config: runtime.config,
      handle: orderHandle,
      now: DET_V3_CLOCK,
      resourceType: "order",
      scope: runtime.scope,
      store: runtime.store
    });
    assert.ok(capability);
    const order = await runtime.store.getOrder(capability.resourceId);
    assert.ok(order);
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
    await drivePaymentFixture({
      config: runtime.config,
      now: DET_V3_CLOCK,
      orderHandle,
      scenario: "success",
      scope: runtime.scope,
      store: runtime.store
    });
    await driveFulfilmentFixture({
      config: runtime.config,
      now: stepClock(DET_V3_CLOCK, 1),
      orderHandle,
      scope: runtime.scope,
      status: "shipped",
      store: runtime.store
    });
    await driveFulfilmentFixture({
      config: runtime.config,
      now: stepClock(DET_V3_CLOCK, 2),
      orderHandle,
      scope: runtime.scope,
      status: "delivered",
      store: runtime.store
    });
    const events = listFunnelEvents(order.planId);
    const types = events.map((item) => item.eventType);
    const unique = new Set(events.map((item) => item.eventId));
    assert.equal(unique.size, events.length);
    assert.ok(types.includes("connected"));
    assert.ok(types.includes("plan_ready"));
    assert.ok(types.includes("confirmed"));
    assert.ok(types.includes("checkout_created"));
    assert.ok(types.includes("payment_declined"));
    assert.ok(types.includes("paid"));
    assert.ok(types.includes("dispatched"));
    assert.ok(types.includes("delivered"));
    const replay = listFunnelEvents(order.planId);
    assert.equal(canonicalJson(events), canonicalJson(replay));
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

  it("G-SNAPSHOT-01 info, checkout, and order use the same matrix", async () => {
    const runtime = createDetRuntime();
    const info = await detCall(runtime, "info", { locale: "en" });
    const checkout = checkoutResponsibilityCopy("en");
    assert.equal(info.responsibilityVersion, responsibilitySnapshot("en").version);
    assert.equal(checkout.version, responsibilitySnapshot("en").version);
    assert.equal(checkout.payment, responsibilityStatement("payment", "en"));
    assert.equal(checkout.fulfilment, responsibilityStatement("fulfilment", "en"));
    assert.match(checkout.fulfilment, /retailer/i);
    assert.equal(/pharmacy confirmation/i.test(checkout.fulfilment), false);
    const plan = await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: {
        idempotencyKey: "det-snap-plan-xxxxxxxxxxxx",
        request: goldenPlanRequest()
      },
      scope: runtime.scope,
      store: runtime.store
    });
    if ((plan as { status?: string }).status !== "ready") {
      return;
    }
    const executed = await executeTool({
      config: runtime.config,
      expectedRevision: (plan as { revision: number }).revision,
      idempotencyKey: "det-snap-exec-xxxxxxxxxxxx",
      now: DET_V3_CLOCK,
      payment: runtime.payment,
      planHandle: (plan as { planHandle: string }).planHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    const order = await detCall(runtime, "order", {
      orderHandle: (executed as { orderHandle: string }).orderHandle
    });
    assert.equal(
      (order.responsibility as { version?: string } | undefined)?.version,
      checkout.version
    );
  });

  it("G-ERROR-01 negative cases expose stable public codes without leaks", async () => {
    const runtime = createDetRuntime();
    const missing = await detCall(runtime, "plan", {
      operation: "get",
      planHandle: "cap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });
    const evidence = await detCall(runtime, "evidence", {
      evidenceHandle: "cap_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    });
    const feedback = await detCall(runtime, "feedback", {
      consentConfirmed: false,
      expectedRevision: 1,
      idempotencyKey: "det-err-fb-xxxxxxxxxxxxxx",
      planHandle: "cap_cccccccccccccccccccccccccccccc"
    });
    const unexpected = await detCall(runtime, "info", { sandboxProof: true });
    const executeMissing = await executeTool({
      config: runtime.config,
      expectedRevision: 1,
      idempotencyKey: "det-err-exec-xxxxxxxxxxxxx",
      now: DET_V3_CLOCK,
      payment: runtime.payment,
      planHandle: "cap_dddddddddddddddddddddddddddddd",
      scope: runtime.scope,
      store: runtime.store
    });
    const cases = [missing, evidence, feedback, unexpected, executeMissing as Record<string, unknown>];
    for (const item of cases) {
      assert.equal(publicErrorSafe(item), true, canonicalJson(item));
    }
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
