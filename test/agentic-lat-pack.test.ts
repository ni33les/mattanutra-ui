import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  decodeMcpPayload,
  encodeJsonRpcSse,
  mcpOneShotBody,
  mcpOneShotHeaders,
  wantsMcpSse
} from "../lib/agentic/mcp/transport.ts";
import { latencyProof } from "../lib/agentic/qa/proofs.ts";
import {
  canonicalLatencyEvidence,
  interpolatePercentile,
  readTech07Fixed,
  scoreUncachedPlanBenchmark,
  TECH07_FIXED_BUDGET,
  TECH07_LIVE_BUDGET
} from "../lib/agentic/qa/latency-score.ts";
import { planTool } from "../lib/agentic/plan/service.ts";
import { resetMatchPlanCache } from "../lib/agentic/plan/matching.ts";
import {
  beginDetRun,
  canonicalJson,
  createDetRuntime,
  endDetRun
} from "./agentic/det-v3/harness.ts";
import { DET_V3_CLOCK } from "./agentic/det-v3/manifest.ts";

const ORIGIN = "http://127.0.0.1:3000/api/mcp";
const PUBLIC = "https://dev.mattanutra.com/api/mcp";
const MIXED_ACCEPT = "application/json, text/event-stream";
const LIST_BODY = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
const INFO_BODY = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: { name: "info", arguments: { locale: "en" } }
});

const MAGNESIUM_REQUEST = {
  destinationCountry: "TH",
  locale: "en",
  optimization: "balanced",
  profile: { ageYears: 30, lifeStage: "adult", sex: "male" },
  requirements: {},
  targets: [{ amount: 300, importance: "core", name: "Magnesium", unit: "mg" }]
};

function planBody(idempotencyKey: string) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      arguments: {
        idempotencyKey,
        operation: "create",
        request: MAGNESIUM_REQUEST
      },
      name: "plan"
    }
  });
}

function payloadHash(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

async function timedPost(
  url: string,
  accept: string,
  body: string,
  extraHeaders: Record<string, string> = {}
) {
  const requestId = extraHeaders["x-request-id"] ?? `lat-${Date.now()}`;
  const started = performance.now();
  const response = await fetch(url, {
    body,
    headers: {
      Accept: accept,
      "Cache-Control": "no-cache, no-store",
      "Content-Type": "application/json",
      Pragma: "no-cache",
      "x-request-id": requestId,
      ...extraHeaders
    },
    method: "POST"
  });
  const headersMs = performance.now() - started;
  const text = await response.text();
  const totalMs = performance.now() - started;
  return {
    bodyMs: totalMs - headersMs,
    connection: response.headers.get("connection"),
    contentType: response.headers.get("content-type") ?? "",
    handlerMs: Number(response.headers.get("x-mcp-handler-ms") ?? "NaN"),
    headersMs,
    payload: decodeMcpPayload(response.headers.get("content-type") ?? "", text),
    requestId: response.headers.get("x-request-id") ?? requestId,
    status: response.status,
    text,
    totalMs,
    transport: response.headers.get("x-mcp-transport")
  };
}

function classifyCompletion(sample: {
  accept: string;
  bodyMs: number;
  connection: string | null;
  contentType: string;
  handlerMs: number;
  totalMs: number;
  transport: string | null;
}) {
  const sseWanted = wantsMcpSse(sample.accept);
  const sseGot = /event-stream/i.test(sample.contentType);
  const jsonGot = /application\/json/i.test(sample.contentType);
  const keepAlive = /keep-alive/i.test(sample.connection ?? "");
  const observable =
    Number.isFinite(sample.handlerMs) ||
    sample.transport === "sse-oneshot" ||
    sample.transport === "json-oneshot" ||
    sample.bodyMs >= 0;

  if (!observable) {
    return { code: "LAT_STAGE_UNOBSERVABLE", stage: "RESPONSE_COMPLETION" as const };
  }
  if (sseWanted && !sseGot) {
    return { code: "LAT_STAGE_EXCEEDED", stage: "RESPONSE_COMPLETION" as const };
  }
  if (!sseWanted && !jsonGot) {
    return { code: "LAT_STAGE_EXCEEDED", stage: "RESPONSE_COMPLETION" as const };
  }
  if (keepAlive) {
    return { code: "LAT_STAGE_EXCEEDED", stage: "RESPONSE_COMPLETION" as const };
  }
  if (sample.bodyMs > 500) {
    return { code: "LAT_STAGE_EXCEEDED", stage: "RESPONSE_COMPLETION" as const };
  }
  if (Number.isFinite(sample.handlerMs) && sample.handlerMs > 3_000) {
    return { code: "LAT_STAGE_EXCEEDED", stage: "APP" as const };
  }
  if (sample.totalMs > 8_000) {
    return { code: "LAT_STAGE_EXCEEDED", stage: "INGRESS" as const };
  }
  return { code: "LAT_STAGE_OK", stage: "RESPONSE_COMPLETION" as const };
}

async function concurrentPlanSamples(
  url: string,
  prefix: string,
  total = 30,
  workers = 10
) {
  const samples: number[] = [];
  let next = 0;
  async function worker() {
    while (next < total) {
      const index = next;
      next += 1;
      const result = await timedPost(
        url,
        MIXED_ACCEPT,
        planBody(`${prefix}-${String(index).padStart(12, "0")}`)
      );
      samples.push(result.totalMs);
      assert.equal(result.status, 200, result.text.slice(0, 300));
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return samples;
}

describe("LAT transport contract", () => {
  it("LAT-011 helper encodes SSE for event-stream Accept", () => {
    assert.equal(wantsMcpSse("text/event-stream"), true);
    assert.equal(wantsMcpSse("application/json, text/event-stream"), true);
    assert.equal(wantsMcpSse("application/json"), false);
    assert.match(mcpOneShotHeaders("text/event-stream")["Content-Type"], /text\/event-stream/);
    assert.match(mcpOneShotHeaders("application/json").Connection, /close/i);
    assert.match(encodeJsonRpcSse({ jsonrpc: "2.0", id: 1 }), /event: message/);
    assert.match(mcpOneShotBody("text/event-stream", { ok: true }), /event: message/);
    assert.equal(
      (decodeMcpPayload("text/event-stream", encodeJsonRpcSse({ id: 7 })) as { id?: number }).id,
      7
    );
  });

  it("LAT-011 origin tools/list honours text/event-stream Accept", async () => {
    const sse = await timedPost(ORIGIN, "text/event-stream", LIST_BODY);
    assert.equal(sse.status, 200);
    assert.match(sse.contentType, /text\/event-stream/i, sse.contentType);
    assert.match(sse.text, /event:\s*message/);
    const mixed = await timedPost(ORIGIN, MIXED_ACCEPT, LIST_BODY);
    assert.match(mixed.contentType, /text\/event-stream/i, mixed.contentType);
    assert.match(mixed.text, /event:\s*message/);
    assert.ok(mixed.totalMs < 2000, `mixed accept took ${mixed.totalMs}ms`);
  });

  it("LAT-010 origin JSON Accept is one-shot close", async () => {
    const json = await timedPost(ORIGIN, "application/json", LIST_BODY);
    assert.match(json.contentType, /application\/json/i);
    assert.match(json.connection ?? "close", /close/i);
    const parsed = json.payload as { jsonrpc?: string };
    assert.equal(parsed.jsonrpc, "2.0");
  });

  it("LAT-012 origin body completion p95 <= 500ms", async () => {
    const samples: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      samples.push((await timedPost(ORIGIN, MIXED_ACCEPT, INFO_BODY)).bodyMs);
      samples.push((await timedPost(ORIGIN, MIXED_ACCEPT, LIST_BODY)).bodyMs);
    }
    const p95 = interpolatePercentile(samples, 95);
    assert.ok(p95 <= 500, `body completion p95 ${p95}ms`);
  });

  it("LAT-001 names RESPONSE_COMPLETION and requires a terminal one-shot", async () => {
    const requestId = "lat-001-info";
    const info = await timedPost(ORIGIN, MIXED_ACCEPT, INFO_BODY, { "x-request-id": requestId });
    const plan = await timedPost(ORIGIN, MIXED_ACCEPT, planBody("lat-001-plan-00000001"), {
      "x-request-id": "lat-001-plan"
    });
    const infoStage = classifyCompletion({ ...info, accept: MIXED_ACCEPT });
    const planStage = classifyCompletion({ ...plan, accept: MIXED_ACCEPT });
    assert.notEqual(infoStage.code, "LAT_STAGE_UNOBSERVABLE");
    assert.notEqual(planStage.code, "LAT_STAGE_UNOBSERVABLE");
    assert.equal(infoStage.code, "LAT_STAGE_OK", JSON.stringify(infoStage));
    assert.equal(planStage.code, "LAT_STAGE_OK", JSON.stringify(planStage));
    assert.equal(infoStage.stage, "RESPONSE_COMPLETION");
    assert.match(info.contentType, /event-stream/i);
    assert.equal(info.requestId, requestId);
  });

  it("LAT-002 origin and public hashes match; excess is not INGRESS/APP", async () => {
    const origin = await timedPost(ORIGIN, MIXED_ACCEPT, LIST_BODY);
    const edge = await timedPost(PUBLIC, MIXED_ACCEPT, LIST_BODY);
    assert.equal(origin.status, 200);
    assert.equal(edge.status, 200);
    assert.equal(payloadHash(origin.payload), payloadHash(edge.payload));
    const originStage = classifyCompletion({ ...origin, accept: MIXED_ACCEPT });
    const edgeStage = classifyCompletion({ ...edge, accept: MIXED_ACCEPT });
    assert.notEqual(originStage.stage, "APP");
    assert.notEqual(edgeStage.stage, "INGRESS");
    assert.ok(
      Math.abs(edge.totalMs - origin.totalMs) <= 3000,
      `public-origin delta ${edge.totalMs - origin.totalMs}ms`
    );
    assert.equal(originStage.code, "LAT_STAGE_OK");
    assert.equal(edgeStage.code, "LAT_STAGE_OK");
  });

  it("LAT GET text/event-stream is 405 so the client does not hang", async () => {
    const response = await fetch(ORIGIN, {
      headers: { Accept: "text/event-stream" },
      method: "GET"
    });
    assert.equal(response.status, 405);
    await response.arrayBuffer();
  });
});

describe("LAT Slice D handler and TECH-07 schema", () => {
  before(() => {
    beginDetRun("lat");
  });
  after(() => {
    endDetRun();
  });

  it("LAT-003 latencyProof is labelled handler-only and exposes tech07.fixed", async () => {
    const proof = await latencyProof(createDetRuntime());
    assert.equal((proof as { kind?: string }).kind, "handler");
    const fixed = readTech07Fixed(proof);
    assert.equal(fixed?.n, 30);
    assert.equal(fixed?.concurrency, 10);
    assert.equal(fixed?.cacheMode, "uncached");
    assert.equal(fixed?.p50BudgetMs, 3000);
    assert.equal(fixed?.p95BudgetMs, 5000);
    assert.equal(
      typeof (proof as { plan?: { p95Ms?: number } }).plan?.p95Ms,
      "number"
    );
  });

  it("LAT-033 handler proof stays inside current budgets", async () => {
    const proof = await latencyProof(createDetRuntime());
    assert.equal(proof.passed, true);
    const planP95 = (proof as { plan?: { p95Ms?: number } }).plan?.p95Ms;
    assert.equal(typeof planP95, "number");
    assert.ok((planP95 ?? 9999) <= 3000);
  });

  it("LAT-034 scorer reads tech07.fixed, not http.plan", async () => {
    const proof = await latencyProof(createDetRuntime());
    const fixed = readTech07Fixed(proof);
    assert.ok(fixed, "tech07.fixed missing");
    const wrongPath = (proof as { fixedPlan?: unknown }).fixedPlan;
    assert.equal(wrongPath, undefined);
    const scored = scoreUncachedPlanBenchmark({
      budgets: {
        p50BudgetMs: fixed!.p50BudgetMs ?? TECH07_FIXED_BUDGET.p50BudgetMs,
        p95BudgetMs: fixed!.p95BudgetMs ?? TECH07_FIXED_BUDGET.p95BudgetMs
      },
      cacheMode: fixed!.cacheMode,
      concurrency: fixed!.concurrency,
      n: fixed!.n,
      samples: Array.from({ length: 30 }, () => 12)
    });
    assert.equal(scored.passed, true);
    assert.equal(scored.failureStage, "NONE");
  });

  it("LAT-030 thirty uncached in-process plans meet fixed p50/p95", async () => {
    const runtime = createDetRuntime();
    const samples: number[] = [];
    const workers = 10;
    const total = 30;
    let next = 0;
    async function worker() {
      while (next < total) {
        const index = next;
        next += 1;
        resetMatchPlanCache();
        const started = performance.now();
        const plan = await planTool({
          config: runtime.config,
          now: DET_V3_CLOCK,
          payload: {
            idempotencyKey: `lat-030-${String(index).padStart(12, "0")}`,
            request: MAGNESIUM_REQUEST
          },
          scope: { ...runtime.scope, principalScope: `lat-030-${index}` },
          store: runtime.store
        });
        samples.push(performance.now() - started);
        assert.equal((plan as { ok?: boolean }).ok, true);
      }
    }
    await Promise.all(Array.from({ length: workers }, () => worker()));
    const scored = scoreUncachedPlanBenchmark({
      budgets: TECH07_FIXED_BUDGET,
      cacheMode: "uncached",
      concurrency: 10,
      n: 30,
      samples
    });
    assert.equal(samples.length, 30);
    assert.equal(scored.passed, true, JSON.stringify(scored));
  });

  it("LAT-043 one millisecond across a threshold flips only pass/fail and stage", () => {
    const under = scoreUncachedPlanBenchmark({
      budgets: { p50BudgetMs: 20, p95BudgetMs: 20 },
      cacheMode: "uncached",
      concurrency: 10,
      n: 1,
      samples: [20]
    });
    const over = scoreUncachedPlanBenchmark({
      budgets: { p50BudgetMs: 20, p95BudgetMs: 20 },
      cacheMode: "uncached",
      concurrency: 10,
      n: 1,
      samples: [21]
    });
    assert.equal(under.passed, true);
    assert.equal(under.failureStage, "NONE");
    assert.equal(over.passed, false);
    assert.equal(over.failureStage, "P95");
    assert.equal(under.n, over.n);
    assert.equal(under.concurrency, over.concurrency);
    assert.equal(under.p95BudgetMs, over.p95BudgetMs);
  });

  it("LAT-040/041/042 isolated A/B canonical evidence is byte-identical", async () => {
    async function runOnce(runId: string) {
      const runtime = createDetRuntime({ principal: runId });
      const proof = await latencyProof(runtime);
      const samples: number[] = [];
      for (let index = 0; index < 30; index += 1) {
        resetMatchPlanCache();
        const started = performance.now();
        await planTool({
          config: runtime.config,
          now: DET_V3_CLOCK,
          payload: {
            idempotencyKey: `lat-040-${runId}-${String(index).padStart(10, "0")}`,
            request: MAGNESIUM_REQUEST
          },
          scope: { ...runtime.scope, principalScope: `lat-040-${runId}-${index}` },
          store: runtime.store
        });
        samples.push(performance.now() - started);
      }
      const fixed = scoreUncachedPlanBenchmark({
        budgets: TECH07_FIXED_BUDGET,
        cacheMode: "uncached",
        concurrency: 10,
        n: 30,
        samples
      });
      const live = scoreUncachedPlanBenchmark({
        budgets: TECH07_LIVE_BUDGET,
        cacheMode: "uncached",
        concurrency: 10,
        n: 30,
        samples
      });
      const canonical = canonicalLatencyEvidence({
        buildId: String((proof as { buildId?: string }).buildId ?? ""),
        failureStage: fixed.passed && live.passed ? "NONE" : fixed.failureStage,
        fixed,
        live,
        snapshotId: "snap_417dac74b789530c"
      });
      return {
        canonical,
        diagnostics: { samples }
      };
    }

    const runA = await runOnce("A");
    const runB = await runOnce("B");
    assert.equal(canonicalJson(runA.canonical), canonicalJson(runB.canonical));
    assert.equal(runA.canonical.fixed.n, 30);
    assert.equal(runA.canonical.fixed.concurrency, 10);
    assert.equal(runA.canonical.percentileAlgorithm, "linear_interpolation_rank_(n-1)*p");
    assert.notEqual(
      canonicalJson(runA.diagnostics),
      canonicalJson(runA.canonical),
      "raw timings must stay out of canonical evidence"
    );
  });
});

describe("LAT public DEV benchmarks", () => {
  it("LAT-031 public 30 uncached plans meet live p50/p95", async () => {
    const samples = await concurrentPlanSamples(PUBLIC, `lat-031-${Date.now().toString(36)}`);
    const scored = scoreUncachedPlanBenchmark({
      budgets: TECH07_LIVE_BUDGET,
      cacheMode: "uncached",
      concurrency: 10,
      n: 30,
      samples
    });
    assert.equal(scored.passed, true, JSON.stringify({ scored, samples }));
  });

  it("LAT-032 public tools/list and info are not stuck in a 10s+ band", async () => {
    const samples: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      samples.push((await timedPost(PUBLIC, MIXED_ACCEPT, LIST_BODY)).totalMs);
      samples.push((await timedPost(PUBLIC, MIXED_ACCEPT, INFO_BODY)).totalMs);
    }
    const p95 = interpolatePercentile(samples, 95);
    assert.ok(p95 <= 5000, `blanket delay p95 ${p95}ms`);
    assert.equal(
      samples.some((value) => value >= 10_000),
      false,
      `10s+ samples ${samples.filter((value) => value >= 10_000).join(",")}`
    );
  });
});
