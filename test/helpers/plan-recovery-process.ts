import assert from "node:assert/strict";
import { installGoldCatalogue } from "./gold-catalogue.ts";
import { closeSqlPool, getSql } from "../../lib/db.ts";
import { createPostgresStore } from "../../lib/agentic/store/postgres.ts";
import type { AgenticStore } from "../../lib/agentic/store/types.ts";
import { createAgenticRuntime } from "../../lib/agentic/runtime.ts";
import { loadAgenticConfig } from "../../lib/agentic/config.ts";
import { handleJsonRpc } from "../../lib/agentic/mcp/dispatcher.ts";
import { setMatcherEnteredForTests, setMatcherGateForTests, runAdmittedPlanOperation } from "../../lib/agentic/plan/service.ts";

import { requestAbortSignal } from "../../lib/agentic/qa/request-trace.ts";
import { setTimeout as delay } from "node:timers/promises";

const [mode, principalScope, idempotencyKey] = process.argv.slice(2);
const database = new URL(process.env.TEST_DB_URL!);
assert.equal(database.hostname, "127.0.0.1");
assert.match(database.pathname, /^\/mattanutra_lock_review/);
process.env.DB_URL = database.href;
process.env.NODE_TEST_CONTEXT = "plan-recovery-process";
installGoldCatalogue();
const send = (value: unknown) => process.send?.(value);
const base = createPostgresStore(getSql()!);
const never = new Promise<void>(() => {});
const wrap = (store: AgenticStore): AgenticStore => ({
  ...store,
  transaction: work => store.transaction(tx => work(wrap(tx))),
  async updatePlanRevision(record) {
    if (mode === "before_commit") {
      send({ kind: "paused", point: "before_commit" });
      await never;
    }
    return store.updatePlanRevision(record);
  }
});

if (mode === "before_match") {
  setMatcherGateForTests(never);
  setMatcherEnteredForTests(() => send({ kind: "paused", point: "before_match" }));
}

try {
  const runtime = createAgenticRuntime({
    store: mode === "before_commit" ? wrap(base) : base,
    config: { ...loadAgenticConfig(), capabilitySecret: "plan-recovery-integration-secret-0001", paymentProvider: "mock", thailandRetailerAdapter: "mock_thailand" },
    scope: { environment: "dev", tenantScope: "mattanutra", principalScope },
    now: "2026-09-06T12:00:00.000Z"
  });
  const request = {
    id: 1, method: "tools/call", params: { name: "plan", arguments: {
      idempotencyKey,
        destinationCountry: "TH", locale: "en", scoring: { profile: "best_match" },
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" }, requirements: {},
        targets: [{ name: "Vitamin D3", amount: 1000, unit: "IU" }]
    } }
  };
  let response = await handleJsonRpc(runtime, request);
  const operation = await base.getPlanOperationByKey(`dev:mattanutra:${principalScope}`, idempotencyKey);
  assert.ok(operation, "Admission must persist the execution owner before the HTTP response");
  requestAbortSignal(`plan-operation:${operation.id}`);
  if (mode === "retry") {
    const go = new Promise<void>(resolve => process.once("message", message => { assert.equal(message, "go"); resolve(); }));
    send({ kind: "ready" }); await go;
  }
  // Independent process execution follows admission. Concurrent contenders may
  // observe the same operation; only the durable claim owner calculates.
  await runAdmittedPlanOperation({ store: runtime.store, config: runtime.config, operationId: operation.id });
  for (let i = 0; i < 100; i++) {
    response = await handleJsonRpc(runtime, request);
    if (response?.result?.structuredContent?.status !== "processing") break;
    await delay(50);
  }
  send({ kind: "result", result: response?.result?.structuredContent });
} catch (error) {
  send({ kind: "error", message: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
} finally {
  await closeSqlPool();
  process.disconnect?.();
}
