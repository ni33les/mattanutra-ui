import { ThreadPool } from "../lib/thread-pool.ts";
import { matcherSafetyCeilings, matcherSafetyCeilingsUnavailable } from "../lib/matcher/safety-ceilings.ts";
import type { executeTaskWorkItem } from "../lib/task-execution.ts";
import type { TaskWorkItem } from "../lib/task-work-items.ts";

export type ProductMatchWorkItem = Extract<TaskWorkItem, {taskType: "generate_product_recommendations"}>;
export type ProductMatchJob = {
  workItem: ProductMatchWorkItem;
  ceilings: ReturnType<typeof matcherSafetyCeilings>;
  safetyUnavailable: boolean;
};
export type ProductMatchResult = Awaited<ReturnType<typeof executeTaskWorkItem>>;

export class ProductMatcherPool extends ThreadPool<ProductMatchJob, ProductMatchResult> {
  constructor(capacity = 2, queueLimit = 8) {
    super("workers/product-matcher.ts", capacity, queueLimit);
  }

  match(workItem: ProductMatchWorkItem, signal?: AbortSignal, timeoutMs = 60_000) {
    return this.run({workItem, ceilings: matcherSafetyCeilings(), safetyUnavailable: matcherSafetyCeilingsUnavailable()}, signal, timeoutMs);
  }
}
