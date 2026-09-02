import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { AGENTIC_PUBLIC_TOOLS } from "../lib/agentic/contract/instructions.ts";
import { AGENTIC_SCHEMA_CHECKSUM } from "../lib/agentic/info.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { handleQaJsonRpc } from "../lib/agentic/mcp/qa-dispatcher.ts";
import { planTool } from "../lib/agentic/plan/service.ts";
import { executeTool } from "../lib/agentic/commerce/execute.ts";
import { FUNNEL_EVENT_TYPES } from "../lib/agentic/funnel/events.ts";
import { goldenPlanRequest } from "../lib/agentic/qa/proofs.ts";
import { queryCount, resetQueryBudget } from "../lib/agentic/plan/query-budget.ts";
import {
  beginDetRun,
  createDetRuntime,
  detCall,
  detListTools,
  endDetRun
} from "./agentic/det-v3/harness.ts";
import { DET_V3_CLOCK } from "./agentic/det-v3/manifest.ts";

function structured(response: { result?: { structuredContent?: unknown; tools?: unknown } } | null) {
  return (response?.result?.structuredContent ?? response?.result ?? {}) as Record<string, unknown>;
}

async function qaCall(
  runtime: ReturnType<typeof createDetRuntime>,
  name: string,
  args: Record<string, unknown> = {}
) {
  const response = await handleQaJsonRpc(runtime, {
    id: 1,
    jsonrpc: "2.0",
    method: "tools/call",
    params: { arguments: args, name }
  });
  return structured(response);
}

beforeEach(() => {
  beginDetRun("preflight");
  resetQueryBudget();
});

afterEach(() => {
  endDetRun();
});

describe("DET-v3 ChatGPT preflight contract", () => {
  it("PF-PUBLIC public tools/list stays seven names and hides QA controls", async () => {
    const runtime = createDetRuntime();
    const listed = await detListTools(runtime);
    const names = listed.map((item) => item.name);
    assert.deepEqual(names, [...AGENTIC_PUBLIC_TOOLS]);
    assert.equal(names.includes("simulate"), false);
    assert.equal(names.includes("preflight"), false);
    assert.equal(names.includes("beginRun"), false);
    assert.equal(names.includes("observe"), false);
    assert.equal(names.includes("setChannel"), false);
  });

  it("PF-01 initialize advertises clock and namespaces; begin/reset are isolated", async () => {
    const runtime = createDetRuntime();
    const init = await handleQaJsonRpc(runtime, {
      id: 1,
      jsonrpc: "2.0",
      method: "initialize"
    });
    const preflight = (init?.result?.preflight ?? structured(init).preflight) as Record<string, unknown>;
    assert.equal(preflight.ok, true);
    assert.equal((preflight.clock as { settable?: boolean }).settable, true);
    assert.equal((preflight.namespaces as { begin?: boolean }).begin, true);
    assert.equal((preflight.namespaces as { reset?: boolean }).reset, true);

    const runA = await qaCall(runtime, "beginRun", { runId: "A" });
    const runB = await qaCall(runtime, "beginRun", { runId: "B" });
    assert.equal(typeof runA.namespace, "string");
    assert.equal(runA.clock, DET_V3_CLOCK);
    assert.notEqual(runA.namespace, runB.namespace);

    const scopeA = {
      ...runtime.scope,
      principalScope: String(runA.principalScope ?? runA.namespace)
    };
    const planA = await planTool({
      config: runtime.config,
      now: String(runA.clock),
      payload: { idempotencyKey: "pf-01-plan-a-xxxxxxxx", request: goldenPlanRequest() },
      scope: scopeA,
      store: runtime.store
    });
    const handleA = (planA as { planHandle: string }).planHandle;
    assert.equal(typeof handleA, "string");

    const clocked = await qaCall(runtime, "setClock", {
      namespace: runA.namespace,
      now: "2026-09-02T01:00:00.000Z"
    });
    assert.equal(clocked.clock, "2026-09-02T01:00:00.000Z");
    const other = await qaCall(runtime, "preflight", { namespace: runB.namespace });
    assert.equal((other.clock as { now?: string }).now, DET_V3_CLOCK);

    await qaCall(runtime, "reset", { namespace: runA.namespace });
    const gone = await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: { operation: "get", planHandle: handleA },
      scope: scopeA,
      store: runtime.store
    });
    assert.equal((gone as { ok?: boolean }).ok, false);
  });

  it("PF-02 fulfilment driver speaks preparing, dispatched, delivered", async () => {
    const runtime = createDetRuntime();
    const begun = await qaCall(runtime, "beginRun", { runId: "A" });
    const scope = {
      ...runtime.scope,
      principalScope: String(begun.principalScope ?? begun.namespace)
    };
    const plan = await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: { idempotencyKey: "pf-02-plan-xxxxxxxxxxxx", request: goldenPlanRequest() },
      scope,
      store: runtime.store
    });
    const executed = await executeTool({
      config: runtime.config,
      expectedRevision: (plan as { revision: number }).revision,
      idempotencyKey: "pf-02-exec-xxxxxxxxxxxx",
      now: DET_V3_CLOCK,
      payment: runtime.payment,
      planHandle: (plan as { planHandle: string }).planHandle,
      scope,
      store: runtime.store
    });
    const orderHandle = String((executed as { orderHandle: string }).orderHandle);
    await qaCall(runtime, "simulate", {
      orderHandle,
      scenario: "decline_insufficient_funds"
    });
    await qaCall(runtime, "simulate", { orderHandle, scenario: "success" });

    const preparing = await qaCall(runtime, "simulateFulfilment", {
      orderHandle,
      status: "preparing"
    });
    assert.equal(preparing.timeline, "preparing");
    const version = Number(preparing.stateVersion);
    const again = await qaCall(runtime, "simulateFulfilment", {
      orderHandle,
      status: "preparing"
    });
    assert.equal(again.timeline, "preparing");
    assert.equal(Number(again.stateVersion), version);

    const dispatched = await qaCall(runtime, "simulateFulfilment", {
      orderHandle,
      status: "dispatched"
    });
    assert.equal(dispatched.timeline, "dispatched");
    const delivered = await qaCall(runtime, "simulateFulfilment", {
      orderHandle,
      status: "delivered"
    });
    assert.equal(delivered.timeline, "delivered");
  });

  it("PF-03 observe returns the nine funnel events once", async () => {
    const runtime = createDetRuntime();
    await detCall(runtime, "info", { locale: "en" });
    const begun = await qaCall(runtime, "beginRun", { runId: "A" });
    const scope = {
      ...runtime.scope,
      principalScope: String(begun.principalScope ?? begun.namespace)
    };
    const plan = await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: { idempotencyKey: "pf-03-plan-xxxxxxxxxxxx", request: goldenPlanRequest() },
      scope,
      store: runtime.store
    });
    const executed = await executeTool({
      config: runtime.config,
      expectedRevision: (plan as { revision: number }).revision,
      idempotencyKey: "pf-03-exec-xxxxxxxxxxxx",
      now: DET_V3_CLOCK,
      payment: runtime.payment,
      planHandle: (plan as { planHandle: string }).planHandle,
      scope,
      store: runtime.store
    });
    const orderHandle = String((executed as { orderHandle: string }).orderHandle);
    await qaCall(runtime, "simulate", {
      orderHandle,
      scenario: "decline_insufficient_funds"
    });
    await qaCall(runtime, "simulate", { orderHandle, scenario: "success" });
    await qaCall(runtime, "simulateFulfilment", { orderHandle, status: "dispatched" });
    await qaCall(runtime, "simulateFulfilment", { orderHandle, status: "delivered" });
    const observed = await qaCall(runtime, "observe", { orderHandle });
    const events = (observed.events as Array<{ eventId: string; eventType: string }>) ?? [];
    const types = events.map((item) => item.eventType);
    for (const eventType of FUNNEL_EVENT_TYPES) {
      assert.equal(types.filter((item) => item === eventType).length, 1, eventType);
    }
    const ids = events.map((item) => item.eventId);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("PF-04 channel cost changes contribution only", async () => {
    const runtime = createDetRuntime();
    const runA = await qaCall(runtime, "beginRun", { runId: "A" });
    const runB = await qaCall(runtime, "beginRun", { runId: "B" });
    await qaCall(runtime, "setChannel", {
      acquisitionMinor: 200,
      attribution: "qa_campaign",
      namespace: runA.namespace
    });
    await qaCall(runtime, "setChannel", {
      acquisitionMinor: 0,
      attribution: "agent_connector",
      namespace: runB.namespace
    });

    async function paidOrder(namespace: string, principal: string, suffix: string) {
      const scope = { ...runtime.scope, principalScope: principal };
      const plan = (await planTool({
        config: runtime.config,
        now: DET_V3_CLOCK,
        payload: {
          idempotencyKey: `pf-04-plan-${suffix}xxxx`,
          request: goldenPlanRequest()
        },
        scope,
        store: runtime.store
      })) as Record<string, unknown>;
      const executed = await executeTool({
        config: runtime.config,
        expectedRevision: Number(plan.revision),
        idempotencyKey: `pf-04-exec-${suffix}xxxx`,
        now: DET_V3_CLOCK,
        payment: runtime.payment,
        planHandle: String(plan.planHandle),
        scope,
        store: runtime.store
      });
      const unpaid = await qaCall(runtime, "observe", {
        namespace,
        orderHandle: String((executed as { orderHandle: string }).orderHandle)
      });
      assert.equal(unpaid.contributionMinor, null);
      await qaCall(runtime, "simulate", {
        orderHandle: String((executed as { orderHandle: string }).orderHandle),
        scenario: "success"
      });
      return {
        canonical: (plan.canonical as { hash?: string } | undefined)?.hash ?? null,
        observe: await qaCall(runtime, "observe", {
          namespace,
          orderHandle: String((executed as { orderHandle: string }).orderHandle)
        })
      };
    }

    const a = await paidOrder(
      String(runA.namespace),
      String(runA.principalScope ?? runA.namespace),
      "a"
    );
    const b = await paidOrder(
      String(runB.namespace),
      String(runB.principalScope ?? runB.namespace),
      "b"
    );
    assert.equal(a.canonical, b.canonical);
    assert.notEqual(a.observe.contributionMinor, b.observe.contributionMinor);
    assert.equal(a.observe.attribution, "qa_campaign");
    assert.equal(b.observe.attribution, "agent_connector");
  });

  it("PF-05 observe exposes query counters", async () => {
    const runtime = createDetRuntime();
    resetQueryBudget();
    await planTool({
      config: runtime.config,
      now: DET_V3_CLOCK,
      payload: { idempotencyKey: "pf-05-plan-xxxxxxxxxxxx", request: goldenPlanRequest() },
      scope: runtime.scope,
      store: runtime.store
    });
    const observed = await qaCall(runtime, "observe", { correlationId: "queries" });
    const queries = (observed.queries ?? {}) as Record<string, number>;
    assert.ok(typeof queries["catalogue.snapshot.TH"] === "number");
    assert.ok(queryCount("catalogue.snapshot.TH") <= 2);
  });

  it("PF-06 preflight manifest exposes checksums, locales, and named recipes", async () => {
    const runtime = createDetRuntime();
    const body = await qaCall(runtime, "preflight");
    const manifest = (body.manifest ?? body) as Record<string, unknown>;
    assert.equal(manifest.schemaChecksum ?? body.schemaChecksum, AGENTIC_SCHEMA_CHECKSUM);
    const catalogueChecksum = String(manifest.catalogueChecksum ?? "");
    assert.match(catalogueChecksum, /^snap_[a-f0-9]{16}$/);
    const catalogueVersion = String(manifest.catalogueVersion ?? "");
    assert.equal(catalogueVersion.includes("fixture"), false);
    assert.deepEqual(manifest.locales, ["en", "th", "zh-CN"]);
    assert.match(String(manifest.localeBundle ?? ""), /^[a-f0-9]{64}$/);
    const fixtures = manifest.fixtures as Array<string> | Record<string, unknown>;
    const names = Array.isArray(fixtures) ? fixtures : Object.keys(fixtures);
    for (const name of [
      "F_READY_MAG",
      "F_HAVE_90",
      "F_MISSING_DAYS",
      "F_MIXED",
      "S349",
      "S350",
      "S351"
    ]) {
      assert.ok(names.includes(name), name);
    }
    assert.equal(JSON.stringify(manifest).includes("SKU-FAKE"), false);
  });

  it("PF-02 REST-shaped fulfilment aliases are accepted by the QA dispatcher", async () => {
    const runtime = createDetRuntime();
    const listed = await handleQaJsonRpc(runtime, { id: 1, method: "tools/list" });
    const tools = ((listed?.result?.tools as Array<{ name: string }>) ?? []).map(
      (item) => item.name
    );
    assert.ok(tools.includes("preflight"));
    assert.ok(tools.includes("beginRun"));
    assert.ok(tools.includes("simulateFulfilment"));
    assert.ok(tools.includes("observe"));
    assert.ok(tools.includes("setChannel"));
    const init = await handleQaJsonRpc(runtime, { id: 2, method: "initialize" });
    const fulfilment = (init?.result?.preflight as { fulfilment?: string[] })?.fulfilment;
    assert.deepEqual(fulfilment, ["preparing", "dispatched", "delivered"]);
  });
});
