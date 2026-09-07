import { parentPort } from "node:worker_threads";
import { executeTaskWorkItem } from "../lib/task-execution.ts";
import { setMatcherSafetyCeilings, setMatcherSafetyCeilingsUnavailable } from "../lib/matcher/safety-ceilings.ts";
import type { ThreadReply } from "../lib/thread-pool.ts";
import type { ProductMatchJob, ProductMatchResult } from "./product-matcher-pool.ts";
import { validateReferenceJobIdentity, type ReferenceJobCompletion } from "../lib/agentic/catalogue/reference-job.ts";

if (!parentPort) throw new Error("Product matcher requires a worker thread");
parentPort.on("message", async (job: ProductMatchJob) => {
  let reply: ThreadReply<ReferenceJobCompletion<ProductMatchResult>>;
  try {
    if (job.workItem.taskType !== "generate_product_recommendations") throw new Error("Unsupported CPU job");
    validateReferenceJobIdentity(job.referenceIdentity, job.ceilings, job.workItem.catalogueRevision);
    setMatcherSafetyCeilings(job.ceilings, job.referenceIdentity.runtimeRevision == null ? null : {
      runtimeRevision: job.referenceIdentity.runtimeRevision, fingerprint: job.referenceIdentity.fingerprint
    });
    if (job.safetyUnavailable) setMatcherSafetyCeilingsUnavailable();
    reply = {result: { value: await executeTaskWorkItem(job.workItem), referenceIdentity: job.referenceIdentity }};
  } catch {
    reply = {error: "product_match_failed"};
  }
  parentPort!.postMessage(reply);
});
