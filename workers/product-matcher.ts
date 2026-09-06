import { parentPort } from "node:worker_threads";
import { executeTaskWorkItem } from "../lib/task-execution.ts";
import { setMatcherSafetyCeilings, setMatcherSafetyCeilingsUnavailable } from "../lib/matcher/safety-ceilings.ts";
import type { ThreadReply } from "../lib/thread-pool.ts";
import type { ProductMatchJob, ProductMatchResult } from "./product-matcher-pool.ts";

if (!parentPort) throw new Error("Product matcher requires a worker thread");
parentPort.on("message", async (job: ProductMatchJob) => {
  let reply: ThreadReply<ProductMatchResult>;
  try {
    if (job.workItem.taskType !== "generate_product_recommendations") throw new Error("Unsupported CPU job");
    setMatcherSafetyCeilings(job.ceilings);
    if (job.safetyUnavailable) setMatcherSafetyCeilingsUnavailable();
    reply = {result: await executeTaskWorkItem(job.workItem)};
  } catch {
    reply = {error: "product_match_failed"};
  }
  parentPort!.postMessage(reply);
});
