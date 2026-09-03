import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { QA_FIXTURE_RECIPES } from "../lib/agentic/qa/preflight.ts";
import { planTool } from "../lib/agentic/plan/service.ts";
import { executeTool } from "../lib/agentic/commerce/execute.ts";
import { supportTool } from "../lib/agentic/support.ts";
import { isAgenticErrorResult } from "../lib/agentic/contract/errors.ts";
import {
  listFunnelEvents,
  recordFunnelEvent
} from "../lib/agentic/funnel/ledger.ts";
import {
  queryBudgetSnapshot,
  resetQueryBudget,
  setQueryNamespace
} from "../lib/agentic/plan/query-budget.ts";
import { goldenPlanRequest } from "../lib/agentic/qa/proofs.ts";
import {
  beginQaRun,
  resolveQaSession,
  setQaClock,
  withQaSessionSnapshot
} from "../lib/agentic/qa/session.ts";
import { handleQaJsonRpc } from "../lib/agentic/mcp/qa-dispatcher.ts";
import {
  beginDetRun,
  canonicalJson,
  createDetRuntime,
  endDetRun,
  simulateInstanceRestart
} from "./agentic/det-v3/harness.ts";

const CLOCK_09 = "2026-09-02T09:00:00.000Z";
const EXPIRY_09_15 = "2026-09-02T09:15:00.000Z";
const PACK_IP = "203.0.113.88";

function structured(response: { result?: { structuredContent?: unknown } } | null) {
  return (response?.result?.structuredContent ?? response?.result ?? {}) as Record<string, unknown>;
}

async function qaCall(
  runtime: ReturnType<typeof createDetRuntime>,
  name: string,
  args: Record<string, unknown> = {}
) {
  return structured(
    await handleQaJsonRpc(runtime, {
      id: 1,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: args, name }
    })
  );
}

beforeEach(() => {
  beginDetRun("remediation");
});

afterEach(() => {
  endDetRun();
});

describe("Slice 1 shared QA namespace state", () => {
  it("STATE-CLOCK-RED checkout expiry follows setClock 09:00 across instance restart", async () => {
    const runtime = createDetRuntime();
    const begun = await beginQaRun("A", {
      buildId: runtime.config.buildId,
      clientKey: PACK_IP,
      environment: "dev"
    });
    await setQaClock(begun.namespace, CLOCK_09);
    simulateInstanceRestart();
    const session = await resolveQaSession(begun.namespace);
    assert.equal(session?.now, CLOCK_09, "first divergent field checkoutExpiresAt from clock");
    const scope = { ...runtime.scope, principalScope: begun.principalScope };
    const plan = await withQaSessionSnapshot(begun.namespace, () =>
      planTool({
        config: runtime.config,
        now: session!.now,
        payload: { idempotencyKey: "state-clock-planxxxx", request: goldenPlanRequest() },
        scope,
        store: runtime.store
      })
    );
    assert.equal((plan as { status?: string }).status, "ready", canonicalJson(plan));
    const executed = await withQaSessionSnapshot(begun.namespace, () =>
      executeTool({
        config: runtime.config,
        expectedRevision: (plan as { revision: number }).revision,
        idempotencyKey: "state-clock-execxxxx",
        now: session!.now,
        payment: runtime.payment,
        planHandle: (plan as { planHandle: string }).planHandle,
        scope,
        store: runtime.store
      })
    );
    assert.equal((executed as { checkoutExpiresAt?: string }).checkoutExpiresAt, EXPIRY_09_15);
  });

  it("STATE-01 100 namespaced clock reads stay at the set time after restarts", async () => {
    const begun = await beginQaRun("A", { clientKey: PACK_IP, environment: "dev" });
    await setQaClock(begun.namespace, CLOCK_09);
    const times: string[] = [];
    for (let index = 0; index < 100; index += 1) {
      if (index % 7 === 0) {
        simulateInstanceRestart();
      }
      const session = await resolveQaSession(begun.namespace);
      times.push(String(session?.now));
    }
    assert.equal(new Set(times).size, 1);
    assert.equal(times[0], CLOCK_09);
  });

  it("STATE-06 two namespaces cannot read one another's clock", async () => {
    const runA = await beginQaRun("A", { clientKey: PACK_IP, environment: "dev" });
    const runB = await beginQaRun("B", { clientKey: PACK_IP, environment: "dev" });
    await setQaClock(runA.namespace, CLOCK_09);
    simulateInstanceRestart();
    const loadedA = await resolveQaSession(runA.namespace);
    const loadedB = await resolveQaSession(runB.namespace);
    assert.equal(loadedA?.now, CLOCK_09);
    assert.notEqual(loadedB?.now, CLOCK_09);
  });
});

describe("Slice 2 commercial journey", () => {
  it("COMMERCE-RED / COMMERCE-01..07 J-05 is identical across instance restarts", async () => {
    const runtime = createDetRuntime();
    const begun = await beginQaRun("A", { clientKey: PACK_IP, environment: "dev" });
    await setQaClock(begun.namespace, CLOCK_09);
    const scope = { ...runtime.scope, principalScope: begun.principalScope };
    const plan = await planTool({
      config: runtime.config,
      now: CLOCK_09,
      payload: { idempotencyKey: "com-red-planxxxxxxxx", request: goldenPlanRequest() },
      scope,
      store: runtime.store
    });
    assert.equal((plan as { status?: string }).status, "ready");
    const first = await executeTool({
      config: runtime.config,
      expectedRevision: (plan as { revision: number }).revision,
      idempotencyKey: "com-red-execxxxxxxxx",
      now: CLOCK_09,
      payment: runtime.payment,
      planHandle: (plan as { planHandle: string }).planHandle,
      scope,
      store: runtime.store
    });
    simulateInstanceRestart();
    await resolveQaSession(begun.namespace);
    const replay = await executeTool({
      config: runtime.config,
      expectedRevision: (plan as { revision: number }).revision,
      idempotencyKey: "com-red-execxxxxxxxx",
      now: CLOCK_09,
      payment: runtime.payment,
      planHandle: (plan as { planHandle: string }).planHandle,
      scope,
      store: runtime.store
    });
    assert.equal(canonicalJson(first), canonicalJson(replay));
    assert.equal((first as { checkoutExpiresAt?: string }).checkoutExpiresAt, EXPIRY_09_15);
    const orderHandle = String((first as { orderHandle: string }).orderHandle);
    const declined = await qaCall(runtime, "simulate", {
      namespace: begun.namespace,
      orderHandle,
      scenario: "decline_insufficient_funds"
    });
    assert.equal(declined.paymentStatus, "unpaid");
    assert.equal(declined.latestPaymentAttempt, "declined");
    const paid = await qaCall(runtime, "simulate", {
      namespace: begun.namespace,
      orderHandle,
      scenario: "success"
    });
    assert.equal(paid.paymentStatus, "paid");
    const duplicate = await qaCall(runtime, "simulate", {
      namespace: begun.namespace,
      orderHandle,
      scenario: "success"
    });
    assert.equal(duplicate.paymentStatus, "paid");
    const late = await qaCall(runtime, "simulate", {
      namespace: begun.namespace,
      orderHandle,
      scenario: "decline_insufficient_funds"
    });
    assert.equal(late.paymentStatus, "paid");
    const preparing = await qaCall(runtime, "simulateFulfilment", {
      namespace: begun.namespace,
      orderHandle,
      status: "preparing"
    });
    const dispatched = await qaCall(runtime, "simulateFulfilment", {
      namespace: begun.namespace,
      orderHandle,
      status: "dispatched"
    });
    const delivered = await qaCall(runtime, "simulateFulfilment", {
      namespace: begun.namespace,
      orderHandle,
      status: "delivered"
    });
    assert.equal(preparing.timeline, "preparing");
    assert.equal(dispatched.timeline, "dispatched");
    assert.equal(delivered.timeline, "delivered");
    assert.equal(delivered.terminal, true);
    assert.equal(delivered.nextAction, "none");
    assert.equal(Number(delivered.pollAfterSeconds), 0);
  });
});

describe("Slice 3 support", () => {
  it("SUPPORT-RED / SUPPORT-01..03 create, replay, and agent reply on a paid order", async () => {
    const runtime = createDetRuntime();
    const begun = await beginQaRun("A", { clientKey: PACK_IP, environment: "dev" });
    const scope = { ...runtime.scope, principalScope: begun.principalScope };
    const plan = await planTool({
      config: runtime.config,
      now: CLOCK_09,
      payload: { idempotencyKey: "sup-red-planxxxxxxxx", request: goldenPlanRequest() },
      scope,
      store: runtime.store
    });
    const executed = await executeTool({
      config: runtime.config,
      expectedRevision: (plan as { revision: number }).revision,
      idempotencyKey: "sup-red-execxxxxxxxx",
      now: CLOCK_09,
      payment: runtime.payment,
      planHandle: (plan as { planHandle: string }).planHandle,
      scope,
      store: runtime.store
    });
    const orderHandle = String((executed as { orderHandle: string }).orderHandle);
    await qaCall(runtime, "simulate", {
      namespace: begun.namespace,
      orderHandle,
      scenario: "success"
    });
    await qaCall(runtime, "simulateFulfilment", {
      namespace: begun.namespace,
      orderHandle,
      status: "preparing"
    });
    await qaCall(runtime, "simulateFulfilment", {
      namespace: begun.namespace,
      orderHandle,
      status: "dispatched"
    });
    await qaCall(runtime, "simulateFulfilment", {
      namespace: begun.namespace,
      orderHandle,
      status: "delivered"
    });
    const created = await supportTool({
      config: runtime.config,
      idempotencyKey: "sup-red-createxxxxxxx",
      message: "Where is my synthetic order?",
      now: CLOCK_09,
      orderHandle,
      scope,
      store: runtime.store
    });
    assert.equal(isAgenticErrorResult(created), false, canonicalJson(created));
    const replay = await supportTool({
      config: runtime.config,
      idempotencyKey: "sup-red-createxxxxxxx",
      message: "Where is my synthetic order?",
      now: CLOCK_09,
      orderHandle,
      scope,
      store: runtime.store
    });
    assert.equal(canonicalJson(created), canonicalJson(replay));
    const reply = await supportTool({
      config: runtime.config,
      idempotencyKey: "sup-red-replyxxxxxxxx",
      message: "It is dispatched.",
      now: CLOCK_09,
      orderHandle,
      scope,
      store: runtime.store,
      supportHandle: String((created as { supportHandle: string }).supportHandle)
    });
    const thread = ((reply as { thread?: Array<{ author: string; body: string }> }).thread ?? []).map(
      (item) => `${item.author}:${item.body}`
    );
    assert.ok(thread[0]?.startsWith("client:"));
    assert.ok(thread.some((item) => item.startsWith("support:")));
  });
});

describe("Slice 4 funnel ledger", () => {
  it("FUNNEL-RED / FUNNEL-01..02 ordered events survive instance restart", () => {
    const correlationId = "funnel-red-order";
    const types = [
      "connector_viewed",
      "connected",
      "plan_ready",
      "confirmed",
      "checkout_created",
      "payment_declined",
      "paid",
      "dispatched",
      "delivered"
    ];
    for (const [index, eventType] of types.entries()) {
      const accepted = recordFunnelEvent({
        attribution: "agent_connector",
        correlationId,
        createdAt: CLOCK_09,
        eventId: `funnel-red-${index}`,
        eventType,
        payload: { anonymousCorrelation: "anon-red", locale: "en" }
      });
      assert.equal(accepted.accepted, true);
    }
    simulateInstanceRestart();
    const replay = recordFunnelEvent({
      attribution: "agent_connector",
      correlationId,
      createdAt: CLOCK_09,
      eventId: "funnel-red-0",
      eventType: "connector_viewed",
      payload: { anonymousCorrelation: "anon-red", locale: "en" }
    });
    assert.equal(replay.accepted, false);
    const events = listFunnelEvents(correlationId);
    assert.deepEqual(
      events.map((item) => item.eventType),
      types
    );
    assert.equal(events.length, 9);
  });
});

describe("Slice 5 one catalogue load per plan", () => {
  it("SNAPSHOT-RED / SNAPSHOT-02 one uncached plan counts one snapshot acquisition", async () => {
    const runtime = createDetRuntime();
    const begun = await beginQaRun("A", { environment: "dev" });
    resetQueryBudget(begun.namespace);
    setQueryNamespace(begun.namespace);
    const plan = await planTool({
      config: runtime.config,
      now: CLOCK_09,
      payload: { idempotencyKey: "snap-red-planxxxxxxxx", request: goldenPlanRequest() },
      scope: { ...runtime.scope, principalScope: begun.principalScope },
      store: runtime.store
    });
    assert.equal((plan as { status?: string }).status, "ready");
    const queries = queryBudgetSnapshot(begun.namespace);
    assert.equal(queries["catalogue.snapshot.TH"], 1);
  });
});

describe("Slice 6 missing-days completion", () => {
  it("MISSING-DAYS-RED / MISSING-01..02 days:7 completes a ready replenishment plan", async () => {
    const runtime = createDetRuntime();
    const request = {
      destinationCountry: "TH",
      locale: "en",
      optimization: "balanced" as const,
      profile: { ageYears: 38, lifeStage: "adult" as const, sex: "male" as const },
      requirements: {},
      ...QA_FIXTURE_RECIPES.F_MISSING_DAYS
    };
    const asked = await planTool({
      config: runtime.config,
      now: CLOCK_09,
      payload: { idempotencyKey: "missing-ask-planxxxxxx", request },
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal((asked as { status?: string }).status, "needs_input");
    const questions = (asked as { questions?: Array<{ questionId?: string }> }).questions ?? [];
    assert.equal(questions.length, 1);
    const answered = await planTool({
      config: runtime.config,
      now: CLOCK_09,
      payload: {
        answers: [{ choice: "days:7", questionId: String(questions[0]?.questionId) }],
        expectedRevision: (asked as { revision: number }).revision,
        idempotencyKey: "missing-ans-planxxxxxx",
        planHandle: (asked as { planHandle: string }).planHandle
      },
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal((answered as { status?: string }).status, "ready", canonicalJson(answered));
    assert.equal((answered as { purchaseRequiredNow?: boolean }).purchaseRequiredNow, false);
    const executed = await executeTool({
      config: runtime.config,
      expectedRevision: (answered as { revision: number }).revision,
      idempotencyKey: "missing-exec-planxxxxx",
      now: CLOCK_09,
      payment: runtime.payment,
      planHandle: (answered as { planHandle: string }).planHandle,
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal(isAgenticErrorResult(executed), true);
    assert.equal((executed as { error?: { reasonCode?: string } }).error?.reasonCode, "invalid_request");
  });

  it("MISSING-05 F_HAVE_90 stays no_purchase", async () => {
    const runtime = createDetRuntime();
    const covered = await planTool({
      config: runtime.config,
      now: CLOCK_09,
      payload: {
        idempotencyKey: "have90-planxxxxxxxxxx",
        request: {
          destinationCountry: "TH",
          locale: "en",
          optimization: "balanced" as const,
          profile: { ageYears: 38, lifeStage: "adult" as const, sex: "male" as const },
          requirements: {},
          ...QA_FIXTURE_RECIPES.F_HAVE_90
        }
      },
      scope: runtime.scope,
      store: runtime.store
    });
    assert.equal((covered as { status?: string }).status, "no_purchase");
  });
});


