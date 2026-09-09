import { trackBpmEvent } from "@/lib/bpm-client";
export const FUNNEL_FOREGROUND_WAIT_MS = 90_000;
export class PollHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

/** The deadline covers response headers AND body consumption. Parent cancellation is preserved. */
async function consumeWithDeadline<T>(input: RequestInfo | URL, init: RequestInit, timeoutMs: number, consume: (response: Response) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(new DOMException("Request deadline exceeded", "TimeoutError")), timeoutMs);
  let rejectOnAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectOnAbort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", rejectOnAbort, { once: true });
    if (signal.aborted) rejectOnAbort();
  });
  try {
    return await Promise.race([(async () => {
      const response = await fetch(input, { ...init, signal });
      return consume(response);
    })(), aborted]);
  } finally {
    clearTimeout(timer);
    if (rejectOnAbort) signal.removeEventListener("abort", rejectOnAbort);
  }
}

export function fetchWithBodyDeadline(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  return consumeWithDeadline(input, init, timeoutMs, async response => {
    const body = await response.arrayBuffer();
    return new Response([204, 205, 304].includes(response.status) ? null : body,
      { status: response.status, statusText: response.statusText, headers: response.headers });
  });
}

export function fetchFunnelJson<T>(url: string, init: RequestInit = {}) {
  return consumeWithDeadline(url, { ...init, cache: "no-store" }, 15_000, async response => {
    const data = await response.json();
    if (!response.ok) throw new PollHttpError(response.status, typeof data?.message === "string" ? data.message : "Unable to load current progress");
    return { status: response.status, data: data as T };
  });
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

type Visibility = { hidden: boolean; addEventListener: Document["addEventListener"]; removeEventListener: Document["removeEventListener"] };
export type FunnelPollOptions<T> = {
  subscriptionKey?: string;
  read: (signal: AbortSignal) => Promise<T>;
  ready: (value: T) => boolean;
  failed?: (value: T) => boolean;
  onValue?: (value: T) => void | Promise<void>;
  signal: AbortSignal;
  intervalMs?: number;
  foregroundWaitMs?: number;
  visibility?: Visibility | null;
};
async function runFunnelPoll<T>(options: FunnelPollOptions<T> & { onCycle?: (elapsed: number) => void; onClock?: (clock: () => number) => void }) {
  const visibility = options.visibility === undefined ? (typeof document === "undefined" ? null : document) : options.visibility;
  const budget = options.foregroundWaitMs ?? FUNNEL_FOREGROUND_WAIT_MS;
  const interval = options.intervalMs ?? 1500;
  let elapsed = 0, activeSince = Date.now(), hidden = visibility?.hidden ?? false;
  const changed = () => {
    const now = Date.now();
    if (!hidden) elapsed += now - activeSince;
    activeSince = now; hidden = visibility?.hidden ?? false;
  };
  visibility?.addEventListener("visibilitychange", changed);
  const foregroundElapsed = () => elapsed + (hidden ? 0 : Date.now() - activeSince);
  options.onClock?.(foregroundElapsed);
  let value: T | null = null;
  let transientReported = false;
  const report = (outcome: string, httpStatus?: number) => {
    // Operational signals contain no questionnaire answers, recipient addresses or response bodies.
    if (typeof window !== "undefined") trackBpmEvent("funnel_poll_recovery", { eventType: "funnel", properties: { outcome, httpStatus } });
  };
  try {
    while (foregroundElapsed() < budget) {
      options.onCycle?.(foregroundElapsed());
      options.signal.throwIfAborted();
      if (hidden) { await waitForVisibility(visibility!, options.signal); continue; }
      try {
        // Await each response fully before scheduling another request.
        value = await options.read(options.signal);
        options.signal.throwIfAborted();
        await options.onValue?.(value);
        if (options.ready(value)) return { status: "ready" as const, value };
        if (options.failed?.(value)) { report("work_failed"); return { status: "failed" as const, value }; }
      } catch (error) {
        options.signal.throwIfAborted();
        if (error instanceof PollHttpError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) {
          report("request_failed", error.status);
          return { status: "failed" as const, value, error };
        }
        if (!transientReported) { report("transient_error", error instanceof PollHttpError ? error.status : undefined); transientReported = true; }
        // Transport errors, deadline expiry, 429 and server errors retry within the foreground budget.
      }
      await sleep(Math.min(interval, Math.max(1, budget - foregroundElapsed())), options.signal);
    }
    report("foreground_timeout");
    return { status: "timeout" as const, value };
  } finally { visibility?.removeEventListener("visibilitychange", changed); }
}

function waitForVisibility(visibility: Visibility, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => { visibility.removeEventListener("visibilitychange", changed); signal.removeEventListener("abort", abort); };
    const changed = () => { if (!visibility.hidden) { cleanup(); resolve(); } };
    const abort = () => { cleanup(); reject(signal.reason); };
    visibility.addEventListener("visibilitychange", changed); signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort(); else changed();
  });
}

type PollOutcome<T> = Awaited<ReturnType<typeof runFunnelPoll<T>>>;
type PollSubscriber = { options: FunnelPollOptions<unknown>; started: number; value: unknown;
  resolve: (value: PollOutcome<unknown>) => void; reject: (error: unknown) => void; cleanup: () => void };
type PollSource = { controller: AbortController; elapsed: number; clock?: () => number; subscribers: Set<PollSubscriber> };
const pageSubscriptions = new Map<string, PollSource>();

/** A page has one status stream per assessment/revision/locale. Readiness and
 * the 90-second foreground recovery window still belong to each subscriber. */
export function pollFunnelStatus<T>(options: FunnelPollOptions<T>): Promise<PollOutcome<T>> {
  const key = options.subscriptionKey;
  if (!key) return runFunnelPoll(options);
  if (options.signal.aborted) return Promise.reject(options.signal.reason);
  let source = pageSubscriptions.get(key);
  const created = !source;
  if (!source) {
    if (pageSubscriptions.size >= 64) return Promise.reject(new Error("Too many active assessment subscriptions"));
    source = { controller: new AbortController(), elapsed: 0, subscribers: new Set() }; pageSubscriptions.set(key, source);
  }
  const active = source;
  const remove = (subscriber: PollSubscriber) => {
    if (!active.subscribers.delete(subscriber)) return;
    subscriber.cleanup();
    if (!active.subscribers.size) { if (pageSubscriptions.get(key) === active) pageSubscriptions.delete(key); active.controller.abort(); }
  };
  const result = new Promise<PollOutcome<T>>((resolve, reject) => {
    const aborted = () => { remove(subscriber); reject(options.signal.reason); };
    const subscriber: PollSubscriber = { options: options as FunnelPollOptions<unknown>, started: active.clock?.() ?? active.elapsed, value: null,
      resolve: value => resolve(value as PollOutcome<T>), reject, cleanup: () => options.signal.removeEventListener("abort", aborted) };
    active.subscribers.add(subscriber); options.signal.addEventListener("abort", aborted, { once: true });
  });
  if (created) void runFunnelPoll({ ...options, signal: active.controller.signal, foregroundWaitMs: Number.MAX_SAFE_INTEGER,
    ready: () => false, failed: () => false, onClock: clock => { active.clock = clock; },
    onCycle: elapsed => {
      active.elapsed = elapsed;
      for (const subscriber of active.subscribers) if (elapsed - subscriber.started >= (subscriber.options.foregroundWaitMs ?? FUNNEL_FOREGROUND_WAIT_MS)) {
        subscriber.resolve({ status: "timeout", value: subscriber.value }); remove(subscriber);
      }
    },
    onValue: async value => {
      await Promise.all([...active.subscribers].map(async subscriber => {
        try {
          const detached = structuredClone(value); subscriber.value = detached;
          await subscriber.options.onValue?.(detached);
          if (!active.subscribers.has(subscriber)) return;
          const status = subscriber.options.ready(detached) ? "ready" : subscriber.options.failed?.(detached) ? "failed" : null;
          if (status) { subscriber.resolve({ status, value: detached }); remove(subscriber); }
        } catch (error) { subscriber.reject(error); remove(subscriber); }
      }));
    }
  }).then(outcome => {
    for (const subscriber of [...active.subscribers]) { subscriber.resolve({ ...outcome, value: subscriber.value }); remove(subscriber); }
  }, error => {
    for (const subscriber of [...active.subscribers]) { subscriber.reject(error); remove(subscriber); }
  });
  return result;
}

export function assessmentPollKey(planId: string, locale: string, revision?: number) {
  return JSON.stringify([planId, revision ?? "current", locale]);
}
