import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { ThreadPool } from "@/lib/thread-pool";
import type { matchPlan } from "@/lib/agentic/plan/matching";
import { matcherSafetyCeilings, matcherSafetyCeilingsUnavailable } from "@/lib/matcher/safety-ceilings";
import { requestLifetime } from "@/lib/request-lifetime";

type MatchInput = Parameters<typeof matchPlan>[0];
type MatchResult = ReturnType<typeof matchPlan>;
export type MatchJob = MatchInput & {
  ceilings: ReturnType<typeof matcherSafetyCeilings>;
  safetyUnavailable: boolean;
};
export type MatchReply = { result: MatchResult; error?: never } | { error: string; result?: never };

export { ThreadPoolUnavailableError as MatcherUnavailableError } from "@/lib/thread-pool";

export class MatchWorkerPool extends ThreadPool<MatchJob, MatchResult> {
  constructor(capacity = 2, queueLimit = 16) {
    // Keep the path explicit so Next.js can trace the worker entry point.
    super(() => new Worker(resolve(process.cwd(), "workers/mcp-matcher.ts"), {
      execArgv: ["--experimental-strip-types", "--import", resolve(process.cwd(), "scripts/register-ts-path-loader.mjs")]
    }), capacity, queueLimit);
  }

  run(input: MatchInput, signal?: AbortSignal, timeoutMs = 15_000) {
    return super.run({...input, ceilings: matcherSafetyCeilings(), safetyUnavailable: matcherSafetyCeilingsUnavailable()}, signal, timeoutMs);
  }
}
const pool = new MatchWorkerPool();

export function matchPlanInWorker(input: MatchInput) {
  return pool.run(input, requestLifetime()?.signal);
}
