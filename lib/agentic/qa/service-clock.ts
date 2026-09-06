import { actualRequestId } from "@/lib/request-lifetime";
import { businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import { agenticMessage } from "@/lib/agentic/i18n";

export const SERVICE_INTERNAL_DEADLINE_MS = 60_000;
export const CLIENT_READ_DEADLINE_MS = 90_000;

type ClockMode = "injected" | "live";

let clockMode: ClockMode = process.env.NODE_TEST_CONTEXT ? "injected" : "live";
let nowMs = 0;
const startedAt = new Map<string, number>();
const watchers = new Set<() => void>();
const timers = new Map<string, Set<ReturnType<typeof setTimeout>>>();

export type DeadlineWait = Promise<void> & { cancel(): void };

export function resetServiceClock() {
  clockMode = process.env.NODE_TEST_CONTEXT ? "injected" : "live";
  nowMs = 0;
  startedAt.clear();
  watchers.clear();
  for (const set of timers.values()) {
    for (const timer of set) {
      clearTimeout(timer);
    }
  }
  timers.clear();
}

export function useInjectedServiceClock() {
  clockMode = "injected";
  nowMs = 0;
}

export function useLiveServiceClock() {
  clockMode = "live";
}

export function serviceClockMs() {
  return clockMode === "live" ? Number(process.hrtime.bigint() / BigInt(1_000_000)) : nowMs;
}

export function setServiceClockMs(next: number) {
  nowMs = next;
  notify();
}

export function advanceServiceClock(deltaMs: number) {
  nowMs += deltaMs;
  notify();
}

export function markRequestStart(correlationId: string) {
  correlationId = actualRequestId(correlationId);
  startedAt.set(correlationId, serviceClockMs());
}

export function requestElapsedMs(correlationId: string) {
  correlationId = actualRequestId(correlationId);
  return serviceClockMs() - (startedAt.get(correlationId) ?? serviceClockMs());
}

export function deadlineExceeded(correlationId: string) {
  return requestElapsedMs(correlationId) >= SERVICE_INTERNAL_DEADLINE_MS;
}

export function clearDeadlineWatch(correlationId: string) {
  correlationId = actualRequestId(correlationId);
  const set = timers.get(correlationId);
  if (!set) {
    return;
  }
  for (const timer of set) {
    clearTimeout(timer);
  }
  timers.delete(correlationId);
}

export function waitUntilDeadline(correlationId: string): DeadlineWait {
  correlationId = actualRequestId(correlationId);
  let cancel = () => {};
  const promise = new Promise<void>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      watchers.delete(check);
      if (timer !== undefined) {
        const set = timers.get(correlationId);
        if (set) {
          clearTimeout(timer);
          set.delete(timer);
          if (set.size === 0) {
            timers.delete(correlationId);
          }
        }
      }
      resolve();
    };
    const check = () => {
      if (deadlineExceeded(correlationId)) {
        finish();
      }
    };
    cancel = finish;
    if (clockMode === "live") {
      const remaining = SERVICE_INTERNAL_DEADLINE_MS - requestElapsedMs(correlationId);
      timer = setTimeout(finish, Math.max(0, remaining));
      const set = timers.get(correlationId) ?? new Set();
      set.add(timer);
      timers.set(correlationId, set);
    }
    watchers.add(check);
    check();
  }) as DeadlineWait;
  promise.cancel = () => {
    cancel();
  };
  return promise;
}

export function serviceDeadlineError(correlationId: string): AgenticErrorResult {
  const error = businessError({
    correlationId,
    message: agenticMessage("en", "mcp.errors.SERVICE_DEADLINE_EXCEEDED"),
    reasonCode: "SERVICE_DEADLINE_EXCEEDED",
    retryable: true
  });
  return error;
}

function notify() {
  for (const watcher of [...watchers]) {
    watcher();
  }
}

export function forgetRequestClock(correlationId: string) {
  startedAt.delete(correlationId);
  clearDeadlineWatch(correlationId);
}
