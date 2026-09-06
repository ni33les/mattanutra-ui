import { AsyncLocalStorage } from "node:async_hooks";

type RequestLifetime = Readonly<{
  signal: AbortSignal;
  correlationId?: string;
  logicalId?: string;
}>;

const requests = new AsyncLocalStorage<RequestLifetime>();

export function withRequestLifetime<T>(lifetime: RequestLifetime, work: () => T): T {
  return requests.run(lifetime, work);
}

export function requestLifetime() {
  return requests.getStore();
}

export function actualRequestId(id: string) {
  const current = requests.getStore();
  return current?.logicalId === id ? current.correlationId ?? id : id;
}
