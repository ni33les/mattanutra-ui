import { publicFrozenOrder } from "@/lib/agentic/public-mapper";
import { readPlanState } from "@/lib/agentic/presentation/plan-read";
import { simplePlanTool } from "@/lib/agentic/plan/simple-service";
import {
  AGENTIC_INPUT_SCHEMAS,
  AGENTIC_OUTPUT_SCHEMAS,
  businessError,
  isAgenticErrorResult,
  schemaIssuesToError,
  validateToolIssues
} from "@/lib/agentic/contract";
import { createLogger } from "@/lib/logger";
import { infoTool } from "@/lib/agentic/info";
import { executeTool } from "@/lib/agentic/commerce/execute";
import { orderTool } from "@/lib/agentic/commerce/order";
import { supportTool } from "@/lib/agentic/support";
import { feedbackTool } from "@/lib/agentic/feedback";
import { nowIso, type AgenticRuntime } from "@/lib/agentic/runtime";
import {
  canonicalPublicToolName,
  handleLightweightJsonRpc,
  record,
  toolResult,
  type JsonRpcRequest,
  type JsonRpcResponse
} from "@/lib/agentic/mcp/rpc";

const log = createLogger("agentic.mcp.dispatcher");

export {
  advertisedPublicToolName,
  advertisedPublicToolNames,
  canonicalPublicToolName,
  mcpServerInfoName,
  type JsonRpcRequest,
  type JsonRpcResponse
} from "@/lib/agentic/mcp/rpc";
export { AGENTIC_CONTRACT_VERSION } from "@/lib/agentic/config";

async function callTool(
  runtime: AgenticRuntime,
  name: string,
  rawArgs: unknown
) {
  const canonical = canonicalPublicToolName(name);

  if (!canonical) {
    return {
      error: {
        code: -32601,
        message: `Unknown tool: ${name}`
      }
    };
  }

  const schema = AGENTIC_INPUT_SCHEMAS[canonical];
  const args = rawArgs ?? {};
  const issues = validateToolIssues(schema, args);

  if (issues.length > 0) {
    return { result: toolResult(schemaIssuesToError(issues), true, canonical, runtime.resultContent) };
  }

  const params = record(args);
  const now = runtime.now ?? nowIso();

  try {
    let value: unknown;

    switch (canonical) {
      case "info":
        value = await infoTool({
          view: params.view as "overview" | "client_guide" | "plan_schema" | undefined,
          config: runtime.config,
          isolatedInfo: runtime.isolatedInfo,
          locale: typeof params.locale === "string" ? params.locale : undefined
        });
        break;
      case "plan":
        value = await simplePlanTool(runtime, params);
        if (isAgenticErrorResult(value)) value = { ...value, error: { ...value.error,
          fieldPath: value.error.fieldPath?.replace(/^request\./, "") ?? null,
          ...(value.error.issues ? { issues: value.error.issues.map(issue => ({ ...issue, fieldPath: issue.fieldPath.replace(/^request\./, "") })) } : {})
        } };
        break;
      case "execute": {
        const state = await readPlanState(runtime, String(params.planHandle));
        if (isAgenticErrorResult(state)) { value = state; break; }
        value = await executeTool({
          config: runtime.config,
          expectedRevision: Number(params.expectedRevision),
          idempotencyKey: String(params.idempotencyKey),
          now,
          payment: runtime.payment,
          planHandle: String(params.planHandle),
          scope: runtime.scope,
          store: runtime.store
        });
        break;
      }
      case "order":
        value = await orderTool({
          ...(typeof params.locale === "string" ? { locale: params.locale } : {}),
          config: runtime.config,
          now,
          orderHandle: String(params.orderHandle),
          scope: runtime.scope,
          store: runtime.store
        });
        break;
      case "support":
        value = await supportTool({
          config: runtime.config,
          idempotencyKey: String(params.idempotencyKey),
          message: String(params.message),
          now,
          orderHandle: String(params.orderHandle),
          scope: runtime.scope,
          store: runtime.store,
          supportHandle:
            typeof params.supportHandle === "string" ? params.supportHandle : undefined
        });
        break;
      case "feedback":
        value = await feedbackTool({
          config: runtime.config,
          consentConfirmed: params.consentConfirmed,
          expectedRevision: Number(params.expectedRevision),
          idempotencyKey: String(params.idempotencyKey),
          now,
          planHandle: String(params.planHandle),
          points: Array.isArray(params.points)
            ? params.points.filter((item): item is string => typeof item === "string")
            : undefined,
          rating: typeof params.rating === "number" ? params.rating : undefined,
          scope: runtime.scope,
          store: runtime.store,
          summary: typeof params.summary === "string" ? params.summary : undefined
        });
        break;
      default:
        value = businessError({
          message: "Not found.",
          reasonCode: "not_found"
        });
    }

    if (canonical === "execute" && record(value).ok === true) { const executed = record(value); value = { ...executed, frozenPlan: publicFrozenOrder(executed.frozenPlan) }; }
    const outputIssues = validateToolIssues(AGENTIC_OUTPUT_SCHEMAS[canonical], value);
    if (outputIssues.length > 0) {
      log.error("contract_output_invalid", { tool: canonical, fields: outputIssues.map(issue => issue.fieldPath) });
      value = businessError({ reasonCode: "temporarily_unavailable", message: "The response could not be completed consistently. Retry with the same request and idempotency key." });
    }
    return {
      result: toolResult(value, isAgenticErrorResult(value), canonical, runtime.resultContent)
    };
  } catch (error) {
    log.error("tool_failed", {
      message: error instanceof Error ? error.message : "unknown",
      tool: canonical
    });
    return {
      result: toolResult(
        businessError({
          message:
            "The plan service is temporarily unavailable. Retry with the same idempotencyKey.",
          reasonCode: "temporarily_unavailable",
          retryable: true
        }),
        true, canonical, runtime.resultContent
      )
    };
  }
}

export async function handleJsonRpc(
  runtime: AgenticRuntime,
  body: JsonRpcRequest
): Promise<JsonRpcResponse | null> {
  const light = await handleLightweightJsonRpc(
    runtime.config,
    body,
    runtime.isolatedInfo,
    runtime
  );

  if (light !== undefined) {
    return light;
  }

  const id = body.id ?? null;
  const method = body.method ?? "";
  const params = record(body.params);

  if (method === "tools/call") {
    const name = typeof params.name === "string" ? params.name : "";
    const called = await callTool(runtime, name, params.arguments);
    return {
      id,
      jsonrpc: "2.0",
      ...called
    };
  }

  return {
    error: {
      code: -32601,
      message: `Method not found: ${method}`
    },
    id,
    jsonrpc: "2.0"
  };
}
