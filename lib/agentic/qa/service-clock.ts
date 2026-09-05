import { businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import { agenticMessage } from "@/lib/agentic/i18n";

export const SERVICE_INTERNAL_DEADLINE_MS = 60_000;
export const CLIENT_READ_DEADLINE_MS = 90_000;

type ClockMode = "injected" | "live";

let clockMode: ClockMode = process.env.NODE_TEST_CONTEXT ? "injected" : "live";
let nowMs = 0;
const startedAt = new Map<string, number>();
const watchers = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function resetServiceClock() {
  clockMode = process.env.NODE_TEST_CONTEXT ? "injected" : "live";
  nowMs = 0;
  startedAt.clear();
  watchers.clear();
  for (const timer of timers.values()) {
    clearTimeout(timer);
  }
  timers.clear();
}

export function useInjectedServiceClock() {
  clockMode = "injected";
  nowMs = 0;
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
  startedAt.set(correlationId, serviceClockMs());
}

export function requestElapsedMs(correlationId: string) {
  return serviceClockMs() - (startedAt.get(correlationId) ?? serviceClockMs());
}

export function deadlineExceeded(correlationId: string) {
  return requestElapsedMs(correlationId) >= SERVICE_INTERNAL_DEADLINE_MS;
}

export function clearDeadlineWatch(correlationId: string) {
  const timer = timers.get(correlationId);
  if (timer) {
    clearTimeout(timer);
  }
  timers.delete(correlationId);
}

export function waitUntilDeadline(correlationId: string) {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      watchers.delete(check);
      clearDeadlineWatch(correlationId);
      resolve();
    };
    const check = () => {
      if (deadlineExceeded(correlationId)) {
        finish();
      }
    };
    if (clockMode === "live") {
      const remaining = SERVICE_INTERNAL_DEADLINE_MS - requestElapsedMs(correlationId);
      timers.set(correlationId, setTimeout(finish, Math.max(0, remaining)));
    }
    watchers.add(check);
    check();
  });
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
