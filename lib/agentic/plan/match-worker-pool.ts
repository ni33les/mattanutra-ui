import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { ThreadPool } from "@/lib/thread-pool";
import type { matchPlan, PlanMatchChunk, PlanSearchCheckpoint, ResidentChunkOptions, ResidentPlanMatchChunk } from "@/lib/agentic/plan/matching";
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
type MatchValue = MatchResult | PlanMatchChunk | ResidentPlanMatchChunk;
export type MatchCommand = MatchJob | (Omit<MatchJob, "chunk"> & { kind: "session-start"; sessionId: string; chunk: ResidentChunkOptions })
  | { kind: "session-continue"; sessionId: string; expectedAttempts: number; chunkBudget: number; lostAttempts?: number }
  | { kind: "session-release"; sessionId: string };
export type MatchReply = { result: ReferenceJobCompletion<MatchValue>; error?: never } | { error: string; result?: never };

export { ThreadPoolUnavailableError as MatcherUnavailableError } from "@/lib/thread-pool";

export class MatchWorkerPool {
  private readonly pool: ThreadPool<MatchCommand, ReferenceJobCompletion<MatchValue>>;
  private readonly sessions = new Map<string, { input: MatchInput; referenceIdentity: ReferenceJobIdentity; idleTimer?: ReturnType<typeof setTimeout> }>();
  private readonly idleSessionMs: number;
  constructor(capacity = 2, queueLimit = 16, idleSessionMs = 60_000) {
    if (!Number.isSafeInteger(idleSessionMs) || idleSessionMs <= 0) throw new Error("idleSessionMs must be a positive safe integer");
    this.idleSessionMs = idleSessionMs;
    // Keep the path explicit so Next.js can trace the worker entry point.
    this.pool = new ThreadPool<MatchCommand, ReferenceJobCompletion<MatchValue>>(() => new Worker(resolve(process.cwd(), "workers/mcp-matcher.ts"), {
      execArgv: ["--experimental-strip-types", "--import", resolve(process.cwd(), "scripts/register-ts-path-loader.mjs")]
    }), capacity, queueLimit);
  }

  private dispatch(input: MatchInput, signal?: AbortSignal, timeoutMs = 15_000, chunk?: MatchJob["chunk"], beforeStart?: () => Promise<unknown>) {
    let referenceIdentity: ReferenceJobIdentity;
    try { referenceIdentity = captureReferenceJobIdentity(input.snapshot.runtimeRevision,
      input.snapshot.products.length > 0 && input.snapshot.products.every(product => product.source === "fixture")); }
    catch (error) { return Promise.reject(error); }
    return this.pool.run({...input, ...(chunk ? { chunk } : {}), referenceIdentity, ceilings: matcherSafetyCeilings(), safetyUnavailable: matcherSafetyCeilingsUnavailable()}, signal, timeoutMs, { beforeStart })
      .then(reply => checkedReferenceCompletion(reply, referenceIdentity));
  }
  async run(input: MatchInput, signal?: AbortSignal, timeoutMs = 15_000): Promise<MatchResult> {
    const value = await this.dispatch(input, signal, timeoutMs);
    if ("done" in value) throw new Error("Unexpected chunk response");
    return value;
  }
  async runChunk(input: MatchInput, chunk: NonNullable<MatchJob["chunk"]>, signal?: AbortSignal, timeoutMs = 15_000, beforeStart?: () => Promise<unknown>): Promise<PlanMatchChunk> {
    const value = await this.dispatch(input, signal, timeoutMs, chunk, beforeStart);
    if (!("done" in value)) throw new Error("Missing chunk response");
    return value as PlanMatchChunk;
  }
  async runResidentChunk(sessionId: string, input: MatchInput, chunk: ResidentChunkOptions, signal?: AbortSignal, beforeStart?: () => Promise<unknown>): Promise<ResidentPlanMatchChunk> {
    const existing = this.sessions.get(sessionId);
    clearTimeout(existing?.idleTimer);
    const reuse = Boolean(existing && this.pool.hasAffinity(sessionId) && existing.input.state === input.state && existing.input.snapshot === input.snapshot);
    const referenceIdentity = reuse ? existing!.referenceIdentity : captureReferenceJobIdentity(input.snapshot.runtimeRevision,
      input.snapshot.products.length > 0 && input.snapshot.products.every(product => product.source === "fixture"));
    const checkpoint = reuse ? undefined : chunk.checkpoint && typeof chunk.checkpoint.cursor !== "string"
      ? { ...chunk.checkpoint, cursor: Uint8Array.from(chunk.checkpoint.cursor) } : chunk.checkpoint;
    const command: MatchCommand = reuse ? { kind: "session-continue", sessionId, expectedAttempts: chunk.checkpoint?.expansionAttempts ?? 0,
      chunkBudget: chunk.chunkBudget, lostAttempts: chunk.lostAttempts }
      : { ...input, kind: "session-start", sessionId, chunk: { ...chunk, checkpoint }, referenceIdentity,
        ceilings: matcherSafetyCeilings(), safetyUnavailable: matcherSafetyCeilingsUnavailable() };
    this.sessions.set(sessionId, { input, referenceIdentity });
    try {
      const result = await this.pool.run(command, signal, 15_000, { affinity: sessionId, beforeStart,
        ...(!reuse && checkpoint && typeof checkpoint.cursor !== "string" ? { transferList: [checkpoint.cursor.buffer as ArrayBuffer] } : {}) });
      const value = checkedReferenceCompletion(result, referenceIdentity);
      if (!("done" in value) || !(value.checkpoint.cursor instanceof Uint8Array)) throw new Error("Missing binary session checkpoint");
      if (value.done) this.closeResidentSession(sessionId);
      else {
        const session = this.sessions.get(sessionId);
        if (session) {
          session.idleTimer = setTimeout(() => this.closeResidentSession(sessionId), this.idleSessionMs);
          session.idleTimer.unref();
        }
      }
      return { ...value, checkpoint: { ...value.checkpoint, cursor: value.checkpoint.cursor }, inputTransferred: !reuse };
    } catch (error) { this.closeResidentSession(sessionId); throw error; }
  }
  closeResidentSession(sessionId: string) {
    clearTimeout(this.sessions.get(sessionId)?.idleTimer);
    this.sessions.delete(sessionId); this.pool.releaseAffinity(sessionId, { kind: "session-release", sessionId });
  }
  close() { for (const sessionId of this.sessions.keys()) this.closeResidentSession(sessionId); return this.pool.close(); }
}
const pool = new MatchWorkerPool();

export function matchPlanInWorker(input: MatchInput) {
  return pool.run(input, requestLifetime()?.signal);
}

export function matchPlanChunkInWorker(input: MatchInput, chunk: NonNullable<MatchJob["chunk"]>, beforeStart?: () => Promise<unknown>) {
  return pool.runChunk(input, chunk, requestLifetime()?.signal, 15_000, beforeStart);
}

export function matchPlanResidentChunkInWorker(sessionId: string, input: MatchInput, chunk: ResidentChunkOptions, beforeStart?: () => Promise<unknown>, signal = requestLifetime()?.signal) {
  return pool.runResidentChunk(sessionId, input, chunk, signal, beforeStart);
}
export function closePlanMatchSession(sessionId: string) { pool.closeResidentSession(sessionId); }
