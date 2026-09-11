import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { mcpTestTarget, isolatedMcpClientHeaders } from "../../scripts/mcp-test-target.mjs";
import { decodeMcpPayload } from "../../lib/agentic/mcp/transport.ts";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";

const target = mcpTestTarget();
export const LIVE_PUBLIC = target.publicUrl;
export const LIVE_ORIGIN = target.originUrl;
export const LIVE_QA = target.qaUrl;
export const LIVE_CLIENT_HEADERS = isolatedMcpClientHeaders(target, process.pid);

export type LiveMcpCall = Readonly<{
  headers: Record<string, string>;
  ms: number;
  status: number;
  structured: Record<string, unknown>;
}>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function liveStructured(payload: unknown): Record<string, unknown> {
  const root = asRecord(payload);
  const result = asRecord(root.result);
  if (Object.keys(result).length > 0) {
    const structured = asRecord(result.structuredContent);
    return Object.keys(structured).length > 0 ? structured : result;
  }
  return root;
}

export function livePost(
  url: string,
  body: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<LiveMcpCall> {
  const target = new URL(url);
  const payload = JSON.stringify(body);
  const transport = target.protocol === "https:" ? https : http;
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const request = transport.request(
      {
        headers: {
          accept: "application/json, text/event-stream",
          "content-length": Buffer.byteLength(payload),
          "content-type": "application/json",
          ...LIVE_CLIENT_HEADERS,
          ...extraHeaders
        },
        hostname: target.hostname,
        method: "POST",
        path: `${target.pathname}${target.search}`,
        port: target.port || undefined
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.from(chunk));
        });
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const contentType = String(response.headers["content-type"] ?? "");
          let decoded: unknown = {};
          try {
            decoded = decodeMcpPayload(contentType, text);
          } catch {
            try {
              decoded = JSON.parse(text);
            } catch {
              decoded = { raw: text };
            }
          }
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(response.headers)) {
            if (typeof value === "string") {
              headers[key.toLowerCase()] = value;
            }
          }
          resolve({
            headers,
            ms: Date.now() - started,
            status: response.statusCode ?? 0,
            structured: liveStructured(decoded)
          });
        });
      }
    );
    request.on("error", reject);
    request.setTimeout(30_000, () => request.destroy(new Error("MCP test request exceeded 30 seconds.")));
    request.write(payload);
    request.end();
  });
}

export function liveCall(
  url: string,
  name: string,
  args: Record<string, unknown>,
  extraHeaders: Record<string, string> = {}
) {
  return livePost(
    url,
    {
      id: 1,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: args, name }
    },
    extraHeaders
  );
}

/** Current public client: flat requests and handle-only polling. The external
 * task worker performs matching. No private field or retired-response adapter. */
export async function liveCompletedCall(url: string, name: string, args: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
  if (!/(^|[._])plan$/.test(name)) return liveCall(url, name, args, extraHeaders);
  const started = Date.now();
  let result = await liveCall(url, name, args, extraHeaders);
  const handle = result.structured.planHandle;
  while (result.structured.ok === true && result.structured.status === "processing") {
    assert.ok(typeof handle === "string", "Processing requires a returned plan handle");
    assert.ok(Date.now() - started < 175_000, "Matching exceeded its published overall deadline");
    await delay(Math.max(1, Number(result.structured.pollAfterSeconds) || 1) * 1000);
    result = await liveCall(url, name, { planHandle: handle }, extraHeaders);
  }
  return { ...result, ms: Date.now() - started };
}

/** Test-harness observation of retained financial internals, separate from the
 * HTTP client. Never runs against a live customer database. */
export async function observeIsolatedStoredPlan(handle: unknown, revision: unknown) {
  assert.equal(target.isolatedCandidate, true, "Internal ledger evidence requires an isolated candidate");
  assert.equal(typeof handle, "string"); assert.equal(typeof revision, "number");
  const { createRuntimeStore } = await import("../../lib/agentic/store/postgres.ts");
  const { hashCapability } = await import("../../lib/agentic/capabilities.ts");
  const { loadAgenticConfig } = await import("../../lib/agentic/config.ts");
  const { publicPlanFields } = await import("../../lib/agentic/public-mapper.ts");
  const store = createRuntimeStore();
  const capability = await store.getCapabilityByHash(hashCapability(loadAgenticConfig().capabilitySecret, handle as string));
  assert.ok(capability, "Returned handle must identify a stored plan");
  const saved = await store.getPlanRevision(capability.resourceId, revision as number);
  assert.ok(saved, "Terminal public revision must be stored");
  // Retained financial/canonical projection, not the public conversational DTO.
  return publicPlanFields(saved.result) as unknown as Record<string, unknown>;
}

export function magCurrentRequest(
  dailyAmount: number,
  daysRemaining?: number
): Record<string, unknown> {
  const current: Record<string, unknown> = {
    dailyAmount,
    name: "Magnesium",
    unit: "mg"
  };
  if (daysRemaining != null) {
    current.daysRemaining = daysRemaining;
  }
  return {
    destinationCountry: "TH",
    locale: "en",
    scoring: { profile: "lowest_cost" },
    profile: { ageYears: 52, lifeStage: "adult", sex: "male" },
    requirements: {},
    currentSupplements: [current],
    targets: [{ amount: 300, name: "Magnesium", unit: "mg" }]
  };
}

export function stamp(label: string) {
  return `live-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
