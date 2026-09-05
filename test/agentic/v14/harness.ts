import {
  captureExecuteLockState,
  emptyExecuteLockState,
  restoreExecuteLockState
} from "../../../lib/agentic/commerce/execute.ts";
import { resetRequestTraces } from "../../../lib/agentic/qa/request-trace.ts";
import { resetResourcePermits, snapshotResourcePermits } from "../../../lib/agentic/qa/resource-permits.ts";
import { resetServiceClock, useInjectedServiceClock } from "../../../lib/agentic/qa/service-clock.ts";
import {
  asRecord,
  beginV13Run,
  canonicalHash,
  canonicalJson,
  contributionOf,
  createHandlerCluster as createV13Cluster,
  endV13Run,
  executeOn,
  firstDiff,
  planOn,
  setupDefaultExecuteContext,
  stripOpaque,
  type HandlerCluster as V13Cluster,
  type HandlerId,
  type ReadyPlan
} from "../v13/harness.ts";

export {
  asRecord,
  canonicalHash,
  canonicalJson,
  contributionOf,
  executeOn,
  firstDiff,
  planOn,
  setupDefaultExecuteContext,
  stripOpaque
};

export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

export { snapshotResourcePermits };

export async function qaCall(
  runtime: Parameters<typeof import("../v12/harness.ts").qaCall>[0],
  name: string,
  args: Record<string, unknown> = {}
) {
  const { handleQaJsonRpc } = await import("../../../lib/agentic/mcp/qa-dispatcher.ts");
  const { structured } = await import("../v12/harness.ts");
  return structured(
    await handleQaJsonRpc(
      runtime,
      {
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: args, name }
      },
      new Request("https://dev.mattanutra.com/api/mcp/qa", {
        headers: { "x-forwarded-for": "203.0.113.10" }
      })
    )
  );
}
export type { HandlerId, ReadyPlan };

export function beginV14Run() {
  beginV13Run();
  resetRequestTraces();
  resetResourcePermits();
  resetServiceClock();
  useInjectedServiceClock();
}

export function endV14Run() {
  endV13Run();
  resetRequestTraces();
  resetResourcePermits();
  resetServiceClock();
}

export function createHandlerCluster() {
  const cluster = createV13Cluster();
  const locks: Record<HandlerId, Map<string, Promise<unknown>>> = {
    A: emptyExecuteLockState(),
    B: emptyExecuteLockState(),
    C: emptyExecuteLockState(),
    D: emptyExecuteLockState()
  };

  const ready: Record<HandlerId, boolean> = { A: true, B: true, C: true, D: true };

  async function asHandler<T>(id: HandlerId, work: Parameters<V13Cluster["asHandler"]>[1]) {
    if (!ready[id]) {
      throw new Error("worker_unready");
    }
    const previous = captureExecuteLockState();
    restoreExecuteLockState(locks[id]);
    try {
      return await cluster.asHandler(id, work);
    } finally {
      locks[id] = captureExecuteLockState();
      restoreExecuteLockState(previous);
    }
  }

  return {
    asHandler,
    clearHandler: cluster.clearHandler,
    primeFromCommitted: cluster.primeFromCommitted,
    restartHandler(id: HandlerId) {
      cluster.restartHandler(id);
      locks[id] = emptyExecuteLockState();
      ready[id] = true;
    },
    setReady(id: HandlerId, next: boolean) {
      ready[id] = next;
    },
    runtimes: cluster.runtimes,
    store: cluster.store
  };
}

export type HandlerCluster = ReturnType<typeof createHandlerCluster>;
