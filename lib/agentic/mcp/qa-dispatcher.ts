import { AGENTIC_SERVICE_NAME, AGENTIC_SERVICE_VERSION } from "@/lib/agentic/config";
import { isAgenticErrorResult } from "@/lib/agentic/contract/errors";
import { resolveCapability } from "@/lib/agentic/capabilities";
import { type AgenticRuntime } from "@/lib/agentic/runtime";
import { getQueryNamespace, setQueryNamespace } from "@/lib/agentic/plan/query-budget";
import { planTool } from "@/lib/agentic/plan/service";
import {
  isFulfilmentStatus,
  isPaymentScenario,
  observeQaJourney,
  simulateFulfilment,
  simulatePayment
} from "@/lib/agentic/qa/simulate";
import { QA_CONTROL_TOOLS, qaPreflight } from "@/lib/agentic/qa/preflight";
import {
  beginQaRun,
  QA_PACK_CLOCK,
  qaSession,
  resetQaRun,
  resolveQaNow,
  setQaChannel,
  setQaClock
} from "@/lib/agentic/qa/session";
import {
  checkoutContinuityProof,
  goldenPlanRequest,
  isolationProof,
  latencyProof,
  orderEvidence
} from "@/lib/agentic/qa/proofs";
import { packProof } from "@/lib/agentic/qa/pack-proof";
import type { JsonRpcRequest, JsonRpcResponse } from "@/lib/agentic/mcp/dispatcher";

const QA_TOOLS = QA_CONTROL_TOOLS;

async function warmPackPlanCache(runtime: AgenticRuntime) {
  if (process.env.NODE_TEST_CONTEXT) {
    return;
  }
  const previous = getQueryNamespace();
  setQueryNamespace("qa-warm");
  try {
    await planTool({
      config: runtime.config,
      now: QA_PACK_CLOCK,
      payload: {
        idempotencyKey: `warm-${Date.now().toString(36)}planxx`,
        request: goldenPlanRequest()
      },
      scope: {
        ...runtime.scope,
        principalScope: `qa-warm:${Date.now().toString(36)}`
      },
      store: runtime.store
    });
  } catch {
    // Best-effort matcher warm so the first scored plan is a cache hit.
  } finally {
    setQueryNamespace(previous === "global" ? undefined : previous);
  }
}

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
      description: "Return the v3.0 preflight contract: clock, namespaces, fulfilment names, observer, and manifest.",
      inputSchema: {
        additionalProperties: false,
        properties: { namespace: { type: "string" } },
        type: "object"
      },
      name: "preflight"
    },
    {
      description: "Begin an isolated QA namespace with a fake clock for Run A or Run B.",
      inputSchema: {
        additionalProperties: false,
        properties: { runId: { type: "string" } },
        type: "object"
      },
      name: "beginRun"
    },
    {
      description: "Reset one qa-v3 namespace: plans, orders, funnel, and query counters.",
      inputSchema: {
        additionalProperties: false,
        properties: { namespace: { type: "string" } },
        required: ["namespace"],
        type: "object"
      },
      name: "reset"
    },
    {
      description: "Set the fake clock for one QA namespace.",
      inputSchema: {
        additionalProperties: false,
        properties: {
          namespace: { type: "string" },
          now: { type: "string" }
        },
        required: ["namespace", "now"],
        type: "object"
      },
      name: "setClock"
    },
    {
      description: "Lock reporting attribution and acquisition cost for one namespace. Does not change the plan.",
      inputSchema: {
        additionalProperties: false,
        properties: {
          acquisitionMinor: { type: "integer" },
          attribution: { enum: ["agent_connector", "qa_campaign"], type: "string" },
          namespace: { type: "string" }
        },
        required: ["namespace"],
        type: "object"
      },
      name: "setChannel"
    },
    {
      description: "Drive a DEV mock payment scenario for one orderHandle.",
      inputSchema: {
        additionalProperties: false,
        properties: {
          namespace: { type: "string" },
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
      description: "Drive a DEV fulfilment fixture: preparing, dispatched, or delivered. Payment must already be paid.",
      inputSchema: {
        additionalProperties: false,
        properties: {
          namespace: { type: "string" },
          orderHandle: { minLength: 32, type: "string" },
          status: {
            enum: ["preparing", "dispatched", "delivered"],
            type: "string"
          }
        },
        required: ["orderHandle", "status"],
        type: "object"
      },
      name: "simulateFulfilment"
    },
    {
      description: "Read funnel events, attribution, and contribution for one orderHandle.",
      inputSchema: {
        additionalProperties: false,
        properties: {
          correlationId: { type: "string" },
          namespace: { type: "string" },
          orderHandle: { minLength: 32, type: "string" }
        },
        type: "object"
      },
      name: "observe"
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
    },
    {
      description: "Run the authorized DEV pack-ID evidence bundle for previously untested checks.",
      inputSchema: { additionalProperties: false, properties: {}, type: "object" },
      name: "packProof"
    }
  ];
}

async function callTool(runtime: AgenticRuntime, name: string, rawArgs: unknown) {
  if (!QA_TOOLS.includes(name as (typeof QA_TOOLS)[number])) {
    return { error: { code: -32601, message: `Unknown tool: ${name}` } };
  }

  const params = record(rawArgs);
  const session = qaSession(typeof params.namespace === "string" ? params.namespace : undefined);
  if (session) {
    setQueryNamespace(session.namespace);
  }
  const now = resolveQaNow(typeof params.namespace === "string" ? params.namespace : undefined);
  const scope = {
    ...runtime.scope,
    principalScope: session?.principalScope ?? null
  };

  if (name === "preflight") {
    return { result: toolResult(await qaPreflight(typeof params.namespace === "string" ? params.namespace : undefined)) };
  }

  if (name === "beginRun") {
    const begun = beginQaRun(typeof params.runId === "string" ? params.runId : "A");
    await warmPackPlanCache(runtime);
    setQueryNamespace(begun.namespace);
    return {
      result: toolResult({
        ok: true,
        clock: begun.now,
        namespace: begun.namespace,
        principalScope: begun.principalScope,
        preflight: await qaPreflight(begun.namespace)
      })
    };
  }

  if (name === "reset") {
    if (typeof params.namespace !== "string") {
      return {
        result: toolResult({ ok: false, error: { reasonCode: "required", message: "namespace is required." } }, true)
      };
    }
    const reset = await resetQaRun({ namespace: params.namespace, store: runtime.store });
    return { result: toolResult(reset, reset.ok === false) };
  }

  if (name === "setClock") {
    if (typeof params.namespace !== "string" || typeof params.now !== "string") {
      return {
        result: toolResult({ ok: false, error: { reasonCode: "required", message: "namespace and now are required." } }, true)
      };
    }
    const next = setQaClock(params.namespace, params.now);
    if (!next) {
      return { result: toolResult({ ok: false, error: { reasonCode: "not_found", message: "Not found." } }, true) };
    }
    return { result: toolResult({ ok: true, clock: next.now, namespace: next.namespace }) };
  }

  if (name === "setChannel") {
    if (typeof params.namespace !== "string") {
      return {
        result: toolResult({ ok: false, error: { reasonCode: "required", message: "namespace is required." } }, true)
      };
    }
    const next = setQaChannel(params.namespace, {
      acquisitionMinor: typeof params.acquisitionMinor === "number" ? params.acquisitionMinor : undefined,
      attribution: params.attribution
    });
    if (!next) {
      return { result: toolResult({ ok: false, error: { reasonCode: "not_found", message: "Not found." } }, true) };
    }
    return {
      result: toolResult({
        ok: true,
        acquisitionMinor: next.acquisitionMinor,
        attribution: next.attribution,
        namespace: next.namespace
      })
    };
  }

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
      scope,
      store: runtime.store
    });
    return { result: toolResult(value, isAgenticErrorResult(value)) };
  }

  if (name === "simulateFulfilment") {
    if (typeof params.orderHandle !== "string" || !isFulfilmentStatus(params.status)) {
      return {
        result: toolResult({ ok: false, error: { reasonCode: "required", message: "orderHandle and status are required." } }, true)
      };
    }

    const value = await simulateFulfilment({
      config: runtime.config,
      now,
      orderHandle: params.orderHandle,
      scope,
      status: params.status,
      store: runtime.store
    });
    return { result: toolResult(value, isAgenticErrorResult(value)) };
  }

  if (name === "observe") {
    if (typeof params.orderHandle !== "string" && typeof params.correlationId !== "string") {
      return {
        result: toolResult({ ok: false, error: { reasonCode: "required", message: "orderHandle or correlationId is required." } }, true)
      };
    }

    const value = await observeQaJourney({
      config: runtime.config,
      correlationId: typeof params.correlationId === "string" ? params.correlationId : undefined,
      namespace: typeof params.namespace === "string" ? params.namespace : undefined,
      now,
      orderHandle: typeof params.orderHandle === "string" ? params.orderHandle : undefined,
      scope,
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
      scope,
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

  if (name === "packProof") {
    return { result: toolResult(await packProof(runtime)) };
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
          "DEV-only MattaNutra QA harness. Public customer tools live on the public MCP endpoint. Call preflight first. beginRun/reset isolate Run A and Run B with a settable clock. simulate drives payment. simulateFulfilment drives preparing, dispatched, and delivered through real handlers. observe is the funnel, query, and contribution observer. setChannel is reporting-only.",
        preflight: await qaPreflight(),
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
