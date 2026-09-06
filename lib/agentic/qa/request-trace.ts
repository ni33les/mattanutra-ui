import { actualRequestId, requestLifetime, withRequestLifetime } from "@/lib/request-lifetime";
import { businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import {
  acquirePermitWhenAvailable,
  releaseAllPermits
} from "@/lib/agentic/qa/resource-permits";
import {
  deadlineExceeded,
  forgetRequestClock,
  markRequestStart,
  serviceDeadlineError,
  waitUntilDeadline,
} from "@/lib/agentic/qa/service-clock";

export const REQUEST_STAGES = [
  "ingress_accepted",
  "handler_admitted",
  "durable_started",
  "durable_committed",
  "durable_rolled_back",
  "serialization_completed",
  "response_handed_to_transport",
  "request_released"
] as const;

export type RequestStage = (typeof REQUEST_STAGES)[number];

export type TerminalOwner =
  | "ingress"
  | "admission"
  | "handler"
  | "dependency"
  | "serialization"
  | "transport";

export type RequestTrace = Readonly<{
  commitBoundary: "before_commit" | "after_commit" | "during_response" | null;
  correlationId: string;
  replayAction: "create" | "reuse" | "reject" | null;
  stages: readonly RequestStage[];
  terminalOwner: TerminalOwner | null;
}>;

export const STAGE_OWNER: Record<RequestStage, TerminalOwner> = {
  durable_committed: "dependency",
  durable_rolled_back: "dependency",
  durable_started: "handler",
  handler_admitted: "admission",
  ingress_accepted: "ingress",
  request_released: "transport",
  response_handed_to_transport: "transport",
  serialization_completed: "serialization"
};

export class ConnectionDroppedError extends Error {
  readonly commitBoundary: NonNullable<RequestTrace["commitBoundary"]>;
  readonly replayAction: NonNullable<RequestTrace["replayAction"]>;
  readonly stage: RequestStage;

  constructor(stage: RequestStage) {
    super("connection_dropped");
    this.name = "ConnectionDroppedError";
    this.stage = stage;
    this.commitBoundary = commitBoundaryFor(stage);
    this.replayAction = this.commitBoundary === "before_commit" ? "create" : "reuse";
  }
}

const traces = new Map<string, RequestStage[]>();
const owners = new Map<string, TerminalOwner>();
const boundaries = new Map<string, RequestTrace["commitBoundary"]>();
const replays = new Map<string, RequestTrace["replayAction"]>();
const latches = new Map<RequestStage, Promise<void>>();
const entered = new Map<RequestStage, Array<() => void>>();
const aborts = new Map<string, AbortController>();
let dropAfter: RequestStage | null = null;
let attributionEnabled = true;
export const REQUEST_TRACE_LIMIT = 256;
const completed = new Set<string>();
let requestSequence = 0;

export function resetRequestTraces() {
  completed.clear();
  traces.clear();
  owners.clear();
  boundaries.clear();
  replays.clear();
  latches.clear();
  entered.clear();
  aborts.clear();
  dropAfter = null;
  attributionEnabled = true;
}

export function setRequestAttributionEnabled(enabled: boolean) {
  attributionEnabled = enabled;
}

export function requestAttributionEnabled() {
  return attributionEnabled;
}

export function setRequestStageLatch(stage: RequestStage, gate: Promise<void>) {
  latches.set(stage, gate);
}

export function onRequestStageEntered(stage: RequestStage, notify: () => void) {
  const list = entered.get(stage) ?? [];
  entered.set(stage, [...list, notify]);
}

export function setDropConnectionAfterStage(stage: RequestStage | null) {
  dropAfter = stage;
}

export function requestAbortSignal(correlationId: string) {
  const controller = new AbortController();
  aborts.set(correlationId, controller);
  return controller.signal;
}

function abortPromise(correlationId: string) {
  correlationId = actualRequestId(correlationId);
  const signal = aborts.get(correlationId)?.signal;
  return new Promise<void>((resolve) => {
    if (!signal || signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

export function cancelRequest(correlationId: string) {
  correlationId = actualRequestId(correlationId);
  aborts.get(correlationId)?.abort();
}

export function waitUntilCancelled(correlationId: string) {
  return abortPromise(correlationId);
}

export function throwIfAborted(correlationId: string) {
  correlationId = actualRequestId(correlationId);
  if (aborts.get(correlationId)?.signal.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}

export async function recordRequestStage(
  correlationId: string,
  stage: RequestStage,
  options: Readonly<{ skipLatch?: boolean }> = {}
) {
  correlationId = actualRequestId(correlationId);
  if (!attributionEnabled) {
    return;
  }
  for (const notify of entered.get(stage) ?? []) {
    notify();
  }
  const gate = options.skipLatch ? null : latches.get(stage);
  if (gate) {
    setRequestTerminalOwner(correlationId, STAGE_OWNER[stage]);
    await Promise.race([gate, abortPromise(correlationId)]);
  }
  if (!options.skipLatch) {
    throwIfAborted(correlationId);
  }
  const list = traces.get(correlationId) ?? [];
  if (!list.includes(stage)) {
    traces.set(correlationId, [...list, stage]);
  }
  if (dropAfter === stage) {
    const error = new ConnectionDroppedError(stage);
    boundaries.set(correlationId, error.commitBoundary);
    replays.set(correlationId, error.replayAction);
    throw error;
  }
}

export function setRequestTerminalOwner(correlationId: string, owner: TerminalOwner) {
  correlationId = actualRequestId(correlationId);
  if (!owners.has(correlationId)) {
    owners.set(correlationId, owner);
  }
}

export function setCommitBoundary(
  correlationId: string,
  boundary: NonNullable<RequestTrace["commitBoundary"]>,
  replayAction: NonNullable<RequestTrace["replayAction"]>
) {
  correlationId = actualRequestId(correlationId);
  boundaries.set(correlationId, boundary);
  replays.set(correlationId, replayAction);
}

export function requestTrace(correlationId: string): RequestTrace {
  correlationId = actualRequestId(correlationId);
  return {
    commitBoundary: boundaries.get(correlationId) ?? null,
    correlationId,
    replayAction: replays.get(correlationId) ?? null,
    stages: [...(traces.get(correlationId) ?? [])],
    terminalOwner: owners.get(correlationId) ?? null
  };
}

export function listRequestTraces() {
  return [...traces.keys()].map(requestTrace);
}

function finishRequest(correlationId: string) {
  aborts.delete(correlationId);
  completed.delete(correlationId);
  completed.add(correlationId);
  while (completed.size > REQUEST_TRACE_LIMIT) {
    const oldest = completed.values().next().value!;
    completed.delete(oldest);
    traces.delete(oldest);
    owners.delete(oldest);
    boundaries.delete(oldest);
    replays.delete(oldest);
    forgetRequestClock(oldest);
  }
}

export async function runObservedRequest<T>(
  logicalId: string,
  work: () => Promise<T>
): Promise<T | AgenticErrorResult> {
  // A retry has its own lifetime even when it shares an idempotency key.
  const correlationId = aborts.has(logicalId) ? logicalId + ":request:" + (++requestSequence) : logicalId;
  const parentSignal = requestLifetime()?.signal;
  markRequestStart(correlationId);
  const signal = requestAbortSignal(correlationId);
  const abort = () => cancelRequest(correlationId);
  parentSignal?.addEventListener("abort", abort, { once: true });
  if (parentSignal?.aborted) abort();
  let finished = false;
  const deadline = waitUntilDeadline(correlationId);
  const expired = deadline.then(() => {
    if (!finished) abort();
    return { kind: "deadline" as const };
  });
  const running = withRequestLifetime({ signal, correlationId, logicalId }, async () => {
    for (const kind of ["admission", "worker", "connection"] as const) {
      await acquirePermitWhenAvailable(correlationId, kind, signal);
    }
    signal.throwIfAborted();
    if (deadlineExceeded(correlationId)) throw new DOMException("Deadline exceeded", "AbortError");
    return work();
  }).then(value => {
    releaseAllPermits(correlationId);
    return { kind: "ok" as const, value };
  }, error => {
    releaseAllPermits(correlationId);
    return { kind: "err" as const, error };
  });

  try {
    const outcome = await Promise.race([
      running, expired, abortPromise(correlationId).then(() => ({ kind: "aborted" as const }))
    ]);
    if (outcome.kind === "deadline" || deadlineExceeded(correlationId)) {
      abort();
      setRequestTerminalOwner(correlationId, "dependency");
      await recordRequestStage(correlationId, "request_released", { skipLatch: true });
      return serviceDeadlineError(correlationId);
    }
    if (outcome.kind === "aborted") throw new DOMException("The request was cancelled.", "AbortError");
    if (outcome.kind === "err") throw outcome.error;
    setRequestTerminalOwner(correlationId, "transport");
    return outcome.value;
  } catch (error) {
    if (error instanceof ConnectionDroppedError) {
      abort();
      await recordRequestStage(correlationId, "request_released", { skipLatch: true });
      return businessError({ correlationId, fieldPath: "transport", message: "The client connection was dropped.", reasonCode: "temporarily_unavailable", retryable: true });
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      await recordRequestStage(correlationId, "request_released", { skipLatch: true });
      return businessError({ correlationId, message: "The request was cancelled.", reasonCode: "temporarily_unavailable", retryable: true });
    }
    if (error instanceof Error && error.message === "admission_queue_full") {
      return businessError({ correlationId, message: "The service is busy. Retry shortly with the same idempotency key.", reasonCode: "temporarily_unavailable", retryable: true });
    }
    throw error;
  } finally {
    finished = true;
    deadline.cancel();
    parentSignal?.removeEventListener("abort", abort);
    // Keep admission capacity and the abort signal until underlying work stops.
    // Returning a deadline must not admit an unbounded stream of orphaned work.
    void running.then(() => finishRequest(correlationId));
  }
}

function commitBoundaryFor(stage: RequestStage): NonNullable<RequestTrace["commitBoundary"]> {
  if (
    stage === "ingress_accepted" ||
    stage === "handler_admitted" ||
    stage === "durable_started"
  ) {
    return "before_commit";
  }
  if (stage === "serialization_completed" || stage === "response_handed_to_transport") {
    return "during_response";
  }
  return "after_commit";
}
