import {
  AGENTIC_CONTRACT_VERSION,
  AGENTIC_SERVICE_NAME,
  AGENTIC_SERVICE_VERSION
} from "@/lib/agentic/config";
import {
  AGENTIC_PUBLIC_TOOLS,
  AGENTIC_SERVER_INSTRUCTIONS,
  AGENTIC_TOOL_DESCRIPTIONS,
  AGENTIC_TOOL_SCHEMAS,
  isAgenticErrorResult,
  schemaIssueToError,
  validateToolInput,
  type AgenticPublicToolName
} from "@/lib/agentic/contract";
import { infoTool } from "@/lib/agentic/info";
import { planTool } from "@/lib/agentic/plan/service";
import { executeTool } from "@/lib/agentic/commerce/execute";
import { orderTool } from "@/lib/agentic/commerce/order";
import { supportTool } from "@/lib/agentic/support";
import { feedbackTool } from "@/lib/agentic/feedback";
import { nowIso, type AgenticRuntime } from "@/lib/agentic/runtime";

export type JsonRpcRequest = Readonly<{
  id?: number | string | null;
  jsonrpc?: string;
  method?: string;
  params?: unknown;
}>;

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function canonicalPublicToolName(raw: string): AgenticPublicToolName | null {
  const trimmed = raw.trim();

  if (AGENTIC_PUBLIC_TOOLS.includes(trimmed as AgenticPublicToolName)) {
    return trimmed as AgenticPublicToolName;
  }

  const separator = trimmed.lastIndexOf(".");
  if (separator <= 0) {
    return null;
  }

  const suffix = trimmed.slice(separator + 1);
  if (AGENTIC_PUBLIC_TOOLS.includes(suffix as AgenticPublicToolName)) {
    return suffix as AgenticPublicToolName;
  }

  return null;
}

function mcpServerInfoName(environment: AgenticRuntime["config"]["environment"]) {
  if (environment === "dev") {
    return "mattanutra_dev";
  }

  if (environment === "uat") {
    return "mattanutra_uat";
  }

  return AGENTIC_SERVICE_NAME;
}

function toolList() {
  return AGENTIC_PUBLIC_TOOLS.map((name) => ({
    description: AGENTIC_TOOL_DESCRIPTIONS[name],
    inputSchema: AGENTIC_TOOL_SCHEMAS[name],
    name
  }));
}

function toolText(value: unknown) {
  if (!value || typeof value !== "object") {
    return String(value);
  }

  const recordValue = value as Record<string, unknown>;
  const error = recordValue.error;

  if (recordValue.ok === false && error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "Request failed.";
  }

  if (typeof recordValue.summary === "string" && recordValue.summary.trim()) {
    const questions = recordValue.questions;
    const first =
      Array.isArray(questions) && questions[0] && typeof questions[0] === "object"
        ? (questions[0] as { prompt?: unknown }).prompt
        : null;
    return typeof first === "string" && first.trim()
      ? `${recordValue.summary}\n${first}`
      : recordValue.summary;
  }

  if (
    recordValue.lookupStatus === "found" &&
    typeof recordValue.message === "string" &&
    recordValue.message.trim()
  ) {
    return recordValue.message;
  }

  const paid =
    recordValue.paymentStatus === "paid" ||
    recordValue.orderStatus === "completed";

  if (paid && typeof recordValue.orderReference === "string") {
    return `Order ${recordValue.orderReference} is completed and paid.`;
  }

  if (
    typeof recordValue.orderReference === "string" &&
    recordValue.checkoutUrl &&
    recordValue.paymentStatus !== "paid"
  ) {
    return `Checkout ready for ${recordValue.orderReference}. Poll the order; the browser is not payment truth.`;
  }

  if (typeof recordValue.paymentStatus === "string") {
    return `Order paymentStatus=${recordValue.paymentStatus} stateVersion=${recordValue.stateVersion ?? "?"}.`;
  }

  if (typeof recordValue.serviceName === "string") {
    return `${recordValue.serviceName} ${recordValue.environment ?? ""} contract ${recordValue.contractVersion ?? ""}`.trim();
  }

  if (typeof recordValue.message === "string") {
    return recordValue.message;
  }

  return "ok";
}

function toolResult(value: unknown, isError = false) {
  return {
    content: [
      {
        text: toolText(value),
        type: "text"
      }
    ],
    isError,
    structuredContent: value
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
          expectedRevision:
            typeof params.expectedRevision === "number"
              ? params.expectedRevision
              : undefined,
          idempotencyKey: String(params.idempotencyKey),
          planHandle:
            typeof params.planHandle === "string" ? params.planHandle : undefined,
          request: params.request,
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

export type JsonRpcResponse = Readonly<{
  error?: Readonly<{ code: number; message: string }>;
  id: number | string | null;
  jsonrpc: "2.0";
  result?: Record<string, unknown>;
}>;

export async function handleJsonRpc(
  runtime: AgenticRuntime,
  body: JsonRpcRequest
): Promise<JsonRpcResponse | null> {
  const id = body.id ?? null;
  const method = body.method ?? "";
  const params = record(body.params);

  if (method === "initialize") {
    return {
      id,
      jsonrpc: "2.0",
      result: {
        capabilities: {
          tools: { listChanged: false }
        },
        instructions: AGENTIC_SERVER_INSTRUCTIONS,
        protocolVersion: "2025-03-26",
        serverInfo: {
          name: mcpServerInfoName(runtime.config.environment),
          version: AGENTIC_SERVICE_VERSION
        }
      }
    };
  }

  if (method === "notifications/initialized") {
    return null;
  }

  if (method === "ping") {
    return { id, jsonrpc: "2.0", result: {} };
  }

  if (method === "tools/list") {
    return {
      id,
      jsonrpc: "2.0",
      result: { tools: toolList() }
    };
  }

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

export { AGENTIC_CONTRACT_VERSION };
