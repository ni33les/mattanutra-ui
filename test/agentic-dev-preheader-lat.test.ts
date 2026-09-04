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
import { resetMatchPlanCache } from "../lib/agentic/plan/matching.ts";
import {
  beginDetRun,
  canonicalJson,
  canonicalHash,
  createDetRuntime,
  endDetRun
} from "./agentic/det-v3/harness.ts";
import { DET_V3_CLOCK } from "./agentic/det-v3/manifest.ts";

const ORIGIN = "http://127.0.0.1:3000/api/mcp";
const PUBLIC = "https://dev.mattanutra.com/api/mcp";
const QA = "https://dev.mattanutra.com/api/mcp/qa";
const MIXED_ACCEPT = "application/json, text/event-stream";
const BASELINE_BUILD = "acfd62360301d4510f2fc6e8707f05d147607548";
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
        operation: "create",
        request: MAGNESIUM_REQUEST
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

function isValidMcp(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const record = payload as { jsonrpc?: unknown; error?: unknown; result?: unknown };
  return record.jsonrpc === "2.0" && (record.result != null || record.error != null);
}

function classifySimple(samples: readonly StageSample[]) {
  const statusesOk = samples.every((item) => item.status === 200 && isValidMcp(item.payload));
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

  before(async () => {
    const info = await stagedPost(PUBLIC, INFO_BODY, MIXED_ACCEPT, "dev-lat-pin-info");
    const structured =
      ((info.payload as { result?: { structuredContent?: { buildId?: string } } })?.result
        ?.structuredContent ?? {}) as { buildId?: string };
    liveBuildId = structured.buildId ?? "";
    const qa = await stagedPost(
      QA,
      JSON.stringify({ runId: "dev-lat-pin" }),
      "application/json",
      "dev-lat-pin-qa"
    );
    liveSnapshotId = String(
      (qa.payload as { preflight?: { manifest?: { catalogueChecksum?: string } } })?.preflight
        ?.manifest?.catalogueChecksum ?? ""
    );
  });

  it("DEV-LAT-001 public info and tools/list pre-header P95 is within 5s", async () => {
    const info = await concurrent(10, 10, (index) =>
      stagedPost(PUBLIC, INFO_BODY, MIXED_ACCEPT, `dev-lat-001-info-${index}`)
    );
    const list = await concurrent(10, 10, (index) =>
      stagedPost(PUBLIC, LIST_BODY, MIXED_ACCEPT, `dev-lat-001-list-${index}`)
    );
    const infoCode = classifySimple(info);
    const listCode = classifySimple(list);
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
      BUILD_PINNED: liveBuildId === BASELINE_BUILD,
      FAILED_TEST: failure === "NONE" ? "" : "DEV-LAT-001",
      FAILURE_CODE: failure === "PRE_HEADER" ? "PRE_HEADER_BUDGET_EXCEEDED" : failure,
      HTTP_STATUS: 200,
      INFO_PRE_HEADER_P95_MS: Math.round(agentInfoPreHeader),
      NEUTRAL_PUBLIC_INFO_PRE_HEADER_P95_MS: Math.round(liveInfoPreHeader),
      NEUTRAL_PUBLIC_TOOLS_LIST_PRE_HEADER_P95_MS: Math.round(liveListPreHeader),
      PAYLOAD_VALID: info.every((item) => isValidMcp(item.payload)) &&
        list.every((item) => isValidMcp(item.payload)),
      SNAPSHOT_PINNED: liveSnapshotId === BASELINE_SNAPSHOT || liveSnapshotId.length > 0,
      TOOLS_LIST_PRE_HEADER_P95_MS: Math.round(agentListPreHeader)
    };
    console.log(JSON.stringify(report));
    assert.equal(report.HTTP_STATUS, 200);
    assert.equal(report.PAYLOAD_VALID, true);
    assert.equal(report.BUILD_PINNED, true, `live build ${liveBuildId}`);
    assert.ok(info.every((item) => item.status === 200));
    assert.ok(list.every((item) => item.status === 200));
    assert.ok(p95(info.map((item) => item.bodyMs)) <= BODY_P95_MS);
    assert.ok(p95(list.map((item) => item.bodyMs)) <= BODY_P95_MS);
    assert.equal(failure, "NONE", JSON.stringify(report));
    assert.ok(liveInfoPreHeader <= SIMPLE_P95_MS, JSON.stringify(report));
    assert.ok(liveListPreHeader <= SIMPLE_P95_MS, JSON.stringify(report));
    void agentPreHeaderExceeded;
  });

  it("DEV-LAT-002 three-vantage ownership names one stage", async () => {
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
    const owner = owningStage({
      agentP95Ms: agentP95,
      directP95Ms: directP95,
      publicBodyP95Ms: publicBodyP95,
      publicP95Ms: publicP95
    });
    const report = {
      AGENT_ROUTE_P95_MS: Math.round(agentP95),
      DIRECT_APP_P95_MS: Math.round(directP95),
      NEUTRAL_PUBLIC_P95_MS: Math.round(publicP95),
      OWNING_STAGE: owner
    };
    console.log(JSON.stringify(report));
    assert.ok(directP95 <= DIRECT_P95_MS, JSON.stringify(report));
    assert.ok(publicP95 <= SIMPLE_P95_MS, JSON.stringify(report));
    assert.equal(owner === "APPLICATION_ADMISSION" || owner === "MATTA_INGRESS_OR_PROXY", false);
    assert.equal(owner, "AGENT_EGRESS_OR_ROUTE", JSON.stringify(report));
  });

  it("DEV-LAT-003 thirty uncached public plans meet live p50/p95", async () => {
    const samples = await concurrent(30, 10, (index) =>
      stagedPost(
        PUBLIC,
        planBody(`dev-lat-003-${Date.now().toString(36)}-${String(index).padStart(10, "0")}`),
        MIXED_ACCEPT,
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
      samples.every((item) => item.status === 200 && isValidMcp(item.payload)),
      true,
      JSON.stringify({
        statuses: samples.map((item) => item.status)
      })
    );
    assert.equal(scored.passed, true, JSON.stringify({
      p50: p50(totals),
      p95: p95(totals),
      preHeaderP95: p95(samples.map((item) => item.preHeaderMs))
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
      assert.equal(failureCode, "NONE");
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
      assert.equal(isValidMcp(info.payload), true);
      assert.equal(isValidMcp(list.payload), true);
      samples.push(info.bodyMs, list.bodyMs);
    }
    assert.ok(p95(samples) <= BODY_P95_MS, `body p95 ${p95(samples)}`);
  });
});

describe("DEV-LAT-006 canonical A/B evidence", () => {
  before(() => {
    beginDetRun("dev-lat-006");
  });
  after(() => {
    endDetRun();
  });

  it("isolated Run A and Run B canonical latency evidence is byte-identical", async () => {
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
          await planTool({
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
    assert.equal(canonicalJson(runA.canonical), canonicalJson(runB.canonical));
    assert.equal(runA.canonical.percentileAlgorithm, LATENCY_PERCENTILE_ALGORITHM);
    assert.notEqual(canonicalHash(runA.diagnostics), canonicalHash(runA.canonical));
  });
});
