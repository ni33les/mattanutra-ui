import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";
import { planTool } from "../lib/agentic/plan/service.ts";
import { executeTool } from "../lib/agentic/commerce/execute.ts";
import { supportTool } from "../lib/agentic/support.ts";
import { handleQaJsonRpc } from "../lib/agentic/mcp/qa-dispatcher.ts";
import { goldenPlanRequest } from "../lib/agentic/qa/proofs.ts";
import {
  beginDetRun,
  canonicalJson,
  createDetRuntime,
  endDetRun
} from "./agentic/det-v3/harness.ts";
import { DET_V3_CLOCK } from "./agentic/det-v3/manifest.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function structured(response: { result?: { structuredContent?: unknown } } | null) {
  return asRecord(response?.result?.structuredContent ?? response?.result);
}

async function qaCall(
  runtime: ReturnType<typeof createDetRuntime>,
  name: string,
  args: Record<string, unknown>
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

async function paidOrder(suffix: string) {
  const runtime = createDetRuntime();
  const begun = await qaCall(runtime, "beginRun", { runId: "A" });
  const namespace = String(begun.namespace);
  const scope = {
    ...runtime.scope,
    principalScope: String(begun.principalScope ?? namespace)
  };
  const plan = await planTool({
    config: runtime.config,
    now: DET_V3_CLOCK,
    payload: { idempotencyKey: `sup-plan-${suffix}xxxxxxxxx`, request: goldenPlanRequest() },
    scope,
    store: runtime.store
  });
  const executed = await executeTool({
    config: runtime.config,
    expectedRevision: Number((plan as { revision: number }).revision),
    idempotencyKey: `sup-exec-${suffix}xxxxxxxxx`,
    now: DET_V3_CLOCK,
    payment: runtime.payment,
    planHandle: String((plan as { planHandle: string }).planHandle),
    scope,
    store: runtime.store
  });
  const orderHandle = String((executed as { orderHandle: string }).orderHandle);
  await qaCall(runtime, "simulate", { namespace, orderHandle, scenario: "success" });
  await qaCall(runtime, "simulateFulfilment", {
    namespace,
    orderHandle,
    status: "dispatched"
  });
  await qaCall(runtime, "simulateFulfilment", {
    namespace,
    orderHandle,
    status: "delivered"
  });
  return { runtime, scope, orderHandle, namespace };
}

describe("Slice F deterministic support sequencing", () => {
  beforeEach(() => {
    beginDetRun("support-seq");
  });
  afterEach(() => {
    endDetRun();
  });

  it("SUPPORT-RED-01 postgres persist stores causal sequence", () => {
    const source = readFileSync(new URL("../lib/agentic/store/postgres.ts", import.meta.url), "utf8");
    assert.match(source, /insert into public\.agentic_support_messages \([^)]*sequence/);
    assert.match(source, /order by sequence asc/i);
  });

  it("SUPPORT-RED-01b initial append is client 1 then support 2", async () => {
    const { runtime, scope, orderHandle } = await paidOrder("01");
    const opened = await supportTool({
      config: runtime.config,
      idempotencyKey: "sup-open-01xxxxxxxxxxxxxx",
      message: "Where is my synthetic order?",
      now: DET_V3_CLOCK,
      orderHandle,
      scope,
      store: runtime.store
    });
    const thread = (opened as { thread: Array<{ author: string; body: string; sequence: number }> }).thread;
    assert.deepEqual(
      thread.map((item) => ({ author: item.author, body: item.body, sequence: item.sequence })),
      [
        { author: "client", body: "Where is my synthetic order?", sequence: 1 },
        { author: "support", body: "It is delivered.", sequence: 2 }
      ]
    );
  });

  it("SUPPORT-RED-02 reply is sequence 3", async () => {
    const { runtime, scope, orderHandle } = await paidOrder("02");
    const opened = await supportTool({
      config: runtime.config,
      idempotencyKey: "sup-open-02xxxxxxxxxxxxxx",
      message: "Where is my synthetic order?",
      now: DET_V3_CLOCK,
      orderHandle,
      scope,
      store: runtime.store
    });
    const reply = await supportTool({
      config: runtime.config,
      idempotencyKey: "sup-reply-02xxxxxxxxxxxxx",
      message: "It is dispatched.",
      now: DET_V3_CLOCK,
      orderHandle,
      scope,
      store: runtime.store,
      supportHandle: String((opened as { supportHandle: string }).supportHandle)
    });
    const thread = (reply as { thread: Array<{ sequence: number; body: string; author: string }> }).thread;
    assert.equal(thread[2]?.sequence, 3);
    assert.equal(thread[2]?.author, "support");
    assert.equal(thread[2]?.body, "It is dispatched.");
  });

  it("SUPPORT-RED-03 unique contiguous sequences", async () => {
    const { runtime, scope, orderHandle } = await paidOrder("03");
    const opened = await supportTool({
      config: runtime.config,
      idempotencyKey: "sup-open-03xxxxxxxxxxxxxx",
      message: "Where is my synthetic order?",
      now: DET_V3_CLOCK,
      orderHandle,
      scope,
      store: runtime.store
    });
    await supportTool({
      config: runtime.config,
      idempotencyKey: "sup-reply-03xxxxxxxxxxxxx",
      message: "It is dispatched.",
      now: DET_V3_CLOCK,
      orderHandle,
      scope,
      store: runtime.store,
      supportHandle: String((opened as { supportHandle: string }).supportHandle)
    });
    const stored = await runtime.store.getSupportCaseByOrderId(
      String((await runtime.store.getOrderItems("unused").catch(() => [])).length)
    );
    void stored;
    const again = await supportTool({
      config: runtime.config,
      idempotencyKey: "sup-read-03xxxxxxxxxxxxxx",
      message: "It is dispatched.",
      now: DET_V3_CLOCK,
      orderHandle,
      scope,
      store: runtime.store,
      supportHandle: String((opened as { supportHandle: string }).supportHandle)
    });
    const seq = ((again as { thread: Array<{ sequence: number }> }).thread ?? []).map((item) => item.sequence);
    assert.deepEqual(seq, [1, 2, 3]);
  });

  it("SUPPORT-RED-04 one hundred reads return the same ordered thread", async () => {
    const { runtime, scope, orderHandle } = await paidOrder("04");
    const opened = await supportTool({
      config: runtime.config,
      idempotencyKey: "sup-open-04xxxxxxxxxxxxxx",
      message: "Where is my synthetic order?",
      now: DET_V3_CLOCK,
      orderHandle,
      scope,
      store: runtime.store
    });
    const first = canonicalJson((opened as { thread: unknown }).thread);
    for (let index = 0; index < 99; index += 1) {
      const read = await supportTool({
        config: runtime.config,
        idempotencyKey: `sup-read-04-${String(index).padStart(8, "0")}`,
        message: "It is delivered.",
        now: DET_V3_CLOCK,
        orderHandle,
        scope,
        store: runtime.store,
        supportHandle: String((opened as { supportHandle: string }).supportHandle)
      });
      assert.equal(canonicalJson((read as { thread: unknown }).thread), first);
    }
  });

  it("SUPPORT-RED-05 same-key replay returns original structured response", async () => {
    const { runtime, scope, orderHandle } = await paidOrder("05");
    const opened = await supportTool({
      config: runtime.config,
      idempotencyKey: "sup-open-05xxxxxxxxxxxxxx",
      message: "Where is my synthetic order?",
      now: DET_V3_CLOCK,
      orderHandle,
      scope,
      store: runtime.store
    });
    const replay = await supportTool({
      config: runtime.config,
      idempotencyKey: "sup-open-05xxxxxxxxxxxxxx",
      message: "Where is my synthetic order?",
      now: DET_V3_CLOCK,
      orderHandle,
      scope,
      store: runtime.store
    });
    assert.equal(canonicalJson(opened), canonicalJson(replay));
  });

  it("SUPPORT-RED-06 concurrent reads cannot change order", async () => {
    const { runtime, scope, orderHandle } = await paidOrder("06");
    const opened = await supportTool({
      config: runtime.config,
      idempotencyKey: "sup-open-06xxxxxxxxxxxxxx",
      message: "Where is my synthetic order?",
      now: DET_V3_CLOCK,
      orderHandle,
      scope,
      store: runtime.store
    });
    const first = canonicalJson((opened as { thread: unknown }).thread);
    const reads = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        supportTool({
          config: runtime.config,
          idempotencyKey: `sup-conc-06-${String(index).padStart(7, "0")}`,
          message: "It is delivered.",
          now: DET_V3_CLOCK,
          orderHandle,
          scope,
          store: runtime.store,
          supportHandle: String((opened as { supportHandle: string }).supportHandle)
        })
      )
    );
    for (const read of reads) {
      assert.equal(canonicalJson((read as { thread: unknown }).thread), first);
    }
  });

  it("SUPPORT-RED-07 support.ts appends inside one store transaction", () => {
    const source = readFileSync(new URL("../lib/agentic/support.ts", import.meta.url), "utf8");
    assert.match(source, /store\.transaction/);
  });

  it("SUPPORT-RED-08 schema apply includes support message sequence", () => {
    const source = readFileSync(
      new URL("../scripts/apply-agentic-commerce-schema.ts", import.meta.url),
      "utf8"
    );
    assert.match(source, /agentic_support_messages[\s\S]*sequence/i);
  });
});
