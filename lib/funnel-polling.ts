export const FUNNEL_FOREGROUND_WAIT_MS = 90_000;
export class PollHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

/** The deadline covers response headers AND body consumption. Parent cancellation is preserved. */
export async function fetchWithBodyDeadline(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
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
      const body = await response.arrayBuffer();
      return new Response(response.status === 204 || response.status === 205 || response.status === 304 ? null : body,
        { status: response.status, statusText: response.statusText, headers: response.headers });
    })(), aborted]);
  } finally {
    clearTimeout(timer);
    if (rejectOnAbort) signal.removeEventListener("abort", rejectOnAbort);
  }
}

export async function fetchFunnelJson<T>(url: string, init: RequestInit = {}) {
  const response = await fetchWithBodyDeadline(url, { ...init, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new PollHttpError(response.status, typeof data.message === "string" ? data.message : "Unable to load current progress");
  return { status: response.status, data: data as T };
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
export async function pollFunnelStatus<T>(options: {
  read: (signal: AbortSignal) => Promise<T>;
  ready: (value: T) => boolean;
  failed?: (value: T) => boolean;
  onValue?: (value: T) => void;
  signal: AbortSignal;
  intervalMs?: number;
  foregroundWaitMs?: number;
  visibility?: Visibility | null;
}) {
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
  let value: T | null = null;
  try {
    while (foregroundElapsed() < budget) {
      options.signal.throwIfAborted();
      if (hidden) { await sleep(Math.min(interval, 250), options.signal); continue; }
      try {
        // Await each response fully before scheduling another request.
        value = await options.read(options.signal);
        options.signal.throwIfAborted();
        options.onValue?.(value);
        if (options.ready(value)) return { status: "ready" as const, value };
        if (options.failed?.(value)) return { status: "failed" as const, value };
      } catch (error) {
        options.signal.throwIfAborted();
        if (error instanceof PollHttpError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) {
          return { status: "failed" as const, value, error };
        }
        // Transport errors, deadline expiry, 429 and server errors retry within the foreground budget.
      }
      await sleep(Math.min(interval, Math.max(1, budget - foregroundElapsed())), options.signal);
    }
    return { status: "timeout" as const, value };
  } finally { visibility?.removeEventListener("visibilitychange", changed); }
}
