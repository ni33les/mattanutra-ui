import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { ThreadPool } from "../lib/thread-pool.ts";
import { matcherSafetyCeilings, matcherSafetyCeilingsUnavailable } from "../lib/matcher/safety-ceilings.ts";
import type { executeTaskWorkItem } from "../lib/task-execution.ts";
import type { TaskWorkItem } from "../lib/task-work-items.ts";
import { refreshAdminSafetyCeilings } from "../lib/agentic/catalogue/load-safety-ceilings.ts";
import { captureReferenceJobIdentity, checkedReferenceCompletion, matchesSafetyReferenceIdentity,
  type ReferenceJobIdentity, type ReferenceJobCompletion } from "../lib/agentic/catalogue/reference-job.ts";

export type ProductMatchWorkItem = Extract<TaskWorkItem, {taskType: "generate_product_recommendations"}>;
export type ProductMatchJob = {
  referenceIdentity: ReferenceJobIdentity;
  workItem: ProductMatchWorkItem;
  ceilings: ReturnType<typeof matcherSafetyCeilings>;
  safetyUnavailable: boolean;
};
export type ProductMatchResult = Awaited<ReturnType<typeof executeTaskWorkItem>>;

export class ProductMatcherPool {
  private readonly pool: ThreadPool<ProductMatchJob, ReferenceJobCompletion<ProductMatchResult>>;
  constructor(capacity = 2, queueLimit = 8) {
    this.pool = new ThreadPool<ProductMatchJob, ReferenceJobCompletion<ProductMatchResult>>(() => new Worker(resolve(process.cwd(), "workers/product-matcher.ts"), {
      execArgv: ["--experimental-strip-types", "--import", resolve(process.cwd(), "scripts/register-ts-path-loader.mjs")]
    }), capacity, queueLimit);
  }

  async match(workItem: ProductMatchWorkItem, signal?: AbortSignal, timeoutMs = 60_000) {
    if (workItem.catalogueRevision !== undefined) {
      if (!workItem.safetyReferenceIdentity) throw new Error("Safety reference identity is required for product matching work");
      await refreshAdminSafetyCeilings({ runtimeRevision: workItem.catalogueRevision });
    }
    const referenceIdentity = captureReferenceJobIdentity(workItem.catalogueRevision, workItem.historicalReferenceFixture === true);
    if (referenceIdentity.runtimeRevision != null && !matchesSafetyReferenceIdentity(workItem.safetyReferenceIdentity, {
      runtimeRevision: referenceIdentity.runtimeRevision, fingerprint: referenceIdentity.fingerprint
    })) throw new Error("Safety reference identity changed in product matching work");
    const reply = await this.pool.run({workItem, referenceIdentity, ceilings: matcherSafetyCeilings(), safetyUnavailable: matcherSafetyCeilingsUnavailable()}, signal, timeoutMs);
    return checkedReferenceCompletion(reply, referenceIdentity);
  }
  close() { return this.pool.close(); }
}
