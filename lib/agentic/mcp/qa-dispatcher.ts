import { AGENTIC_SERVICE_NAME, AGENTIC_SERVICE_VERSION } from "@/lib/agentic/config";
import { isAgenticErrorResult } from "@/lib/agentic/contract/errors";
import { resolveCapability } from "@/lib/agentic/capabilities";
import { nowIso, type AgenticRuntime } from "@/lib/agentic/runtime";
import { isPaymentScenario, simulatePayment } from "@/lib/agentic/qa/simulate";
import {
  checkoutContinuityProof,
  isolationProof,
  latencyProof,
  orderEvidence
} from "@/lib/agentic/qa/proofs";
import type { JsonRpcRequest, JsonRpcResponse } from "@/lib/agentic/mcp/dispatcher";

const QA_TOOLS = [
  "simulate",
  "evidence",
  "isolationProof",
  "checkoutContinuityProof",
  "latencyProof"
] as const;

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toolResult(value: unknown, isError = false) {
  return {
    content: [{ text: JSON.stringify(value, null, 2), type: "text" }],
    isError,
    structuredContent: value
  };
}

function toolList() {
  return [
    {
      description: "Drive a DEV mock payment scenario for one orderHandle.",
      inputSchema: {
        additionalProperties: false,
        properties: {
          orderHandle: { minLength: 32, type: "string" },
          scenario: {
            enum: [
              "success",
              "decline_insufficient_funds",
              "processing_then_success",
              "provider_unavailable",
              "amount_mismatch",
              "currency_mismatch",
              "duplicate_success",
              "three_ds_required",
              "three_ds_cancelled",
              "three_ds_failed",
              "three_ds_succeeded",
              "expire",
              "refund",
              "partial_refund"
            ],
            type: "string"
          }
        },
        required: ["orderHandle", "scenario"],
        type: "object"
      },
      name: "simulate"
    },
    {
      description: "Read payment-confirm and OMS evidence for one orderHandle.",
      inputSchema: {
        additionalProperties: false,
        properties: {
          orderHandle: { minLength: 32, type: "string" }
        },
        required: ["orderHandle"],
        type: "object"
      },
      name: "evidence"
    },
    {
      description: "Run a two-principal isolation proof on fresh fixtures.",
      inputSchema: { additionalProperties: false, properties: {}, type: "object" },
      name: "isolationProof"
    },
    {
      description: "Run decline-then-success continuity proof and return audit/OMS counts.",
      inputSchema: { additionalProperties: false, properties: {}, type: "object" },
      name: "checkoutContinuityProof"
    },
    {
      description: "Measure in-process info, order and feedback p95 against spec budgets.",
      inputSchema: { additionalProperties: false, properties: {}, type: "object" },
      name: "latencyProof"
    }
  ];
}

async function callTool(runtime: AgenticRuntime, name: string, rawArgs: unknown) {
  if (!QA_TOOLS.includes(name as (typeof QA_TOOLS)[number])) {
    return { error: { code: -32601, message: `Unknown tool: ${name}` } };
  }

  const params = record(rawArgs);
  const now = nowIso();

  if (name === "simulate") {
    if (typeof params.orderHandle !== "string" || !isPaymentScenario(params.scenario)) {
      return {
        result: toolResult({ ok: false, error: { reasonCode: "required", message: "orderHandle and scenario are required." } }, true)
      };
    }

    const value = await simulatePayment({
      config: runtime.config,
      now,
      orderHandle: params.orderHandle,
      scenario: params.scenario,
      scope: runtime.scope,
      store: runtime.store
    });
    return { result: toolResult(value, isAgenticErrorResult(value)) };
  }

  if (name === "evidence") {
    if (typeof params.orderHandle !== "string") {
      return {
        result: toolResult({ ok: false, error: { reasonCode: "required", message: "orderHandle is required." } }, true)
      };
    }

    const capability = await resolveCapability({
      action: "order.read",
      config: runtime.config,
      handle: params.orderHandle,
      now,
      resourceType: "order",
      scope: runtime.scope,
      store: runtime.store
    });

    if (!capability) {
      return { result: toolResult({ ok: false, error: { reasonCode: "not_found", message: "Not found." } }, true) };
    }

    const value = {
      ok: true,
      ...(await orderEvidence({ orderId: capability.resourceId, runtime }))
    };
    return { result: toolResult(value) };
  }

  if (name === "isolationProof") {
    return { result: toolResult(await isolationProof(runtime)) };
  }

  if (name === "checkoutContinuityProof") {
    return { result: toolResult(await checkoutContinuityProof(runtime)) };
  }

  if (name === "latencyProof") {
    return { result: toolResult(await latencyProof(runtime)) };
  }

  return { error: { code: -32601, message: `Unknown tool: ${name}` } };
}

export async function handleQaJsonRpc(
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
        capabilities: { tools: { listChanged: false } },
        instructions:
          "DEV-only MattaNutra QA harness. Public customer tools live on /api/mcp. Use simulate, evidence, isolationProof, checkoutContinuityProof and latencyProof here.",
        protocolVersion: "2025-03-26",
        serverInfo: {
          name: `${AGENTIC_SERVICE_NAME} QA`,
          version: AGENTIC_SERVICE_VERSION
        }
      }
    };
  }

  if (method === "notifications/initialized") {
    return null;
  }

  if (method === "tools/list") {
    return { id, jsonrpc: "2.0", result: { tools: toolList() } };
  }

  if (method === "tools/call") {
    const name = typeof params.name === "string" ? params.name : "";
    const called = await callTool(runtime, name, params.arguments);
    return { id, jsonrpc: "2.0", ...called };
  }

  return {
    error: { code: -32601, message: `Method not found: ${method}` },
    id,
    jsonrpc: "2.0"
  };
}
