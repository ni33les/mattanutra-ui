type Waiting = { start: () => void; reject: (error: unknown) => void; cleanup: () => void };

/** One CPU budget per Node process, shared by the MCP and web matcher pools. */
export class MatcherCpuAdmission {
  private readonly limit: number;
  private active = 0;
  private waiting: Waiting[] = [];
  constructor(limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 64) throw new Error("MATCHER_CPU_SLOTS must be an integer from 1 to 64");
    this.limit = limit;
  }
  acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
      const cancel = () => {
        this.waiting = this.waiting.filter(item => item !== entry); entry.cleanup(); reject(signal.reason);
      };
      const entry: Waiting = { reject, cleanup: () => signal.removeEventListener("abort", cancel), start: () => {
        entry.cleanup(); this.active++;
        let released = false;
        resolve(() => { if (!released) { released = true; this.active--; this.drain(); } });
      } };
      signal.addEventListener("abort", cancel, { once: true }); this.waiting.push(entry); this.drain();
    });
  }
  private drain() { while (this.active < this.limit && this.waiting.length) this.waiting.shift()!.start(); }
}
export function matcherCpuSlotCount(env: Readonly<Record<string, string | undefined>> = process.env) {
  const value = Number(env.MATCHER_CPU_SLOTS ?? 2);
  if (!Number.isSafeInteger(value) || value < 1 || value > 64) throw new Error("MATCHER_CPU_SLOTS must be an integer from 1 to 64");
  return value;
}
export const matcherCpuAdmission = new MatcherCpuAdmission(matcherCpuSlotCount());
