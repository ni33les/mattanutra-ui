import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
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

type Job = {
  input: MatchJob;
  resolve: (result: MatchResult) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};
type Slot = { worker: Worker; job?: Job };

export class MatcherUnavailableError extends Error {}

/** Dedicated CPU workers keep search off the HTTP event loop. Every queued or
 * running job has a deadline, and aborting active search terminates its worker. */
export class MatchWorkerPool {
  private slots = new Set<Slot>();
  private queue: Job[] = [];
  private closed = false;
  private readonly capacity: number;
  private readonly queueLimit: number;
  constructor(capacity = 2, queueLimit = 16) {
    this.capacity = capacity;
    this.queueLimit = queueLimit;
  }

  run(input: MatchInput, signal?: AbortSignal, timeoutMs = 15_000): Promise<MatchResult> {
    if (this.closed || this.queue.length >= this.queueLimit) {
      return Promise.reject(new MatcherUnavailableError("Matcher capacity exhausted"));
    }
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise((resolveJob, reject) => {
      const job: Job = {
        input: { ...input, ceilings: matcherSafetyCeilings(), safetyUnavailable: matcherSafetyCeilingsUnavailable() },
        resolve: resolveJob, reject,
        cleanup: () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
        }
      };
      const onAbort = () => this.cancel(job, signal?.reason ?? new Error("Matcher cancelled"));
      const timer = setTimeout(() => this.cancel(job, new MatcherUnavailableError("Matcher deadline exceeded")), timeoutMs);
      signal?.addEventListener("abort", onAbort, { once: true });
      this.queue.push(job);
      this.drain();
    });
  }

  private cancel(job: Job, error: Error) {
    const index = this.queue.indexOf(job);
    if (index >= 0) this.queue.splice(index, 1);
    const slot = [...this.slots].find(item => item.job === job);
    if (slot) {
      slot.job = undefined;
      terminating.add(slot);
      // Keep the slot occupied until termination finishes: cancellation must not
      // briefly exceed the CPU limit by spawning a replacement too early.
      void slot.worker.terminate();
    }
    job.cleanup();
    job.reject(error);
    this.drain();
  }

  private drain() {
    while (!this.closed && this.queue.length > 0) {
      let slot = [...this.slots].find(item => !item.job && item.worker.threadId !== -1 && !terminating.has(item));
      if (!slot && this.slots.size < this.capacity) {
        try { slot = this.spawn(); }
        catch {
          const job = this.queue.shift()!;
          job.cleanup();
          job.reject(new MatcherUnavailableError("Matcher could not start"));
          continue;
        }
      }
      if (!slot) return;
      const job = this.queue.shift()!;
      slot.job = job;
      slot.worker.ref();
      try { slot.worker.postMessage(job.input); }
      catch { this.fail(slot, new MatcherUnavailableError("Matcher input could not be transferred")); }
    }
  }

  private spawn(): Slot {
    const worker = new Worker(resolve(process.cwd(), "workers/mcp-matcher.ts"), {
      execArgv: ["--experimental-strip-types", "--import", resolve(process.cwd(), "scripts/register-ts-path-loader.mjs")]
    });
    const slot: Slot = { worker };
    this.slots.add(slot);
    worker.on("message", (reply: MatchReply) => {
      const job = slot.job;
      if (!job) return;
      slot.job = undefined;
      job.cleanup();
      worker.unref();
      if (reply.error !== undefined) job.reject(new MatcherUnavailableError("Matcher failed"));
      else job.resolve(reply.result);
      this.drain();
    });
    worker.on("error", () => this.fail(slot, new MatcherUnavailableError("Matcher worker failed")));
    worker.on("exit", () => {
      this.slots.delete(slot);
      this.fail(slot, new MatcherUnavailableError("Matcher worker exited"));
      this.drain();
    });
    return slot;
  }

  private fail(slot: Slot, error: Error) {
    const job = slot.job;
    slot.job = undefined;
    terminating.add(slot);
    void slot.worker.terminate();
    if (job) { job.cleanup(); job.reject(error); }
  }

  async close() {
    this.closed = true;
    for (const job of this.queue.splice(0)) {
      job.cleanup(); job.reject(new MatcherUnavailableError("Matcher pool closed"));
    }
    await Promise.all([...this.slots].map(async slot => {
      this.fail(slot, new MatcherUnavailableError("Matcher pool closed"));
      await slot.worker.terminate();
    }));
  }
}
const terminating = new WeakSet<Slot>();
const pool = new MatchWorkerPool();

export function matchPlanInWorker(input: MatchInput) {
  return pool.run(input, requestLifetime()?.signal);
}
