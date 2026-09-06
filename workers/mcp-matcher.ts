import { parentPort } from "node:worker_threads";
import { matchPlan } from "../lib/agentic/plan/matching.ts";
import { setMatcherSafetyCeilings, setMatcherSafetyCeilingsUnavailable } from "../lib/matcher/safety-ceilings.ts";
import type { MatchJob, MatchReply } from "../lib/agentic/plan/match-worker-pool.ts";

if (!parentPort) throw new Error("MCP matcher requires a worker thread");
parentPort.on("message", (job: MatchJob) => {
  setMatcherSafetyCeilings(job.ceilings);
  if (job.safetyUnavailable) setMatcherSafetyCeilingsUnavailable();
  let reply: MatchReply;
  try { reply = { result: matchPlan(job) }; }
  catch { reply = { error: "match_failed" }; }
  parentPort!.postMessage(reply);
});
