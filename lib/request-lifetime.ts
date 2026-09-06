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

/** Carry client disconnects and an overall deadline through worker API handlers. */
export function withRequestDeadline<Args extends unknown[], Result>(
  handler: (request: Request, ...args: Args) => Promise<Result>,
  timeoutMs = 45_000
) {
  return async (request: Request, ...args: Args): Promise<Result> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("Request deadline exceeded")), timeoutMs);
    const signal = AbortSignal.any([request.signal, controller.signal]);
    try {
      return await withRequestLifetime({signal}, () => handler(request, ...args));
    } finally {
      clearTimeout(timer);
    }
  };
}

export function actualRequestId(id: string) {
  const current = requests.getStore();
  return current?.logicalId === id ? current.correlationId ?? id : id;
}
