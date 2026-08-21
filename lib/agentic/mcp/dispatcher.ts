import {
  AGENTIC_TOOL_SCHEMAS,
  isAgenticErrorResult,
  schemaIssueToError,
  validateToolInput
} from "@/lib/agentic/contract";
import { infoTool } from "@/lib/agentic/info";
import { planTool } from "@/lib/agentic/plan/service";
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

  const schema = AGENTIC_TOOL_SCHEMAS[canonical];
  const args = rawArgs === undefined ? {} : rawArgs;
  const issue = validateToolInput(schema, args);

  if (issue) {
    return { result: toolResult(schemaIssueToError(issue), true) };
  }

  const params = record(args);
  const now = nowIso();

  let value: unknown;

  switch (canonical) {
    case "info":
      value = infoTool({
        config: runtime.config,
        locale: typeof params.locale === "string" ? params.locale : undefined
      });
      break;
    case "plan":
      value = await planTool({
        config: runtime.config,
        now,
        payload: {
          answers: params.answers,
          expectedRevision:
            typeof params.expectedRevision === "number"
              ? params.expectedRevision
              : undefined,
          idempotencyKey: String(params.idempotencyKey),
          planHandle:
            typeof params.planHandle === "string" ? params.planHandle : undefined,
          request: params.request,
          safetyAcknowledgement: params.safetyAcknowledgement,
          selectOptionId:
            typeof params.selectOptionId === "string"
              ? params.selectOptionId
              : undefined
        },
        scope: runtime.scope,
        store: runtime.store
      });
      break;
    case "execute":
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
    case "order":
      value = await orderTool({
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
        optionId: typeof params.optionId === "string" ? params.optionId : undefined,
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
      value = { error: { message: "Unknown tool" }, ok: false };
  }

  return {
    result: toolResult(value, isAgenticErrorResult(value))
  };
}

export async function handleJsonRpc(
  runtime: AgenticRuntime,
  body: JsonRpcRequest
): Promise<JsonRpcResponse | null> {
  const light = handleLightweightJsonRpc(runtime.config, body);

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
