/** Observers are hints, never execution ownership or a work queue. */
export type PlanOperationChange = Readonly<{ operationId: string; version: number }>;
export const PLAN_OBSERVER_LIMIT = 256;
type Observer = { operationId: string; version: number; notify: () => void; close?: () => void };
const shared = globalThis as typeof globalThis & { mattanutraPlanObservers?: Set<Observer> };
const observers = () => shared.mattanutraPlanObservers ??= new Set<Observer>();

export function observePlanOperation(operationId: string, notify: () => void, close?: () => void): (() => void) | null {
  const active = observers();
  if (active.size >= PLAN_OBSERVER_LIMIT) return null;
  const observer = { operationId, version: -1, notify, close };
  active.add(observer);
  return () => { active.delete(observer); };
}
export function signalPlanOperationChange(change: PlanOperationChange) {
  for (const observer of observers()) {
    if (observer.operationId !== change.operationId || observer.version >= change.version) continue;
    observer.version = change.version;
    observer.notify();
  }
}
export function signalPlanObserverReconnect() {
  for (const observer of observers()) observer.notify();
}
export function closePlanObservers() {
  const active = [...observers()]; observers().clear();
  for (const observer of active) observer.close?.();
}
