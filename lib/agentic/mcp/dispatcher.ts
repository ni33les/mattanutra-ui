import {
  AGENTIC_INPUT_SCHEMAS,
  isAgenticErrorResult,
  schemaIssuesToError,
  validateToolIssues
} from "@/lib/agentic/contract";
import { infoTool } from "@/lib/agentic/info";
import { withLivePlanRequest } from "@/lib/agentic/plan/warm-dev";
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

function inferPlanOperation(params: Record<string, unknown>) {
  if (typeof params.operation === "string") {
    return params.operation;
  }

  if (!params.planHandle) {
    return "create";
  }

  if (Array.isArray(params.answers) && params.answers.length > 0) {
    return "answer";
  }

  if (params.safetyAcknowledgement != null) {
    return "answer";
  }

  if (
    typeof params.optionId === "string" ||
    typeof params.selectOptionId === "string"
  ) {
    return "select";
  }

  if (params.request != null) {
    return "revise";
  }

  return "get";
}

function withPlanOperation(args: unknown): unknown {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return args;
  }

  const params = args as Record<string, unknown>;
  const operation = inferPlanOperation(params);

  if (operation === "get") {
    return {
      operation: "get",
      planHandle: params.planHandle
    };
  }

  if (operation === "select") {
    const optionId =
      typeof params.optionId === "string" ? params.optionId : params.selectOptionId;
    const { selectOptionId: _selectOptionId, ...rest } = params;
    void _selectOptionId;
    return {
      ...rest,
      operation,
      optionId
    };
  }

  if (operation === "answer") {
    return {
      ...params,
      operation
    };
  }

  return {
    ...params,
    operation
  };
}

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
  const args =
    canonical === "plan"
      ? withPlanOperation(rawArgs === undefined ? {} : rawArgs)
      : rawArgs === undefined
        ? {}
        : rawArgs;
  const issues = validateToolIssues(schema, args);

  if (issues.length > 0) {
    return { result: toolResult(schemaIssuesToError(issues), true) };
  }

  const params = record(args);
  const now = runtime.now ?? nowIso();

  let value: unknown;

  switch (canonical) {
    case "info":
      value = await infoTool({
        config: runtime.config,
        isolatedInfo: runtime.isolatedInfo,
        locale: typeof params.locale === "string" ? params.locale : undefined
      });
      break;
    case "plan":
      value = await withLivePlanRequest(() =>
        planTool({
          config: runtime.config,
          deferProcessing: runtime.deferProcessing,
          matchPort: runtime.matchPort,
          now,
          payload: {
            answers: params.answers,
            expectedRevision:
              typeof params.expectedRevision === "number"
                ? params.expectedRevision
                : undefined,
            idempotencyKey:
              typeof params.idempotencyKey === "string"
                ? params.idempotencyKey
                : undefined,
            operation:
              params.operation === "answer" ||
              params.operation === "create" ||
              params.operation === "get" ||
              params.operation === "revise" ||
              params.operation === "select"
                ? params.operation
                : undefined,
            planHandle:
              typeof params.planHandle === "string" ? params.planHandle : undefined,
            request: params.request,
            safetyAcknowledgement: params.safetyAcknowledgement,
            selectOptionId:
              typeof params.optionId === "string"
                ? params.optionId
                : typeof params.selectOptionId === "string"
                  ? params.selectOptionId
                  : undefined
          },
          scope: runtime.scope,
          store: runtime.store
        })
      );
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
  const light = await handleLightweightJsonRpc(
    runtime.config,
    body,
    runtime.isolatedInfo
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
