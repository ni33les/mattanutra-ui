import { parentPort } from "node:worker_threads";
import { matchPlan, matchPlanChunk, createResidentPlanSession, advanceResidentPlanSession } from "../lib/agentic/plan/matching.ts";
import { matchCursorAttempts } from "../lib/matcher/match-cursor.ts";
import { setMatcherSafetyCeilings, setMatcherSafetyCeilingsUnavailable } from "../lib/matcher/safety-ceilings.ts";
import type { MatchCommand, MatchReply } from "../lib/agentic/plan/match-worker-pool.ts";
import { validateReferenceJobIdentity, type ReferenceJobIdentity } from "../lib/agentic/catalogue/reference-job.ts";

if (!parentPort) throw new Error("MCP matcher requires a worker thread");
type Resident = { session: ReturnType<typeof createResidentPlanSession>; referenceIdentity: ReferenceJobIdentity; expiry?: ReturnType<typeof setTimeout> };
const sessions = new Map<string, Resident>();
function release(id: string) { clearTimeout(sessions.get(id)?.expiry); sessions.delete(id); }
function arm(id: string, entry: Resident) {
  clearTimeout(entry.expiry); entry.expiry = setTimeout(() => release(id), 60_000); entry.expiry.unref();
}
parentPort.on("message", (job: MatchCommand) => {
  if ("kind" in job && job.kind === "session-release") { release(job.sessionId); return; }
  let reply: MatchReply;
  try {
    if ("kind" in job && job.kind === "session-continue") {
      const entry = sessions.get(job.sessionId);
      if (!entry || matchCursorAttempts(entry.session.cursor) !== job.expectedAttempts) throw new Error("Session checkpoint acknowledgement changed");
      const value = advanceResidentPlanSession(entry.session, job);
      if (value.done) release(job.sessionId); else arm(job.sessionId, entry);
      reply = { result: { value, referenceIdentity: entry.referenceIdentity } };
    } else {
      validateReferenceJobIdentity(job.referenceIdentity, job.ceilings, job.snapshot.runtimeRevision);
      setMatcherSafetyCeilings(job.ceilings, job.referenceIdentity.runtimeRevision == null ? null : {
        runtimeRevision: job.referenceIdentity.runtimeRevision, fingerprint: job.referenceIdentity.fingerprint
      });
      if (job.safetyUnavailable) setMatcherSafetyCeilingsUnavailable();
      if ("kind" in job && job.kind === "session-start") {
        release(job.sessionId);
        const entry: Resident = { session: createResidentPlanSession(job, job.chunk.checkpoint), referenceIdentity: job.referenceIdentity };
        sessions.set(job.sessionId, entry);
        const value = advanceResidentPlanSession(entry.session, job.chunk);
        if (value.done) release(job.sessionId); else arm(job.sessionId, entry);
        reply = { result: { value, referenceIdentity: job.referenceIdentity } };
      } else reply = { result: { value: job.chunk ? matchPlanChunk(job, job.chunk) : matchPlan(job), referenceIdentity: job.referenceIdentity } };
    }
  } catch (error) {
    if ("sessionId" in job) release(job.sessionId);
    reply = { error: error instanceof Error && /checkpoint/i.test(error.message) ? "checkpoint_mismatch" : "match_failed" };
  }
  const value = reply.result?.value;
  const buffer = value && "done" in value && value.checkpoint.cursor instanceof Uint8Array ? value.checkpoint.cursor.buffer as ArrayBuffer : null;
  parentPort!.postMessage(reply, buffer ? [buffer] : []);
});
