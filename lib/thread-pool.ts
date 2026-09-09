import type { Worker, TransferListItem } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { matcherCpuAdmission } from "@/lib/matcher-cpu-admission";
import { recordServiceMetric } from "@/lib/service-metrics";

export type ThreadReply<Result> = {result: Result; error?: never} | {error: string; result?: never};
export type ThreadRunOptions = {
  affinity?: string;
  beforeStart?: () => Promise<unknown>;
  transferList?: TransferListItem[];
  inputBytes?: number;
};
type Job<Input, Result> = {
  input: Input; options: ThreadRunOptions; queuedAt: number; startedAt?: number;
  resolve: (result: Result) => void; reject: (error: unknown) => void;
  cleanup: () => void; controller: AbortController; settled: boolean; posted: boolean;
  startTimer: () => void;
};
type Slot<Input, Result> = { worker: Worker; job?: Job<Input, Result>; affinity?: string; releaseCpu?: () => void };

export class ThreadPoolUnavailableError extends Error {
  readonly reason: "capacity" | "timeout" | "worker_failure" | "checkpoint_mismatch";
  constructor(message: string, reason?: ThreadPoolUnavailableError["reason"]) {
    super(message);
    this.reason = reason ?? (/capacity/i.test(message) ? "capacity" : /deadline/i.test(message) ? "timeout" : "worker_failure");
  }
}

/** Queue and execution deadlines are separate; the caller's operation deadline
 * bounds both. Affine continuations retain state without bypassing CPU admission. */
export class ThreadPool<Input, Result> {
  private slots = new Set<Slot<Input, Result>>();
  private queue: Job<Input, Result>[] = [];
  private closed = false;
  private readonly terminating = new WeakSet<Slot<Input, Result>>();
  private readonly createWorker: () => Worker;
  private readonly capacity: number;
  private readonly queueLimit: number;
  constructor(createWorker: () => Worker, capacity = 2, queueLimit = 16) {
    if (!Number.isInteger(capacity) || capacity < 1 || !Number.isInteger(queueLimit) || queueLimit < 1) throw new Error("Invalid thread pool capacity");
    this.createWorker = createWorker; this.capacity = capacity; this.queueLimit = queueLimit;
  }

  run(input: Input, signal?: AbortSignal, timeoutMs = 15_000, options: ThreadRunOptions = {}): Promise<Result> {
    if (this.closed || this.queue.length >= this.queueLimit) return Promise.reject(new ThreadPoolUnavailableError("Matcher capacity exhausted"));
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const controller = new AbortController();
      const job: Job<Input, Result> = { input, options, resolve, reject, controller, settled: false, posted: false, queuedAt: performance.now(),
        cleanup: () => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); },
        startTimer: () => { clearTimeout(timer); timer = setTimeout(() => this.cancel(job, new ThreadPoolUnavailableError("Matcher deadline exceeded")), timeoutMs); } };
      const onAbort = () => this.cancel(job, signal?.reason ?? new Error("Matcher cancelled"));
      signal?.addEventListener("abort", onAbort, { once: true }); job.startTimer(); this.queue.push(job); this.drain();
    });
  }

  hasAffinity(key: string) { return [...this.slots].some(slot => slot.affinity === key && !this.terminating.has(slot)); }
  releaseAffinity(key: string) {
    for (const slot of this.slots) if (slot.affinity === key && !slot.job) slot.affinity = undefined;
    this.drain();
  }
  private settle(job: Job<Input, Result>, reply: ThreadReply<Result>) {
    if (job.settled) return;
    job.settled = true; job.cleanup();
    if (reply.error !== undefined) job.reject(new ThreadPoolUnavailableError(reply.error === "checkpoint_mismatch" ? "Matching checkpoint identity changed" : "Matcher failed",
      reply.error === "checkpoint_mismatch" ? "checkpoint_mismatch" : "worker_failure"));
    else job.resolve(reply.result);
  }
  private cancel(job: Job<Input, Result>, error: unknown) {
    if (job.settled) return;
    job.settled = true; job.cleanup(); job.controller.abort(error);
    this.queue = this.queue.filter(item => item !== job);
    const slot = [...this.slots].find(item => item.job === job);
    if (slot) {
      slot.job = undefined;
      if (job.posted) this.retire(slot);
      else { slot.releaseCpu?.(); slot.releaseCpu = undefined; }
    }
    job.reject(error); this.drain();
  }
  private retire(slot: Slot<Input, Result>) {
    if (this.terminating.has(slot)) return;
    this.terminating.add(slot);
    // CPU admission remains held until the actual thread exits.
    void slot.worker.terminate();
  }
  private drain() {
    if (this.closed) return;
    for (let index = 0; index < this.queue.length;) {
      const job = this.queue[index];
      const owned = job.options.affinity ? [...this.slots].find(item => item.affinity === job.options.affinity) : undefined;
      let slot = owned ? (!owned.job && !this.terminating.has(owned) ? owned : undefined)
        : [...this.slots].find(item => !item.job && !this.terminating.has(item) && item.worker.threadId !== -1 && item.affinity === undefined);
      if (!slot && !owned && this.slots.size < this.capacity) {
        try { slot = this.spawn(); }
        catch { this.queue.splice(index, 1); this.cancel(job, new ThreadPoolUnavailableError("Matcher could not start")); continue; }
      }
      if (!slot) { index++; continue; }
      this.queue.splice(index, 1); slot.job = job; slot.affinity = job.options.affinity; slot.worker.ref();
      void this.start(slot, job);
    }
  }
  private async start(slot: Slot<Input, Result>, job: Job<Input, Result>) {
    try {
      const release = await matcherCpuAdmission.acquire(job.controller.signal);
      if (job.settled) { release(); return; }
      slot.releaseCpu = release;
      recordServiceMetric("worker.queue_ms", performance.now() - job.queuedAt);
      await job.options.beforeStart?.();
      if (job.settled || slot.job !== job) return;
      job.startTimer(); job.startedAt = performance.now(); job.posted = true;
      if (job.options.inputBytes !== undefined) recordServiceMetric("worker.input_bytes", job.options.inputBytes);
      slot.worker.postMessage(job.input, job.options.transferList);
    } catch (error) { this.cancel(job, error); }
  }
  private spawn(): Slot<Input, Result> {
    const worker = this.createWorker(), slot: Slot<Input, Result> = { worker };
    this.slots.add(slot);
    worker.on("message", (reply: ThreadReply<Result>) => {
      const job = slot.job; if (!job?.posted) return;
      slot.job = undefined; slot.releaseCpu?.(); slot.releaseCpu = undefined; worker.unref();
      if (job.startedAt !== undefined) recordServiceMetric("worker.execute_ms", performance.now() - job.startedAt);
      this.settle(job, reply); this.drain();
    });
    worker.on("error", () => { const job = slot.job; if (job) this.cancel(job, new ThreadPoolUnavailableError("Matcher worker failed")); this.retire(slot); });
    worker.on("exit", () => {
      this.slots.delete(slot); slot.releaseCpu?.(); slot.releaseCpu = undefined;
      const job = slot.job; if (job) this.cancel(job, new ThreadPoolUnavailableError("Matcher worker exited"));
      this.drain();
    });
    return slot;
  }
  async close() {
    this.closed = true;
    for (const job of [...this.queue]) this.cancel(job, new ThreadPoolUnavailableError("Matcher pool closed"));
    await Promise.all([...this.slots].map(async slot => {
      if (slot.job) this.cancel(slot.job, new ThreadPoolUnavailableError("Matcher pool closed"));
      this.retire(slot); await slot.worker.terminate();
    }));
  }
}
