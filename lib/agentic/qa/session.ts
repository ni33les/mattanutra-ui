import { resetQueryBudget } from "@/lib/agentic/plan/query-budget";
import { resetFunnelLedger } from "@/lib/agentic/funnel/ledger";
import { attributionOf, type FunnelAttribution } from "@/lib/agentic/funnel/events";
import type { AgenticStore } from "@/lib/agentic/store/types";
import type { AgenticRuntime } from "@/lib/agentic/runtime";
import { authorizeQaRequest } from "@/lib/agentic/qa/authorize";

export const QA_PACK_CLOCK = "2026-09-02T00:00:00.000Z";
export const QA_NAMESPACE_PREFIX = "qa-v3:";

export type QaSession = Readonly<{
  acquisitionMinor: number;
  attribution: FunnelAttribution;
  namespace: string;
  now: string;
  principalScope: string;
}>;

const sessions = new Map<string, QaSession>();
const costByCorrelation = new Map<
  string,
  Readonly<{ acquisitionMinor: number; attribution: FunnelAttribution }>
>();

export function resetQaSessions() {
  sessions.clear();
  costByCorrelation.clear();
}

export function qaSession(namespace: string | undefined | null) {
  if (!namespace) {
    return null;
  }
  return sessions.get(namespace) ?? null;
}

export function bindQaRuntime(runtime: AgenticRuntime, request: Request): AgenticRuntime {
  if (!authorizeQaRequest(request, runtime.config.environment)) {
    return runtime;
  }
  const session = qaSession(request.headers.get("x-mattanutra-qa-namespace"));
  if (!session) {
    return runtime;
  }
  return {
    ...runtime,
    now: session.now,
    scope: {
      ...runtime.scope,
      principalScope: session.principalScope
    }
  };
}

export function beginQaRun(runId = "A"): QaSession {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const namespace = `${QA_NAMESPACE_PREFIX}${runId}:${nonce}`;
  const session: QaSession = {
    acquisitionMinor: 0,
    attribution: "agent_connector",
    namespace,
    now: QA_PACK_CLOCK,
    principalScope: namespace
  };
  sessions.set(namespace, session);
  return session;
}

export function setQaClock(namespace: string, now: string) {
  const current = sessions.get(namespace);
  if (!current) {
    return null;
  }
  const next = { ...current, now };
  sessions.set(namespace, next);
  return next;
}

export function setQaChannel(
  namespace: string,
  input: Readonly<{ acquisitionMinor?: number; attribution?: unknown }>
) {
  const current = sessions.get(namespace);
  if (!current) {
    return null;
  }
  const next: QaSession = {
    ...current,
    acquisitionMinor:
      typeof input.acquisitionMinor === "number" && Number.isFinite(input.acquisitionMinor)
        ? Math.max(0, Math.trunc(input.acquisitionMinor))
        : current.acquisitionMinor,
    attribution: attributionOf(input.attribution)
  };
  sessions.set(namespace, next);
  return next;
}

export function bindQaChannel(correlationId: string, session: QaSession) {
  costByCorrelation.set(correlationId, {
    acquisitionMinor: session.acquisitionMinor,
    attribution: session.attribution
  });
}

export function channelCost(correlationId: string, namespace?: string) {
  const fromNamespace = namespace ? sessions.get(namespace) : null;
  if (fromNamespace) {
    return {
      acquisitionMinor: fromNamespace.acquisitionMinor,
      attribution: fromNamespace.attribution
    };
  }
  return (
    costByCorrelation.get(correlationId) ?? {
      acquisitionMinor: 0,
      attribution: "unattributed" as const
    }
  );
}

export async function resetQaRun(input: Readonly<{
  namespace: string;
  store: AgenticStore;
}>) {
  const session = sessions.get(input.namespace);
  if (!session) {
    return { ok: true as const, namespace: input.namespace };
  }
  if (!session.principalScope.startsWith(QA_NAMESPACE_PREFIX)) {
    return { ok: false as const, reasonCode: "not_found" as const };
  }
  const planIds = await input.store.listPlanIdsByPrincipal(session.principalScope);
  for (const planId of planIds) {
    resetFunnelLedger(planId);
    costByCorrelation.delete(planId);
  }
  await input.store.deletePrincipalScope(session.principalScope);
  sessions.delete(input.namespace);
  resetQueryBudget();
  return { ok: true as const, namespace: input.namespace };
}
