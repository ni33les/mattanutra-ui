import assert from "node:assert/strict";
import { installGoldCatalogue } from "./gold-catalogue.ts";
import { closeSqlPool, getSql } from "../../lib/db.ts";
import { createPostgresStore } from "../../lib/agentic/store/postgres.ts";
import type { AgenticStore } from "../../lib/agentic/store/types.ts";
import { createAgenticRuntime } from "../../lib/agentic/runtime.ts";
import { loadAgenticConfig } from "../../lib/agentic/config.ts";
import { handleJsonRpc } from "../../lib/agentic/mcp/dispatcher.ts";
import { setMatcherEnteredForTests, setMatcherGateForTests } from "../../lib/agentic/plan/service.ts";

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
} else if (mode === "retry") {
  let release!: () => void;
  setMatcherGateForTests(new Promise<void>(resolve => { release = resolve; }));
  setMatcherEnteredForTests(() => send({ kind: "ready" }));
  process.on("message", message => { if (message === "go") release(); });
}

try {
  const runtime = createAgenticRuntime({
    store: mode === "before_commit" ? wrap(base) : base,
    config: { ...loadAgenticConfig(), capabilitySecret: "plan-recovery-integration-secret-0001", paymentProvider: "mock", thailandRetailerAdapter: "mock_thailand" },
    scope: { environment: "dev", tenantScope: "mattanutra", principalScope },
    now: "2026-09-06T12:00:00.000Z"
  });
  const response = await handleJsonRpc(runtime, {
    id: 1, method: "tools/call", params: { name: "plan", arguments: {
      operation: "create", idempotencyKey,
      request: {
        destinationCountry: "TH", locale: "en", optimization: "balanced",
        profile: { ageYears: 38, lifeStage: "adult", sex: "male" }, requirements: {},
        targets: [{ name: "Vitamin D3", amount: 1000, unit: "IU" }]
      }
    } }
  });
  send({ kind: "result", result: response?.result?.structuredContent });
} catch (error) {
  send({ kind: "error", message: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
} finally {
  await closeSqlPool();
  process.disconnect?.();
}
