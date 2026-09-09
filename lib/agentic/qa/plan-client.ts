import { setTimeout as delay } from "node:timers/promises";
import { planTool } from "@/lib/agentic/plan/service";
import { requestLifetime } from "@/lib/request-lifetime";
import { PLAN_OPERATION_TERMINAL_MS } from "@/lib/agentic/plan/operations";

/** Internal proof clients observe admitted work like any other client. Only the
 * durable executor calculates; neither this client nor GET starts matching. */
export const completedQaPlan: typeof planTool = async input => {
  let result = await planTool(input);
  const deadline = Date.now() + PLAN_OPERATION_TERMINAL_MS;
  const outerSignal = requestLifetime()?.signal;
  const signal = outerSignal ? AbortSignal.any([outerSignal, AbortSignal.timeout(PLAN_OPERATION_TERMINAL_MS)]) : AbortSignal.timeout(PLAN_OPERATION_TERMINAL_MS);
  while ("status" in result && result.status === "processing" && Date.now() < deadline) {
    await delay(Math.max(1, Number(result.pollAfterSeconds) || 1) * 1000, undefined, { signal });
    result = await planTool({ ...input, payload: { operation: "get", planHandle: result.planHandle } });
  }
  return result;
};
