import { AsyncLocalStorage } from "node:async_hooks";
import { setImmediate as nextTurn } from "node:timers/promises";
import assert from "node:assert/strict";
import { handleJsonRpc as dispatchJsonRpc, canonicalPublicToolName } from "../../lib/agentic/mcp/dispatcher.ts";
import { planTool as admitPlan, runAdmittedPlanOperation } from "../../lib/agentic/plan/service.ts";
import { recordMcpCall } from "./mcp-evidence.ts";

async function executeAdmitted(input: Pick<Parameters<typeof admitPlan>[0],"store"|"config"|"scope">, key: string) {
  const scope=input.scope;
  const operation=await input.store.getPlanOperationByKey(`${scope.environment}:${scope.tenantScope}:${scope.principalScope ?? "anon"}`,key);
  assert.ok(operation,"A processing mutation must have a durable operation before the external test executor can run it");
  await runAdmittedPlanOperation({store:input.store,config:input.config,operationId:operation.id});
}

/** Current flat-protocol test client. Work is driven by the separate durable
 * executor; a handle-only read never starts work. No input or output translation. */
export const handleCompletedJsonRpc: typeof dispatchJsonRpc = async (runtime, body) => {
  const invoke = () => recordMcpCall(body, () => dispatchJsonRpc(runtime, body));
  const admitted = await invoke();
  const result = admitted?.result?.structuredContent as Record<string, unknown> | undefined;
  const args = body?.params?.arguments as Record<string, unknown> | undefined;
  if (runtime.matchPort || canonicalPublicToolName(String(body?.params?.name)) !== "plan" ||
    typeof args?.idempotencyKey !== "string" || result?.status !== "processing") return admitted;
  await executeAdmitted(runtime, args.idempotencyKey);
  return invoke();
};

/** The direct-service version retains every admission and replay in evidence. */
export const completedPlanTool: typeof admitPlan = async input => {
  const invoke=() => recordMcpCall({method:"plan",payload:input.payload},()=>admitPlan(input));
  const admitted=await invoke();
  if (input.payload.operation === "get" || !input.payload.idempotencyKey || !("status" in admitted) || admitted.status !== "processing") return admitted;
  await executeAdmitted(input,input.payload.idempotencyKey);
  return invoke();
};

/** A separately scheduled test worker, notified only after a memory-store
 * transaction commits. Internal QA clients can then use ordinary polling. */
export function startMemoryTaskExecutor(runtime: Parameters<typeof dispatchJsonRpc>[0]) {
  const store=runtime.store, transaction=store.transaction.bind(store), insert=store.insertPlanOperation.bind(store);
  const admissions=new AsyncLocalStorage<Set<string>>(), tasks: Promise<unknown>[]=[];
  store.insertPlanOperation=async record => {
    const context=admissions.getStore(); assert.ok(context,"Task admission must be transactional");
    await insert(record); context.add(record.id);
  };
  store.transaction=async callback => {
    if (admissions.getStore()) return transaction(callback);
    const ids=new Set<string>();
    const result=await transaction(tx=>admissions.run(ids,()=>callback(tx)));
    for (const operationId of ids) tasks.push(nextTurn().then(()=>runAdmittedPlanOperation({store,config:runtime.config,operationId})));
    return result;
  };
  return async () => {
    try { await Promise.all(tasks); }
    finally { store.transaction=transaction; store.insertPlanOperation=insert; }
  };
}

export async function withMemoryTaskExecutor<T>(runtime: Parameters<typeof dispatchJsonRpc>[0], work: () => Promise<T>) {
  const stop = startMemoryTaskExecutor(runtime);
  try { return await work(); } finally { await stop(); }
}
