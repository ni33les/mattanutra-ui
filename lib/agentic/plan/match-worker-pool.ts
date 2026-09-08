import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { ThreadPool } from "@/lib/thread-pool";
import type { matchPlan, PlanMatchChunk, PlanSearchCheckpoint } from "@/lib/agentic/plan/matching";
import { matcherSafetyCeilings, matcherSafetyCeilingsUnavailable } from "@/lib/matcher/safety-ceilings";
import { requestLifetime } from "@/lib/request-lifetime";
import { captureReferenceJobIdentity, checkedReferenceCompletion, type ReferenceJobIdentity, type ReferenceJobCompletion } from "@/lib/agentic/catalogue/reference-job";

type MatchInput = Parameters<typeof matchPlan>[0];
type MatchResult = ReturnType<typeof matchPlan>;
export type MatchJob = MatchInput & {
  chunk?: { checkpoint?: PlanSearchCheckpoint; chunkBudget: number; lostAttempts?: number };
  referenceIdentity: ReferenceJobIdentity;
  ceilings: ReturnType<typeof matcherSafetyCeilings>;
  safetyUnavailable: boolean;
};
export type MatchReply = { result: ReferenceJobCompletion<MatchResult | PlanMatchChunk>; error?: never } | { error: string; result?: never };

export { ThreadPoolUnavailableError as MatcherUnavailableError } from "@/lib/thread-pool";

export class MatchWorkerPool {
  private readonly pool: ThreadPool<MatchJob, ReferenceJobCompletion<MatchResult | PlanMatchChunk>>;
  constructor(capacity = 2, queueLimit = 16) {
    // Keep the path explicit so Next.js can trace the worker entry point.
    this.pool = new ThreadPool<MatchJob, ReferenceJobCompletion<MatchResult | PlanMatchChunk>>(() => new Worker(resolve(process.cwd(), "workers/mcp-matcher.ts"), {
      execArgv: ["--experimental-strip-types", "--import", resolve(process.cwd(), "scripts/register-ts-path-loader.mjs")]
    }), capacity, queueLimit);
  }

  private dispatch(input: MatchInput, signal?: AbortSignal, timeoutMs = 15_000, chunk?: MatchJob["chunk"]) {
    let referenceIdentity: ReferenceJobIdentity;
    try { referenceIdentity = captureReferenceJobIdentity(input.snapshot.runtimeRevision,
      input.snapshot.products.length > 0 && input.snapshot.products.every(product => product.source === "fixture")); }
    catch (error) { return Promise.reject(error); }
    return this.pool.run({...input, ...(chunk ? { chunk } : {}), referenceIdentity, ceilings: matcherSafetyCeilings(), safetyUnavailable: matcherSafetyCeilingsUnavailable()}, signal, timeoutMs)
      .then(reply => checkedReferenceCompletion(reply, referenceIdentity));
  }
  async run(input: MatchInput, signal?: AbortSignal, timeoutMs = 15_000): Promise<MatchResult> {
    const value = await this.dispatch(input, signal, timeoutMs);
    if ("done" in value) throw new Error("Unexpected chunk response");
    return value;
  }
  async runChunk(input: MatchInput, chunk: NonNullable<MatchJob["chunk"]>, signal?: AbortSignal, timeoutMs = 15_000): Promise<PlanMatchChunk> {
    const value = await this.dispatch(input, signal, timeoutMs, chunk);
    if (!("done" in value)) throw new Error("Missing chunk response");
    return value;
  }
  close() { return this.pool.close(); }
}
const pool = new MatchWorkerPool();

export function matchPlanInWorker(input: MatchInput) {
  return pool.run(input, requestLifetime()?.signal);
}

export function matchPlanChunkInWorker(input: MatchInput, chunk: NonNullable<MatchJob["chunk"]>) {
  return pool.runChunk(input, chunk, requestLifetime()?.signal);
}
