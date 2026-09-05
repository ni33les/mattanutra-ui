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

export type RequestTrace = Readonly<{
  correlationId: string;
  stages: readonly RequestStage[];
  terminalOwner: "ingress" | "admission" | "handler" | "dependency" | "serialization" | "transport" | null;
}>;

const traces = new Map<string, RequestStage[]>();
const owners = new Map<string, RequestTrace["terminalOwner"]>();
const latches = new Map<RequestStage, Promise<void>>();
const entered = new Map<RequestStage, () => void>();
let attributionEnabled = true;

export function resetRequestTraces() {
  traces.clear();
  owners.clear();
  latches.clear();
  entered.clear();
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
  entered.set(stage, notify);
}

export async function recordRequestStage(correlationId: string, stage: RequestStage) {
  if (!attributionEnabled) {
    return;
  }
  entered.get(stage)?.();
  const gate = latches.get(stage);
  if (gate) {
    await gate;
  }
  const list = traces.get(correlationId) ?? [];
  if (!list.includes(stage)) {
    traces.set(correlationId, [...list, stage]);
  }
}

export function setRequestTerminalOwner(
  correlationId: string,
  owner: RequestTrace["terminalOwner"]
) {
  if (!owners.has(correlationId)) {
    owners.set(correlationId, owner);
  }
}

export function requestTrace(correlationId: string): RequestTrace {
  return {
    correlationId,
    stages: [...(traces.get(correlationId) ?? [])],
    terminalOwner: owners.get(correlationId) ?? null
  };
}

export function listRequestTraces() {
  return [...traces.keys()].map(requestTrace);
}
