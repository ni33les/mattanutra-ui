import { parentPort } from "node:worker_threads";
import { matchPlan } from "../lib/agentic/plan/matching.ts";
import { setMatcherSafetyCeilings, setMatcherSafetyCeilingsUnavailable } from "../lib/matcher/safety-ceilings.ts";
import type { MatchJob, MatchReply } from "../lib/agentic/plan/match-worker-pool.ts";
import { validateReferenceJobIdentity } from "../lib/agentic/catalogue/reference-job.ts";

if (!parentPort) throw new Error("MCP matcher requires a worker thread");
parentPort.on("message", (job: MatchJob) => {
  let reply: MatchReply;
  try {
    validateReferenceJobIdentity(job.referenceIdentity, job.ceilings, job.snapshot.runtimeRevision);
    setMatcherSafetyCeilings(job.ceilings, job.referenceIdentity.runtimeRevision == null ? null : {
      runtimeRevision: job.referenceIdentity.runtimeRevision, fingerprint: job.referenceIdentity.fingerprint
    });
    if (job.safetyUnavailable) setMatcherSafetyCeilingsUnavailable();
    reply = { result: { value: matchPlan(job), referenceIdentity: job.referenceIdentity } };
  }
  catch { reply = { error: "match_failed" }; }
  parentPort!.postMessage(reply);
});
