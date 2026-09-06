import type { Worker } from "node:worker_threads";

export type ThreadReply<Result> = {result: Result; error?: never} | {error: string; result?: never};

type Job<Input, Result> = {
  input: Input;
  resolve: (result: Result) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};
type Slot<Input, Result> = { worker: Worker; job?: Job<Input, Result> };

export class ThreadPoolUnavailableError extends Error {}

/** Dedicated CPU workers keep search off the HTTP event loop. Every queued or
 * running job has a deadline, and aborting active search terminates its worker. */
export class ThreadPool<Input, Result> {
  private slots = new Set<Slot<Input, Result>>();
  private queue: Job<Input, Result>[] = [];
  private closed = false;
  private readonly createWorker: () => Worker;
  private readonly terminating = new WeakSet<Slot<Input, Result>>();
  private readonly capacity: number;
  private readonly queueLimit: number;
  constructor(createWorker: () => Worker, capacity = 2, queueLimit = 16) {
    if (!Number.isInteger(capacity) || capacity < 1 || !Number.isInteger(queueLimit) || queueLimit < 1) throw new Error("Invalid thread pool capacity");
    this.createWorker = createWorker;
    this.capacity = capacity;
    this.queueLimit = queueLimit;
  }

  run(input: Input, signal?: AbortSignal, timeoutMs = 15_000): Promise<Result> {
    if (this.closed || this.queue.length >= this.queueLimit) {
      return Promise.reject(new ThreadPoolUnavailableError("Matcher capacity exhausted"));
    }
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise((resolveJob, reject) => {
      const job: Job<Input, Result> = {
        input,
        resolve: resolveJob, reject,
        cleanup: () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
        }
      };
      const onAbort = () => this.cancel(job, signal?.reason ?? new Error("Matcher cancelled"));
      const timer = setTimeout(() => this.cancel(job, new ThreadPoolUnavailableError("Matcher deadline exceeded")), timeoutMs);
      signal?.addEventListener("abort", onAbort, { once: true });
      this.queue.push(job);
      this.drain();
    });
  }

  private cancel(job: Job<Input, Result>, error: Error) {
    const index = this.queue.indexOf(job);
    if (index >= 0) this.queue.splice(index, 1);
    const slot = [...this.slots].find(item => item.job === job);
    if (slot) {
      slot.job = undefined;
      this.terminating.add(slot);
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
      let slot = [...this.slots].find(item => !item.job && item.worker.threadId !== -1 && !this.terminating.has(item));
      if (!slot && this.slots.size < this.capacity) {
        try { slot = this.spawn(); }
        catch {
          const job = this.queue.shift()!;
          job.cleanup();
          job.reject(new ThreadPoolUnavailableError("Matcher could not start"));
          continue;
        }
      }
      if (!slot) return;
      const job = this.queue.shift()!;
      slot.job = job;
      slot.worker.ref();
      try { slot.worker.postMessage(job.input); }
      catch { this.fail(slot, new ThreadPoolUnavailableError("Matcher input could not be transferred")); }
    }
  }

  private spawn(): Slot<Input, Result> {
    const worker = this.createWorker();
    const slot: Slot<Input, Result> = { worker };
    this.slots.add(slot);
    worker.on("message", (reply: ThreadReply<Result>) => {
      const job = slot.job;
      if (!job) return;
      slot.job = undefined;
      job.cleanup();
      worker.unref();
      if (reply.error !== undefined) job.reject(new ThreadPoolUnavailableError("Matcher failed"));
      else job.resolve(reply.result);
      this.drain();
    });
    worker.on("error", () => this.fail(slot, new ThreadPoolUnavailableError("Matcher worker failed")));
    worker.on("exit", () => {
      this.slots.delete(slot);
      this.fail(slot, new ThreadPoolUnavailableError("Matcher worker exited"));
      this.drain();
    });
    return slot;
  }

  private fail(slot: Slot<Input, Result>, error: Error) {
    const job = slot.job;
    slot.job = undefined;
    this.terminating.add(slot);
    void slot.worker.terminate();
    if (job) { job.cleanup(); job.reject(error); }
  }

  async close() {
    this.closed = true;
    for (const job of this.queue.splice(0)) {
      job.cleanup(); job.reject(new ThreadPoolUnavailableError("Matcher pool closed"));
    }
    await Promise.all([...this.slots].map(async slot => {
      this.fail(slot, new ThreadPoolUnavailableError("Matcher pool closed"));
      await slot.worker.terminate();
    }));
  }
}
