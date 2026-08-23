import { randomUUID } from "node:crypto";

export function requestCorrelationId(request: Request) {
  const incoming =
    request.headers.get("x-request-id")?.trim() ||
    request.headers.get("x-correlation-id")?.trim() ||
    "";

  return incoming.length > 0 ? incoming.slice(0, 128) : randomUUID();
}
