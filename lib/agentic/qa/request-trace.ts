import { businessError, type AgenticErrorResult } from "@/lib/agentic/contract/errors";
import {
  acquirePermitWhenAvailable,
  releaseAllPermits
} from "@/lib/agentic/qa/resource-permits";
import {
  clearDeadlineWatch,
  deadlineExceeded,
  markRequestStart,
  serviceDeadlineError,
  waitUntilDeadline
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

export function resetRequestTraces() {
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
  aborts.get(correlationId)?.abort();
}

export function throwIfAborted(correlationId: string) {
  if (aborts.get(correlationId)?.signal.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}

export async function recordRequestStage(
  correlationId: string,
  stage: RequestStage,
  options: Readonly<{ skipLatch?: boolean }> = {}
) {
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
  if (!owners.has(correlationId)) {
    owners.set(correlationId, owner);
  }
}

export function setCommitBoundary(
  correlationId: string,
  boundary: NonNullable<RequestTrace["commitBoundary"]>,
  replayAction: NonNullable<RequestTrace["replayAction"]>
) {
  boundaries.set(correlationId, boundary);
  replays.set(correlationId, replayAction);
}

export function requestTrace(correlationId: string): RequestTrace {
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

export async function runObservedRequest<T>(
  correlationId: string,
  work: () => Promise<T>
): Promise<T | AgenticErrorResult> {
  markRequestStart(correlationId);
  requestAbortSignal(correlationId);
  await acquirePermitWhenAvailable(correlationId, "admission");
  await acquirePermitWhenAvailable(correlationId, "worker");
  await acquirePermitWhenAvailable(correlationId, "connection");
  try {
    const running = work()
      .then((value) => ({ kind: "ok" as const, value }))
      .catch((error: unknown) => ({ kind: "err" as const, error }));
    const outcome = await Promise.race([
      running,
      waitUntilDeadline(correlationId).then(() => ({ kind: "deadline" as const }))
    ]);
    if (outcome.kind === "deadline" || deadlineExceeded(correlationId)) {
      cancelRequest(correlationId);
      if (!owners.has(correlationId)) {
        setRequestTerminalOwner(correlationId, "dependency");
      }
      await recordRequestStage(correlationId, "request_released", { skipLatch: true });
      return serviceDeadlineError(correlationId);
    }
    if (outcome.kind === "err") {
      throw outcome.error;
    }
    if (!owners.has(correlationId)) {
      setRequestTerminalOwner(correlationId, "transport");
    }
    return outcome.value;
  } catch (error) {
    if (error instanceof ConnectionDroppedError) {
      cancelRequest(correlationId);
      await recordRequestStage(correlationId, "request_released", { skipLatch: true });
      return businessError({
        correlationId,
        fieldPath: "transport",
        message: "The client connection was dropped.",
        reasonCode: "temporarily_unavailable",
        retryable: true
      });
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      await recordRequestStage(correlationId, "durable_rolled_back", { skipLatch: true });
      await recordRequestStage(correlationId, "request_released", { skipLatch: true });
      return businessError({
        correlationId,
        message: "The request was cancelled.",
        reasonCode: "temporarily_unavailable",
        retryable: true
      });
    }
    throw error;
  } finally {
    clearDeadlineWatch(correlationId);
    releaseAllPermits(correlationId);
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
