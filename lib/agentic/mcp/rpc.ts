import type { AgenticConfig, AgenticEnvironment } from "@/lib/agentic/config";
import {
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

export type JsonRpcRequest = Readonly<{
  id?: number | string | null;
  jsonrpc?: string;
  method?: string;
  params?: unknown;
}>;

export type JsonRpcResponse = Readonly<{
  error?: Readonly<{ code: number; message: string }>;
  id: number | string | null;
  jsonrpc: "2.0";
  result?: Record<string, unknown>;
}>;

export function record(value: unknown) {
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

export function mcpServerInfoName(environment: AgenticEnvironment) {
  if (environment === "dev") {
    return "mattanutra_dev";
  }

  if (environment === "uat") {
    return "mattanutra_uat";
  }

  return AGENTIC_SERVICE_NAME;
}

export function advertisedPublicToolName(
  environment: AgenticEnvironment,
  name: AgenticPublicToolName
) {
  return `${mcpServerInfoName(environment)}.${name}`;
}

export function advertisedPublicToolNames(environment: AgenticEnvironment) {
  return AGENTIC_PUBLIC_TOOLS.map((name) => advertisedPublicToolName(environment, name));
}

export function toolList() {
  return AGENTIC_PUBLIC_TOOLS.map((name) => ({
    description: AGENTIC_TOOL_DESCRIPTIONS[name],
    inputSchema: AGENTIC_TOOL_SCHEMAS[name],
    name
  }));
}

export function toolText(value: unknown) {
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

export function toolResult(value: unknown, isError = false) {
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

export function mcpCallNeedsStore(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return true;
  }

  const method = (body as { method?: unknown }).method;
  if (
    method === "initialize" ||
    method === "tools/list" ||
    method === "ping" ||
    method === "notifications/initialized"
  ) {
    return false;
  }

  if (method === "tools/call") {
    const name = (body as { params?: { name?: unknown } }).params?.name;
    const canonical = typeof name === "string" ? canonicalPublicToolName(name) : null;
    return canonical !== "info";
  }

  return true;
}

export function handleLightweightJsonRpc(
  config: AgenticConfig,
  body: JsonRpcRequest
): JsonRpcResponse | null | undefined {
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
          name: mcpServerInfoName(config.environment),
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
    const canonical = canonicalPublicToolName(name);

    if (!canonical) {
      return {
        error: {
          code: -32601,
          message: `Unknown tool: ${name}`
        },
        id,
        jsonrpc: "2.0"
      };
    }

    if (canonical !== "info") {
      return undefined;
    }

    const args = params.arguments === undefined ? {} : params.arguments;
    const issue = validateToolInput(AGENTIC_TOOL_SCHEMAS.info, args);

    if (issue) {
      return {
        id,
        jsonrpc: "2.0",
        result: toolResult(schemaIssueToError(issue), true)
      };
    }

    const locale =
      args && typeof args === "object" && !Array.isArray(args)
        ? (args as { locale?: unknown }).locale
        : undefined;

    const value = infoTool({
      config,
      locale: typeof locale === "string" ? locale : undefined
    });

    return {
      id,
      jsonrpc: "2.0",
      result: toolResult(value, isAgenticErrorResult(value))
    };
  }

  return undefined;
}
