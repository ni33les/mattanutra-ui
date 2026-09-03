import type { AgenticEnvironment } from "@/lib/agentic/config";
import { hasActiveQaPackClient } from "@/lib/agentic/qa/persist";
import {
  qaNamespaceFromRequest,
  resolveQaSession
} from "@/lib/agentic/qa/session";
import { getRequestClientIp } from "@/lib/request-client-ip";
import { enforceRateLimit, publicRateLimits } from "@/lib/rate-limit";

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
  return enforceRateLimit(request, publicRateLimits.mcp);
}
