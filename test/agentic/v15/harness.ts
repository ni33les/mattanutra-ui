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

export async function completeSection4Journey(
  cluster: HandlerCluster,
  suffix: string
) {
  const ready = await setupDefaultExecuteContext(cluster, { suffix });
  const executed = await executeOn(cluster, "A", { ...ready, suffix });
  const handle = String(executed.orderHandle);
  await simulateHandleOnly(cluster, "A", {
    orderHandle: handle,
    scenario: "decline_insufficient_funds"
  });
  await setClockOn(cluster, "A", ready.namespace, V15_CLOCK_10);
  await simulateHandleOnly(cluster, "A", { orderHandle: handle, scenario: "success" });
  await setClockOn(cluster, "A", ready.namespace, V15_CLOCK_20);
  await fulfilHandleOnly(cluster, "A", { orderHandle: handle, status: "preparing" });
  await setClockOn(cluster, "A", ready.namespace, V15_CLOCK_30);
  await fulfilHandleOnly(cluster, "A", { orderHandle: handle, status: "dispatched" });
  await setClockOn(cluster, "A", ready.namespace, V15_CLOCK_40);
  await fulfilHandleOnly(cluster, "A", { orderHandle: handle, status: "delivered" });
  return { ...ready, orderHandle: handle };
}

export async function observeOn(
  cluster: HandlerCluster,
  handler: HandlerId,
  args: Record<string, unknown>
) {
  return cluster.asHandler(handler, (runtime) => qaCall(runtime, "observe", args));
}

export function observeEvidence(observed: Record<string, unknown>) {
  const queries = asRecord(observed.queries);
  const budget = asRecord(observed.dependencyBudget);
  const events = Array.isArray(observed.events) ? observed.events : [];
  return stripOpaque({
    acquisitionMinor: observed.acquisitionMinor ?? null,
    attribution: observed.attribution ?? null,
    clock: observed.clock ?? null,
    contributionMinor: observed.contributionMinor ?? null,
    events: events.map((item) => {
      const row = asRecord(item);
      return {
        createdAt: row.createdAt ?? null,
        eventType: row.eventType ?? null,
        sequence: row.sequence ?? null
      };
    }),
    planMatch: queries["plan.match"] ?? null,
    planMatchHit: queries["plan.match.hit"] ?? null,
    planMatchHits: budget.planMatchHits ?? null,
    planMatchMisses: budget.planMatchMisses ?? null
  });
}
