import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { decodeMcpPayload } from "../../lib/agentic/mcp/transport.ts";

export const LIVE_PUBLIC = "https://dev.mattanutra.com/api/mcp";
export const LIVE_ORIGIN = "http://127.0.0.1:3000/api/mcp";
export const LIVE_QA = "https://dev.mattanutra.com/api/mcp/qa";

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
    optimization: "lowest_cost",
    profile: { ageYears: 52, lifeStage: "adult", sex: "male" },
    requirements: {},
    currentSupplements: [current],
    targets: [{ amount: 300, name: "Magnesium", unit: "mg" }]
  };
}

export function stamp(label: string) {
  return `live-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
