import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { ThreadPool } from "@/lib/thread-pool";
import type { matchPlan } from "@/lib/agentic/plan/matching";
import { matcherSafetyCeilings, matcherSafetyCeilingsUnavailable } from "@/lib/matcher/safety-ceilings";
import { requestLifetime } from "@/lib/request-lifetime";
import { captureReferenceJobIdentity, checkedReferenceCompletion, type ReferenceJobIdentity, type ReferenceJobCompletion } from "@/lib/agentic/catalogue/reference-job";

type MatchInput = Parameters<typeof matchPlan>[0];
type MatchResult = ReturnType<typeof matchPlan>;
export type MatchJob = MatchInput & {
  referenceIdentity: ReferenceJobIdentity;
  ceilings: ReturnType<typeof matcherSafetyCeilings>;
  safetyUnavailable: boolean;
};
export type MatchReply = { result: ReferenceJobCompletion<MatchResult>; error?: never } | { error: string; result?: never };

export { ThreadPoolUnavailableError as MatcherUnavailableError } from "@/lib/thread-pool";

export class MatchWorkerPool {
  private readonly pool: ThreadPool<MatchJob, ReferenceJobCompletion<MatchResult>>;
  constructor(capacity = 2, queueLimit = 16) {
    // Keep the path explicit so Next.js can trace the worker entry point.
    this.pool = new ThreadPool<MatchJob, ReferenceJobCompletion<MatchResult>>(() => new Worker(resolve(process.cwd(), "workers/mcp-matcher.ts"), {
      execArgv: ["--experimental-strip-types", "--import", resolve(process.cwd(), "scripts/register-ts-path-loader.mjs")]
    }), capacity, queueLimit);
  }

  run(input: MatchInput, signal?: AbortSignal, timeoutMs = 15_000) {
    let referenceIdentity: ReferenceJobIdentity;
    try { referenceIdentity = captureReferenceJobIdentity(input.snapshot.runtimeRevision,
      input.snapshot.products.length > 0 && input.snapshot.products.every(product => product.source === "fixture")); }
    catch (error) { return Promise.reject(error); }
    return this.pool.run({...input, referenceIdentity, ceilings: matcherSafetyCeilings(), safetyUnavailable: matcherSafetyCeilingsUnavailable()}, signal, timeoutMs)
      .then(reply => checkedReferenceCompletion(reply, referenceIdentity));
  }
  close() { return this.pool.close(); }
}
const pool = new MatchWorkerPool();

export function matchPlanInWorker(input: MatchInput) {
  return pool.run(input, requestLifetime()?.signal);
}
