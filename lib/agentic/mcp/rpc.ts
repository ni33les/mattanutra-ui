import { createLogger } from "@/lib/logger";
import { AGENTIC_CONTRACT_REGISTRY } from "@/lib/agentic/contract/registry";
import { CONTRACT_RESOURCES, readContractResource } from "@/lib/agentic/contract/guide";
import type { AgenticConfig, AgenticEnvironment } from "@/lib/agentic/config";
import {
  AGENTIC_SERVICE_NAME,
  AGENTIC_SERVICE_VERSION
} from "@/lib/agentic/config";
import {
  AGENTIC_PUBLIC_TOOLS,
  AGENTIC_TOOL_SCHEMAS,
  AGENTIC_OUTPUT_SCHEMAS,
  agenticServerInstructions,
  agenticToolDescriptions,
  isAgenticErrorResult,
  schemaIssueToError,
  businessError,
  validateToolInput,
  type AgenticPublicToolName
} from "@/lib/agentic/contract";
import { infoTool } from "@/lib/agentic/info";
import { RESPONSIBILITY_VERSION } from "@/lib/agentic/discovery/versions";
import type { IsolatedInfoCatalog } from "@/lib/agentic/runtime";

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

const MCP_SERVER_NAME_PREFIXES = [
  "mattanutra_dev.",
  "mattanutra_uat."
] as const;

export function canonicalPublicToolName(raw: string): AgenticPublicToolName | null {
  let name = raw.trim();

  let stripped = true;
  while (stripped && name) {
    stripped = false;
    const lower = name.toLowerCase();
    for (const prefix of MCP_SERVER_NAME_PREFIXES) {
      if (lower.startsWith(prefix)) {
        name = name.slice(prefix.length);
        stripped = true;
        break;
      }
    }
  }

  if (AGENTIC_PUBLIC_TOOLS.includes(name as AgenticPublicToolName)) {
    return name as AgenticPublicToolName;
  }

  const separator = name.lastIndexOf(".");
  if (separator <= 0) {
    return null;
  }

  const suffix = name.slice(separator + 1);
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

export function toolList(environment: AgenticEnvironment = "dev", locale?: string) {
  const descriptions = agenticToolDescriptions(environment, locale);
  return AGENTIC_PUBLIC_TOOLS.map((name) => ({
    description: descriptions[name],
    ...AGENTIC_CONTRACT_REGISTRY[name],
    annotations: {
      readOnlyHint: ["info", "order", "evidence"].includes(name),
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    name,
    responsibilityVersion: RESPONSIBILITY_VERSION
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

  if (typeof recordValue.message === "string" && recordValue.message.trim()) return recordValue.message;
  if (typeof recordValue.orderReference === "string" && typeof recordValue.paymentStatus === "string") {
    const fulfilment = record(recordValue.fulfilment).status;
    return `Order ${recordValue.orderReference}: payment=${recordValue.paymentStatus}${typeof fulfilment === "string" ? `; fulfilment=${fulfilment}` : ""}.`;
  }
  if (recordValue.responseView === "status" && typeof recordValue.planHandle === "string") {
    return `Plan revision ${recordValue.revision}; refinement=${recordValue.operationStatus ?? recordValue.status}.`;
  }

  if (typeof recordValue.serviceName === "string") {
    return `${recordValue.serviceName} ${recordValue.environment ?? ""} contract ${recordValue.contractVersion ?? ""}`.trim();
  }

  if (typeof recordValue.message === "string") {
    return recordValue.message;
  }

  return "ok";
}

const responseLog = createLogger("agentic.mcp.payload");
export function toolResult(value: unknown, isError = false, tool?: string) {
  const serialized = JSON.stringify(value);
  if (tool && process.env.NODE_ENV !== "test") {
    const view = record(value).responseView ?? "full";
    responseLog.info("response_bytes", { tool, view, structuredBytes: Buffer.byteLength(serialized, "utf8"), isError });
  }
  return {
    content: [
      {
        text: toolText(value),
        type: "text"
      },
      { type: "text", text: serialized }
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
    method === "resources/list" || method === "resources/read" ||
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

export async function handleLightweightJsonRpc(
  config: AgenticConfig,
  body: JsonRpcRequest,
  isolatedInfo?: IsolatedInfoCatalog
): Promise<JsonRpcResponse | null | undefined> {
  const id = body.id ?? null;
  const method = body.method ?? "";
  const params = record(body.params);

  if (method === "initialize") {
    return {
      id,
      jsonrpc: "2.0",
      result: {
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false }
        },
        instructions: agenticServerInstructions(config.environment),
        protocolVersion: params.protocolVersion === "2025-03-26" ? "2025-03-26" : "2025-06-18",
        responsibilityVersion: RESPONSIBILITY_VERSION,
        serverInfo: {
          name: mcpServerInfoName(config.environment),
          version: AGENTIC_SERVICE_VERSION
        },
        tools: toolList(config.environment, typeof params.locale === "string" ? params.locale : undefined)
      }
    };
  }

  if (method === "resources/list") return { id, jsonrpc: "2.0", result: { resources: CONTRACT_RESOURCES } };
  if (method === "resources/read") {
    const resource = readContractResource(String(params.uri ?? ""));
    return resource ? { id, jsonrpc: "2.0", result: resource } : { id, jsonrpc: "2.0", error: { code: -32602, message: "Unknown contract resource." } };
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
      result: {
        responsibilityVersion: RESPONSIBILITY_VERSION,
        tools: toolList(
          config.environment,
          typeof params.locale === "string" ? params.locale : undefined
        )
      }
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

    // The public info schema was validated above. Keep every supported
    // discovery selector when bypassing the full store-backed dispatcher.
    const infoArgs = args as Pick<Parameters<typeof infoTool>[0], "locale" | "view" | "planOperation">;

    const value = await infoTool({
      config,
      isolatedInfo,
      locale: infoArgs.locale,
      view: infoArgs.view,
      planOperation: infoArgs.planOperation
    });

    const response = validateToolInput(AGENTIC_OUTPUT_SCHEMAS.info, value)
      ? businessError({ message: "The capability response is temporarily unavailable.", reasonCode: "temporarily_unavailable", nextActions: ["retry"] })
      : value;
    return { id, jsonrpc: "2.0", result: toolResult(response, isAgenticErrorResult(response), "info") };
  }

  return undefined;
}
