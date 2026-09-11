import { businessError } from "@/lib/agentic/contract/errors";
import { canonicalPublicToolName, record, type JsonRpcRequest } from "@/lib/agentic/mcp/rpc";

// PostgreSQL cancellation/connection/capacity failures and transport failures.
// Validation errors and programming defects must not become retry promises.
const transientCodes = new Set(["57014", "55P03", "40P01", "40001", "53300", "57P01", "57P02", "57P03", "08000", "08003", "08006", "08001", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE"]);
export function requestSetupRecovery(error: unknown, body: unknown, correlationId: string) {
  if (!error || typeof error !== "object" || !("code" in error) || !transientCodes.has(String(error.code))) return null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const call = body as JsonRpcRequest;
  const params = call.params as { name?: unknown; arguments?: unknown } | undefined;
  if (call.method !== "tools/call" || typeof params?.name !== "string") return null;
  const args = record(params.arguments);
  const poll = canonicalPublicToolName(params.name) === "plan" && typeof args.planHandle === "string" && Object.keys(args).length === 1;
  const mutation = typeof args.idempotencyKey === "string";
  return businessError({ reasonCode: "temporarily_unavailable", correlationId,
    message: poll ? "Plan status is temporarily unavailable. Poll the same plan handle; do not start another match." : mutation ? "The service is temporarily unavailable. Retry the same request with its original idempotency key and unchanged input." : "The service is temporarily unavailable. Retry the same read request with unchanged input.",
    nextActions: [poll ? "poll_plan" : "retry_same_request"] });
}
