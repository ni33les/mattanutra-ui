import { orderTool } from "../../../lib/agentic/commerce/order.ts";
import {
  asRecord,
  beginV14Run,
  canonicalHash,
  canonicalJson,
  createHandlerCluster as createV14Cluster,
  deferred,
  endV14Run,
  executeOn,
  firstDiff,
  planOn,
  qaCall,
  setupDefaultExecuteContext,
  stripOpaque,
  type HandlerCluster as V14Cluster,
  type HandlerId,
  type ReadyPlan
} from "../v14/harness.ts";
import {
  V15_CLOCK_09,
  V15_CLOCK_10,
  V15_CLOCK_20,
  V15_CLOCK_30,
  V15_CLOCK_40
} from "./manifest.ts";

export {
  asRecord,
  canonicalHash,
  canonicalJson,
  deferred,
  executeOn,
  firstDiff,
  planOn,
  qaCall,
  setupDefaultExecuteContext,
  stripOpaque
};
export type { HandlerId, ReadyPlan };

export function beginV15Run() {
  beginV14Run();
}

export function endV15Run() {
  endV14Run();
}

export function createHandlerCluster() {
  return createV14Cluster();
}

export type HandlerCluster = V14Cluster;

export function eventLedger(executed: Record<string, unknown>) {
  const events = Array.isArray(executed.events) ? executed.events : [];
  return events.map((item) => {
    const row = asRecord(item);
    return {
      createdAt: String(row.createdAt ?? ""),
      status: String(row.status ?? "")
    };
  });
}

export function eventOf(executed: Record<string, unknown>, status: string) {
  return eventLedger(executed).filter((item) => item.status === status);
}

export async function simulateHandleOnly(
  cluster: HandlerCluster,
  handler: HandlerId,
  input: Readonly<{ orderHandle: string; scenario: string }>
) {
  return cluster.asHandler(handler, (runtime) =>
    qaCall(runtime, "simulate", {
      orderHandle: input.orderHandle,
      scenario: input.scenario
    })
  );
}

export async function fulfilHandleOnly(
  cluster: HandlerCluster,
  handler: HandlerId,
  input: Readonly<{ orderHandle: string; status: "preparing" | "dispatched" | "delivered" }>
) {
  return cluster.asHandler(handler, (runtime) =>
    qaCall(runtime, "simulateFulfilment", {
      orderHandle: input.orderHandle,
      status: input.status
    })
  );
}

export async function setClockOn(
  cluster: HandlerCluster,
  handler: HandlerId,
  namespace: string,
  now: string
) {
  return cluster.asHandler(handler, (runtime) => qaCall(runtime, "setClock", { namespace, now }));
}

export async function orderOn(
  cluster: HandlerCluster,
  handler: HandlerId,
  input: Readonly<{ orderHandle: string }>
) {
  return asRecord(
    await cluster.asHandler(handler, (runtime) =>
      orderTool({
        config: runtime.config,
        now: runtime.now ?? V15_CLOCK_09,
        orderHandle: input.orderHandle,
        scope: runtime.scope,
        store: runtime.store
      })
    )
  );
}

export const CLOCK_STEPS = {
  decline: V15_CLOCK_09,
  paid: V15_CLOCK_10,
  preparing: V15_CLOCK_20,
  dispatched: V15_CLOCK_30,
  delivered: V15_CLOCK_40
} as const;
