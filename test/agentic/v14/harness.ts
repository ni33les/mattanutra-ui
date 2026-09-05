import {
  captureExecuteLockState,
  emptyExecuteLockState,
  restoreExecuteLockState
} from "../../../lib/agentic/commerce/execute.ts";
import { resetRequestTraces } from "../../../lib/agentic/qa/request-trace.ts";
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
  qaCall,
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
  qaCall,
  setupDefaultExecuteContext,
  stripOpaque
};
export type { HandlerId, ReadyPlan };

export function beginV14Run() {
  beginV13Run();
  resetRequestTraces();
}

export function endV14Run() {
  endV13Run();
  resetRequestTraces();
}

export function createHandlerCluster() {
  const cluster = createV13Cluster();
  const locks: Record<HandlerId, Map<string, Promise<unknown>>> = {
    A: emptyExecuteLockState(),
    B: emptyExecuteLockState(),
    C: emptyExecuteLockState(),
    D: emptyExecuteLockState()
  };

  async function asHandler<T>(id: HandlerId, work: Parameters<V13Cluster["asHandler"]>[1]) {
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
    },
    runtimes: cluster.runtimes,
    store: cluster.store
  };
}

export type HandlerCluster = ReturnType<typeof createHandlerCluster>;
