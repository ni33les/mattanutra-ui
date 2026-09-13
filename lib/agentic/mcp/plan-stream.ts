import type { AgenticRuntime } from "@/lib/agentic/runtime";
import { AGENTIC_OUTPUT_SCHEMAS, isAgenticErrorResult, validateToolIssues } from "@/lib/agentic/contract";
import { readPlanState } from "@/lib/agentic/presentation/plan-read";
import { simplePlanReadDecision } from "@/lib/agentic/plan/simple-service";
import { PLAN_OPERATION_TERMINAL_MS } from "@/lib/agentic/plan/operations";
import { observePlanOperation } from "@/lib/agentic/plan/completion-signals";
import { completionResponse, PLAN_STREAM_FINISH_MS } from "@/lib/agentic/mcp/completion-stream";
import { mcpOneShotResponse, wantsMcpSse } from "@/lib/agentic/mcp/transport";
import { record, toolResult, type JsonRpcResponse } from "@/lib/agentic/mcp/rpc";
import { requestLifetime, withRequestLifetime } from "@/lib/request-lifetime";
import { recordServiceMetric } from "@/lib/service-metrics";
import { createLogger } from "@/lib/logger";

const log = createLogger("mcp.completion");
function decision(response: JsonRpcResponse) {
  if (response.result?.structuredContent) return record(response.result.structuredContent);
  const content = response.result?.content;
  if (Array.isArray(content) && typeof content[0]?.text === "string") {
    try { return record(JSON.parse(content[0].text)); } catch { /* not a plan result */ }
  }
  return {};
}

export async function planCompletionResponse(input: {
  request: Request; initial: JsonRpcResponse; runtime: AgenticRuntime; headers?: HeadersInit;
  withinScope?: <T>(work: () => Promise<T>) => Promise<T>;
}) {
  const { request, initial, runtime, headers } = input;
  if (!wantsMcpSse(request.headers.get("accept"))) return null;
  const initialDecision = decision(initial);
  if (initialDecision.ok !== true || initialDecision.status !== "processing" || typeof initialDecision.planHandle !== "string") return null;
  const handle = initialDecision.planHandle;
  const lifetime = requestLifetime();
  const scoped = input.withinScope ?? (<T>(work: () => Promise<T>) => work());
  try {
    const state = await readPlanState(runtime, handle);
    const operation = isAgenticErrorResult(state) ? null : state.operation;
    const read = (signal: AbortSignal) => withRequestLifetime({ ...lifetime, signal }, () => scoped(async () => {
      // SQL includes the full stored result only when no operation is pending.
      // No matching, scheduling, cursor reads or maintenance writes occur here.
      const current = await readPlanState(runtime, handle, undefined, "terminal");
      const value = isAgenticErrorResult(current) ? current : simplePlanReadDecision(current, handle);
      if (validateToolIssues(AGENTIC_OUTPUT_SCHEMAS.plan, value).length) throw new Error("Invalid streamed plan response");
      return {
        response: { id: initial.id, jsonrpc: "2.0" as const, result: toolResult(value, isAgenticErrorResult(value), "plan", runtime.resultContent) },
        done: value.ok === false || value.status !== "processing" || (!isAgenticErrorResult(current) && current.operation?.id !== operation?.id)
      };
    }));
    if (!operation || !["queued", "running", "retryable"].includes(operation.status)) {
      const final = await read(request.signal);
      return mcpOneShotResponse(request.headers.get("accept"), final.response, 200, headers as Record<string, string>);
    }
    const deadline = operation.deadlineAt ? Date.parse(operation.deadlineAt) : Date.parse(operation.createdAt) + PLAN_OPERATION_TERMINAL_MS;
    return completionResponse({ initial, signal: request.signal, headers, read,
      waitMs: Math.max(0, deadline - Date.now() - PLAN_STREAM_FINISH_MS),
      subscribe: (notify, disconnect) => observePlanOperation(operation.id, notify, disconnect),
      onFinish: (outcome, durationMs) => {
        recordServiceMetric("mcp.stream_wait_ms", durationMs);
        recordServiceMetric(`mcp.stream.${outcome}`, 1);
        log.info("stream_completed", { outcome, durationMs: Math.round(durationMs), correlationId: lifetime?.correlationId });
      }
    });
  } catch (error) {
    log.warn("stream_setup_fallback", { message: error instanceof Error ? error.message : "unknown" });
    return null;
  }
}
