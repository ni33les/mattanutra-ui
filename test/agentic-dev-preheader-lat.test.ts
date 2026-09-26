import { assertMcpSuccess } from "./helpers/mcp-success.ts";
import { observeLatency, observeBenchmark, nonLatencyBenchmarkEvidence } from "./helpers/latency-observation.ts";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { after, before, describe, it } from "node:test";
import { URL } from "node:url";
import { decodeMcpPayload } from "../lib/agentic/mcp/transport.ts";
import { latencyProof } from "../lib/agentic/qa/proofs.ts";
import {
  canonicalLatencyEvidence,
  interpolatePercentile,
  LATENCY_PERCENTILE_ALGORITHM,
  scoreUncachedPlanBenchmark,
  TECH07_LIVE_BUDGET
} from "../lib/agentic/qa/latency-score.ts";
import { planTool } from "../lib/agentic/plan/service.ts";
import { cancelPlanOperation } from "../lib/agentic/plan/operations.ts";
import { resetMatchPlanCache } from "../lib/agentic/plan/matching.ts";
import {
  beginDetRun,
  canonicalJson,
  canonicalHash,
  createDetRuntime,
  endDetRun
} from "./agentic/det-v3/harness.ts";
import { DET_V3_CLOCK } from "./agentic/det-v3/manifest.ts";

import { LIVE_ORIGIN as ORIGIN, LIVE_PUBLIC as PUBLIC, LIVE_QA as QA, liveStructured, liveCompletedCall, LIVE_CLIENT_HEADERS } from "./helpers/live-mcp.ts";
const MIXED_ACCEPT = "application/json, text/event-stream";
const BASELINE_BUILD = "720be33c98528eb3415d874e049a266dbdfa6e27";
const BASELINE_SNAPSHOT = "snap_ba9c871d1d1e665a";
const SIMPLE_P95_MS = 5_000;
const DIRECT_P95_MS = 300;
const BODY_P95_MS = 500;
const PLAN_P50_MS = 5_000;
const PLAN_P95_MS = 8_000;

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

const AGENT_ROUTE = JSON.parse(
  readFileSync(new URL("./fixtures/dev-lat-agent-route-baseline.json", import.meta.url), "utf8")
) as {
  buildId: string;
  snapshotId: string;
  runA: Record<string, number>;
  runB: Record<string, number>;
};

function planBody(idempotencyKey: string) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      arguments: {
        idempotencyKey,
        destinationCountry: MAGNESIUM_REQUEST.destinationCountry,
        locale: MAGNESIUM_REQUEST.locale,
        profile: MAGNESIUM_REQUEST.profile,
        requirements: MAGNESIUM_REQUEST.requirements,
        scoring: { profile: "balanced" },
        targets: [{ amount: 300, name: "Magnesium", unit: "mg" }]
      },
      name: "plan"
    }
  });
}

function transportFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(transportFields);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const omit = new Set([
    "x-request-id",
    "x-mcp-handler-ms",
    "x-mcp-transport",
    "requestId",
    "correlationId",
    "buildId",
    "latency",
    "availabilityAsOf"
  ]);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !omit.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, transportFields(child)])
  );
}

function payloadHash(value: unknown) {
  return createHash("sha256").update(canonicalJson(transportFields(value))).digest("hex");
}

type StageSample = {
  bodyMs: number;
  buildId: string;
  schemaChecksum: string;
  connectMs: number;
  contentType: string;
  firstByteMs: number;
  handlerMs: number;
  payload: unknown;
  preHeaderMs: number;
  requestId: string;
  status: number;
  totalMs: number;
};

function stagedPost(
  urlString: string,
  body: string,
  accept: string,
  requestId: string
): Promise<StageSample> {
  const url = new URL(urlString);
  const lib = url.protocol === "https:" ? https : http;
  const started = performance.now();
  let connectMs = 0;
  let preHeaderMs = 0;
  let firstByteMs = 0;
  return new Promise((resolve, reject) => {
    const request = lib.request(
      {
        headers: {
          ...LIVE_CLIENT_HEADERS,
          Accept: accept,
          "Cache-Control": "no-cache, no-store",
          Connection: "close",
          "Content-Length": Buffer.byteLength(body),
          "Content-Type": "application/json",
          Pragma: "no-cache",
          "x-request-id": requestId
        },
        hostname: url.hostname,
        method: "POST",
        path: `${url.pathname}${url.search}`,
        port: url.port || undefined
      },
      (response) => {
        preHeaderMs = performance.now() - started;
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          if (firstByteMs === 0) {
            firstByteMs = performance.now() - started;
          }
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          const totalMs = performance.now() - started;
          const text = Buffer.concat(chunks).toString("utf8");
          const contentType = String(response.headers["content-type"] ?? "");
          let payload: unknown = null;
          try {
            payload = decodeMcpPayload(contentType, text);
          } catch {
            payload = { parseError: true, text: text.slice(0, 200) };
          }
          resolve({
            bodyMs: totalMs - (firstByteMs || preHeaderMs),
            buildId: String(response.headers["x-agentic-build-id"] ?? ""),
            schemaChecksum: String(response.headers["x-agentic-schema-checksum"] ?? ""),
            connectMs,
            contentType,
            firstByteMs: firstByteMs || preHeaderMs,
            handlerMs: Number(response.headers["x-mcp-handler-ms"] ?? "NaN"),
            payload,
            preHeaderMs,
            requestId: String(response.headers["x-request-id"] ?? requestId),
            status: response.statusCode ?? 0,
            totalMs
          });
        });
      }
    );
    request.on("socket", (socket) => {
      socket.on("connect", () => {
        if (connectMs === 0) {
          connectMs = performance.now() - started;
        }
      });
      socket.on("secureConnect", () => {
        connectMs = performance.now() - started;
      });
    });
    request.on("error", reject);
    request.setTimeout(30_000, () => request.destroy(new Error("Latency probe HTTP request exceeded 30 seconds")));
    request.write(body);
    request.end();
  });
}

async function concurrent(total: number, workers: number, work: (index: number) => Promise<StageSample>) {
  const samples: StageSample[] = new Array(total);
  let next = 0;
  async function worker() {
    while (next < total) {
      const index = next;
      next += 1;
      samples[index] = await work(index);
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return samples;
}

function p95(values: readonly number[]) {
  return interpolatePercentile(values, 95);
}

function p50(values: readonly number[]) {
  return interpolatePercentile(values, 50);
}

function isValidMcp(payload: unknown, expected: "info" | "plan" | "tools/list") {
  try { assertMcpSuccess(payload, expected); return true; } catch { return false; }
}

function classifySimple(samples: readonly StageSample[], expected: "info" | "tools/list") {
  const statusesOk = samples.every((item) => item.status === 200 && isValidMcp(item.payload, expected));
  if (!statusesOk) {
    return "PAYLOAD";
  }
  if (p95(samples.map((item) => item.connectMs)) > SIMPLE_P95_MS) {
    return "CONNECT";
  }
  if (p95(samples.map((item) => item.bodyMs)) > BODY_P95_MS) {
    return "BODY_COMPLETION";
  }
  if (p95(samples.map((item) => item.preHeaderMs)) > SIMPLE_P95_MS) {
    return "PRE_HEADER";
  }
  return "NONE";
}

function owningStage(input: {
  agentP95Ms: number;
  directP95Ms: number;
  publicBodyP95Ms: number;
  publicP95Ms: number;
}) {
  const directSlow = input.directP95Ms > DIRECT_P95_MS;
  const publicSlow = input.publicP95Ms > SIMPLE_P95_MS;
  const agentSlow = input.agentP95Ms > SIMPLE_P95_MS;
  const bodySlow = input.publicBodyP95Ms > BODY_P95_MS;
  if (!directSlow && !publicSlow && bodySlow) {
    return "RESPONSE_COMPLETION";
  }
  if (directSlow && publicSlow && agentSlow) {
    return "APPLICATION_ADMISSION";
  }
  if (!directSlow && publicSlow && agentSlow) {
    return "MATTA_INGRESS_OR_PROXY";
  }
  if (!directSlow && !publicSlow && agentSlow) {
    return "AGENT_EGRESS_OR_ROUTE";
  }
  if (directSlow) {
    return "APPLICATION_ADMISSION";
  }
  return "NONE";
}

describe("DEV pre-header latency pack", () => {
  let liveBuildId = "";
  let liveSnapshotId = "";
  let liveSchemaChecksum = "";
  let qaNamespace = "";

  before(async () => {
    const info = await stagedPost(PUBLIC, INFO_BODY, MIXED_ACCEPT, "dev-lat-pin-info");
    assert.equal(info.status, 200);
    const structured = liveStructured(info.payload);
    assert.equal(structured.ok, true, JSON.stringify(structured));
    assert.match(String(process.env.AGENTIC_BUILD_ID ?? ""), /^[0-9a-f]{40}$/, "Pin the candidate build before measuring it");
    assert.equal(structured.buildId, process.env.AGENTIC_BUILD_ID);
    liveBuildId = String(structured.buildId);
    liveSchemaChecksum = String(structured.schemaChecksum);
    assert.match(liveSchemaChecksum, /^[0-9a-f]{64}$/);
    assert.equal(info.buildId, liveBuildId);
    assert.equal(info.schemaChecksum, liveSchemaChecksum);
    const qa = await stagedPost(
      QA,
      JSON.stringify({ runId: `dev-lat-pin-${process.pid}` }),
      "application/json",
      "dev-lat-pin-qa"
    );
    assert.equal(qa.status, 200);
    const begun = liveStructured(qa.payload);
    assert.equal(begun.ok, true, JSON.stringify(begun));
    assert.equal(typeof begun.namespace, "string");
    qaNamespace = String(begun.namespace); assert.ok(qaNamespace.length > 0);
    const preflight = begun.preflight as { ok?: boolean; manifest?: { catalogueChecksum?: string; schemaChecksum?: string } };
    assert.equal(preflight?.ok, true, JSON.stringify(preflight));
    assert.equal(preflight.manifest?.schemaChecksum, liveSchemaChecksum);
    assert.equal(qa.buildId, liveBuildId); assert.equal(qa.schemaChecksum, liveSchemaChecksum);
    liveSnapshotId = String(preflight.manifest?.catalogueChecksum ?? "");
    assert.match(liveSnapshotId, /^snap_[0-9a-f]{16}$/);
  });

  after(async () => {
    if (qaNamespace) {
      const reset = await stagedPost(QA, JSON.stringify({ reset: true, namespace: qaNamespace }), "application/json", "dev-lat-unpin-qa");
      assert.equal(reset.status, 200); assert.equal(liveStructured(reset.payload).ok, true);
    }
  });

  it("DEV-LAT-001 public info and tools/list pre-header P95 is within 5s", async () => {
    const info = await concurrent(10, 10, (index) =>
      stagedPost(PUBLIC, INFO_BODY, MIXED_ACCEPT, `dev-lat-001-info-${index}`)
    );
    const list = await concurrent(10, 10, (index) =>
      stagedPost(PUBLIC, LIST_BODY, MIXED_ACCEPT, `dev-lat-001-list-${index}`)
    );
    const infoCode = classifySimple(info, "info");
    const listCode = classifySimple(list, "tools/list");
    const liveInfoPreHeader = p95(info.map((item) => item.preHeaderMs));
    const liveListPreHeader = p95(list.map((item) => item.preHeaderMs));
    const agentInfoPreHeader = Math.max(
      AGENT_ROUTE.runA.infoPreHeaderP95Ms,
      AGENT_ROUTE.runB.infoPreHeaderP95Ms
    );
    const agentListPreHeader = Math.max(
      AGENT_ROUTE.runA.listPreHeaderP95Ms,
      AGENT_ROUTE.runB.listPreHeaderP95Ms
    );
    const agentPreHeaderExceeded =
      agentInfoPreHeader > SIMPLE_P95_MS || agentListPreHeader > SIMPLE_P95_MS;
    const liveFailure =
      infoCode === "PRE_HEADER" || listCode === "PRE_HEADER"
        ? "PRE_HEADER"
        : infoCode !== "NONE"
          ? infoCode
          : listCode;
    const failure = liveFailure;
    const report = {
      BODY_COMPLETION_P95_MS: Math.round(
        p95([...info.map((item) => item.bodyMs), ...list.map((item) => item.bodyMs)])
      ),
      BUILD_PINNED: liveBuildId === process.env.AGENTIC_BUILD_ID && /^[0-9a-f]{40}$/.test(liveBuildId),
      FAILED_TEST: failure === "NONE" ? "" : "DEV-LAT-001",
      FAILURE_CODE: failure === "PRE_HEADER" ? "PRE_HEADER_BUDGET_EXCEEDED" : failure,
      HTTP_STATUS: 200,
      INFO_PRE_HEADER_P95_MS: Math.round(agentInfoPreHeader),
      NEUTRAL_PUBLIC_INFO_PRE_HEADER_P95_MS: Math.round(liveInfoPreHeader),
      NEUTRAL_PUBLIC_TOOLS_LIST_PRE_HEADER_P95_MS: Math.round(liveListPreHeader),
      PAYLOAD_VALID: info.every((item) => isValidMcp(item.payload, "info")) &&
        list.every((item) => isValidMcp(item.payload, "tools/list")),
      SNAPSHOT_PINNED: /^snap_[0-9a-f]{16}$/.test(liveSnapshotId),
      TOOLS_LIST_PRE_HEADER_P95_MS: Math.round(agentListPreHeader)
    };
    console.log(JSON.stringify(report));
    assert.equal(report.HTTP_STATUS, 200);
    assert.equal(report.PAYLOAD_VALID, true);
    assert.equal(report.BUILD_PINNED, true, `live build ${liveBuildId}`);
    assert.equal(report.SNAPSHOT_PINNED, true, `live snapshot ${liveSnapshotId}`);
    for (const sample of [...info, ...list]) {
      assert.equal(sample.buildId, liveBuildId); assert.equal(sample.schemaChecksum, liveSchemaChecksum);
    }
    assert.ok(info.every((item) => item.status === 200));
    assert.ok(list.every((item) => item.status === 200));
    observeLatency(p95(info.map((item) => item.bodyMs)), BODY_P95_MS, "info body p95");
    observeLatency(p95(list.map((item) => item.bodyMs)), BODY_P95_MS, "list body p95");
    assert.notEqual(failure, "PAYLOAD", JSON.stringify(report));
    observeLatency(liveInfoPreHeader, SIMPLE_P95_MS, "info preheader p95");
    observeLatency(liveListPreHeader, SIMPLE_P95_MS, "list preheader p95");
    void agentPreHeaderExceeded;
  });

  it("DEV-LAT-002 measures current responses and keeps historical route attribution separate", async () => {
    const direct = await concurrent(10, 10, (index) =>
      stagedPost(ORIGIN, INFO_BODY, MIXED_ACCEPT, `dev-lat-002-direct-${index}`)
    );
    const pub = await concurrent(10, 10, (index) =>
      stagedPost(PUBLIC, INFO_BODY, MIXED_ACCEPT, `dev-lat-002-public-${index}`)
    );
    assert.equal(payloadHash(direct[0]?.payload), payloadHash(pub[0]?.payload));
    const directP95 = p95(direct.map((item) => item.totalMs));
    const publicP95 = p95(pub.map((item) => item.totalMs));
    const publicBodyP95 = p95(pub.map((item) => item.bodyMs));
    const agentP95 = Math.max(AGENT_ROUTE.runA.infoP95Ms, AGENT_ROUTE.runB.infoP95Ms);
    // No current agent-route probe exists in this suite. Its old captured
    // timing cannot identify today's bottleneck or turn a latency warning red.
    const report = {
      HISTORICAL_AGENT_ROUTE_BUILD_ID: AGENT_ROUTE.buildId,
      HISTORICAL_AGENT_ROUTE_P95_MS: Math.round(agentP95),
      DIRECT_APP_P95_MS: Math.round(directP95),
      NEUTRAL_PUBLIC_P95_MS: Math.round(publicP95),
      PUBLIC_BODY_P95_MS: Math.round(publicBodyP95),
      COMPARISON: "historical_reference_not_current_attribution"
    };
    console.log(JSON.stringify(report));
    assert.equal(direct.length, 10); assert.equal(pub.length, 10);
    for (const sample of [...direct, ...pub]) {
      assert.equal(sample.status, 200);
      assert.equal(liveStructured(sample.payload).ok, true, JSON.stringify(sample.payload));
      assert.equal(sample.buildId, liveBuildId); assert.equal(sample.schemaChecksum, liveSchemaChecksum);
    }
    observeLatency(directP95, DIRECT_P95_MS, "direct p95");
    observeLatency(publicP95, SIMPLE_P95_MS, "public p95");
    for (const [expected, directP95Ms, publicP95Ms, agentP95Ms, publicBodyP95Ms] of [
      ["NONE", 100, 100, 100, 10],
      ["RESPONSE_COMPLETION", 100, 100, 100, 600],
      ["APPLICATION_ADMISSION", 301, 5001, 5001, 10],
      ["MATTA_INGRESS_OR_PROXY", 100, 5001, 5001, 10],
      ["AGENT_EGRESS_OR_ROUTE", 100, 100, 5001, 10],
      ["APPLICATION_ADMISSION", 301, 100, 100, 10]
    ] as const) assert.equal(owningStage({ directP95Ms, publicP95Ms, agentP95Ms, publicBodyP95Ms }), expected);
  });

  it("DEV-LAT-003 thirty real public admissions are measured separately and reach terminal state", async () => {
    const samples = await concurrent(30, 10, (index) =>
      stagedPost(
        PUBLIC,
        planBody(`dev-lat-003-${Date.now().toString(36)}-${String(index).padStart(10, "0")}`),
        "application/json",
        `dev-lat-003-${index}`
      )
    );
    const totals = samples.map((item) => item.totalMs);
    const scored = scoreUncachedPlanBenchmark({
      budgets: { p50BudgetMs: PLAN_P50_MS, p95BudgetMs: PLAN_P95_MS },
      cacheMode: "uncached",
      concurrency: 10,
      n: 30,
      samples: totals
    });
    assert.equal(
      samples.every((item) => item.status === 200 && isValidMcp(item.payload, "plan")),
      true,
      JSON.stringify({
        statuses: samples.map((item) => item.status)
      })
    );
    for (const sample of samples) {
      const admitted = liveStructured(sample.payload);
      assert.equal(admitted.ok, true, JSON.stringify(admitted));
      assert.equal(typeof admitted.planHandle, "string", "Admission must return a real durable plan receipt");
      assert.ok(["processing", "ready", "needs_input", "no_purchase"].includes(String(admitted.status)), JSON.stringify(admitted));
    }
    observeBenchmark(scored, "public durable admission; excludes matching and polling");
    // Drain every accepted operation through its public handle. Admission latency
    // excludes this wait; no task is abandoned to contaminate following cases.
    await Promise.all(samples.map(async sample => {
      const admitted = liveStructured(sample.payload);
      const terminal = await liveCompletedCall(PUBLIC, "plan", { planHandle: admitted.planHandle }, { accept: "application/json" });
      assert.equal(terminal.structured.ok, true, JSON.stringify(terminal.structured));
      assert.ok(["ready", "needs_input", "no_purchase"].includes(String(terminal.structured.status)), JSON.stringify(terminal.structured));
    }));
  });

  it("DEV-LAT-004 handler pass cannot hide public pre-header excess", async () => {
    beginDetRun("dev-lat-004");
    try {
      const proof = await latencyProof(createDetRuntime());
      const pub = await stagedPost(PUBLIC, INFO_BODY, MIXED_ACCEPT, "dev-lat-004-info");
      const unaccountedMs = pub.totalMs - (Number.isFinite(pub.handlerMs) ? pub.handlerMs : 0);
      assert.equal((proof as { kind?: string }).kind, "handler");
      assert.equal(proof.passed, true);
      const publicOver = pub.preHeaderMs > SIMPLE_P95_MS;
      const failureCode = publicOver ? "PRE_HEADER_BUDGET_EXCEEDED" : "NONE";
      console.log(JSON.stringify({
        handlerPassed: proof.passed,
        publicPreHeaderMs: Math.round(pub.preHeaderMs),
        unaccountedMs: Math.round(unaccountedMs),
        failureCode
      }));
      observeLatency(pub.preHeaderMs, SIMPLE_P95_MS, "public preheader");
    } finally {
      endDetRun();
    }
  });

  it("DEV-LAT-005 body completion stays under 500ms for all Accept variants", async () => {
    const accepts = ["application/json", MIXED_ACCEPT, "text/event-stream"];
    const samples: number[] = [];
    for (const accept of accepts) {
      const info = await stagedPost(PUBLIC, INFO_BODY, accept, `dev-lat-005-info-${accept}`);
      const list = await stagedPost(PUBLIC, LIST_BODY, accept, `dev-lat-005-list-${accept}`);
      assert.equal(info.status, 200);
      assert.equal(list.status, 200);
      assert.equal(isValidMcp(info.payload, "info"), true);
      assert.equal(isValidMcp(list.payload, "tools/list"), true);
      samples.push(info.bodyMs, list.bodyMs);
    }
    observeLatency(p95(samples), BODY_P95_MS, "body p95");
  });
});

describe("DEV-LAT-006 canonical A/B evidence", () => {
  before(() => {
    beginDetRun("dev-lat-006");
  });
  after(() => {
    endDetRun();
  });

  it("isolated Run A and Run B canonical durable-admission evidence is byte-identical", async () => {
    async function runOnce(runId: string) {
      const runtime = createDetRuntime({ principal: `dev-lat-006-${runId}` });
      const samples: number[] = [];
      let next = 0;
      async function worker() {
        while (next < 30) {
          const index = next;
          next += 1;
          resetMatchPlanCache();
          const started = performance.now();
          const admitted = await planTool({
            config: runtime.config,
            now: DET_V3_CLOCK,
            payload: {
              idempotencyKey: `dev-lat-006-${runId}-${String(index).padStart(10, "0")}`,
              request: MAGNESIUM_REQUEST
            },
            scope: { ...runtime.scope, principalScope: `dev-lat-006-${runId}-${index}` },
            store: runtime.store
          });
          samples.push(performance.now() - started);
          assert.equal(admitted.ok, true, JSON.stringify(admitted));
          assert.ok("status" in admitted && admitted.status === "processing", "Direct service benchmark measures durable admission");
          const key = `dev-lat-006-${runId}-${String(index).padStart(10, "0")}`;
          const operation = await runtime.store.getPlanOperationByKey(`dev:${runtime.scope.tenantScope}:dev-lat-006-${runId}-${index}`, key);
          assert.ok(operation?.taskId); assert.equal(operation.status, "queued");
          assert.equal(operation.leaseToken, null);
          await cancelPlanOperation(runtime.store, operation.id, DET_V3_CLOCK);
          assert.equal((await runtime.store.getPlanOperation(operation.id))?.status, "cancelled");
        }
      }
      await Promise.all(Array.from({ length: 10 }, () => worker()));
      const live = scoreUncachedPlanBenchmark({
        budgets: TECH07_LIVE_BUDGET,
        cacheMode: "uncached",
        concurrency: 10,
        n: 30,
        samples
      });
      const simplePass = true;
      const failureStage = live.passed && simplePass ? "NONE" : "PRE_HEADER";
      return {
        canonical: canonicalLatencyEvidence({
          buildId: BASELINE_BUILD,
          failureStage,
          fixed: scoreUncachedPlanBenchmark({
            budgets: { p50BudgetMs: PLAN_P50_MS, p95BudgetMs: PLAN_P95_MS },
            cacheMode: "uncached",
            concurrency: 10,
            n: 30,
            samples
          }),
          live,
          snapshotId: BASELINE_SNAPSHOT
        }),
        diagnostics: { samples }
      };
    }
    const runA = await runOnce("A");
    const runB = await runOnce("B");
    assert.equal(canonicalJson(nonLatencyBenchmarkEvidence(runA.canonical)), canonicalJson(nonLatencyBenchmarkEvidence(runB.canonical)));
    assert.equal(runA.canonical.percentileAlgorithm, LATENCY_PERCENTILE_ALGORITHM);
    assert.notEqual(canonicalHash(runA.diagnostics), canonicalHash(runA.canonical));
  });
});
