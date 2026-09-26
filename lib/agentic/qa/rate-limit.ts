import type { AgenticEnvironment } from "@/lib/agentic/config";
import { hasActiveQaPackClient } from "@/lib/agentic/qa/persist";
import {
  qaNamespaceFromRequest,
  resolveQaSession
} from "@/lib/agentic/qa/session";
import { getRequestClientIp } from "@/lib/request-client-ip";
import { enforceRateLimit, publicRateLimits, type RateLimitStore } from "@/lib/rate-limit";

export { qaNamespaceFromRequest };

export async function qaPackRateLimitApplies(
  request: Request,
  environment: AgenticEnvironment,
  body?: unknown
) {
  if (environment === "prd") {
    return false;
  }

  let pathname = "";
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    pathname = "";
  }
  if (pathname.startsWith("/api/mcp/qa")) {
    return true;
  }

  const namespace = qaNamespaceFromRequest(request, body);
  if (namespace) {
    return Boolean(await resolveQaSession(namespace));
  }

  const clientKey = getRequestClientIp(request);
  if (!clientKey) {
    return false;
  }

  return hasActiveQaPackClient(clientKey);
}

export async function enforceMcpOrQaRateLimit(
  request: Request,
  environment: AgenticEnvironment,
  body?: unknown
) {
  if (await qaPackRateLimitApplies(request, environment, body)) {
    return enforceRateLimit(request, publicRateLimits.mcpQaPack);
  }
  return enforceRateLimit(request, publicMcpRateLimit(body));
}


/** Shared ordinary-client bucket selection; QA allowance is resolved separately. */
export function publicMcpRateLimit(body?: unknown) {
  const params = body && typeof body === "object" ? (body as { params?: { name?: unknown } }).params : undefined;
  const name = typeof params?.name === "string" ? params.name.split(".").pop() : "";
  return name === "order" ? publicRateLimits.mcpRead : publicRateLimits.mcp;
}

/** Bounded in-process proof, isolated from ordinary clients and active QA packs.
 * Its private map lives for these 63 calls; customer capacity and counters are untouched. */
export async function mutationRateLimitProof() {
  const tools = ["plan", "execute", "feedback"];
  const proofStore: RateLimitStore = new Map();
  const request = new Request("https://mcp-proof.invalid/api/mcp", { method: "POST" });
  const configurations = tools.map(name => publicMcpRateLimit({ method: "tools/call", params: { name } }));
  let allowedRequests = 0;
  for (let index = 0; index < 60; index++) {
    const config = configurations[index % tools.length];
    if (enforceRateLimit(request, config, proofStore) === null) allowedRequests++;
  }
  const blocked = [];
  for (const [index, tool] of tools.entries()) {
    const config = configurations[index];
    const response = enforceRateLimit(request, config, proofStore);
    let body: { retryAfterSeconds?: unknown } | null = null;
    try { body = response ? await response.json() : null; } catch { /* Invalid response fails the evidence checks below. */ }
    const retryAfterSeconds = Number(response?.headers.get("Retry-After"));
    blocked.push({ tool, status: response?.status ?? null, limit: response?.headers.get("RateLimit-Limit") ?? null,
      remaining: response?.headers.get("RateLimit-Remaining") ?? null,
      retryAfterPositive: Number.isFinite(retryAfterSeconds) && Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0,
      retryWithinWindow: retryAfterSeconds <= 60, retryMetadataConsistent: body?.retryAfterSeconds === retryAfterSeconds,
      cacheControl: response?.headers.get("Cache-Control") ?? null });
  }
  const configured = configurations.every(config => config.name === "mcp" && config.limit === 60 && config.windowMs === 60_000);
  const passed = configured && allowedRequests === 60 && blocked.every(result => result.status === 429 && result.limit === "60" &&
    result.remaining === "0" && result.retryAfterPositive && result.retryWithinWindow && result.retryMetadataConsistent && result.cacheControl === "no-store");
  return { passed, evidence: { mutationRateLimit: "mcp 60/min shared by plan/execute/feedback",
    scope: "in-process limiter and shared ordinary-client bucket selection", configured, allowedRequests, blocked } };
}
