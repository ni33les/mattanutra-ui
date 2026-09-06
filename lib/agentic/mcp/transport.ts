export const MCP_BODY_LIMIT_BYTES = 64 * 1024;

export class McpBodyTooLargeError extends Error {}
export class McpBodyTimeoutError extends Error {}
export class McpInvalidRequestError extends Error {}

export async function readMcpRequest(request: Request) {
  if (Number(request.headers.get("content-length")) > MCP_BODY_LIMIT_BYTES) {
    throw new McpBodyTooLargeError("MCP request body exceeds 64 KiB.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing request body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let cancelled: Error | undefined;
  const cancel = (error: Error) => {
    cancelled = error;
    void reader.cancel().catch(() => undefined);
  };
  const onAbort = () => cancel(new DOMException("Request cancelled", "AbortError"));
  const timeout = setTimeout(() => cancel(new McpBodyTimeoutError("MCP request body timed out.")), 10_000);
  request.signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (request.signal.aborted) onAbort();
    while (true) {
      const chunk = await reader.read();
      if (cancelled) throw cancelled;
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MCP_BODY_LIMIT_BYTES) {
        await reader.cancel();
        throw new McpBodyTooLargeError("MCP request body exceeds 64 KiB.");
      }
      chunks.push(chunk.value);
    }
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new McpInvalidRequestError("Send one JSON-RPC request object per POST; batches are not supported.");
  }
  return body;
}

export function wantsMcpSse(accept: string | null | undefined) {
  return (accept ?? "").toLowerCase().includes("text/event-stream");
}

export function encodeJsonRpcSse(payload: unknown) {
  return `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function mcpOneShotHeaders(accept: string | null | undefined) {
  if (wantsMcpSse(accept)) {
    return {
      "Cache-Control": "no-store, no-cache",
      Connection: "close",
      "Content-Type": "text/event-stream",
      "x-mcp-transport": "sse-oneshot"
    };
  }

  return {
    "Cache-Control": "no-store, no-cache",
    Connection: "close",
    "Content-Type": "application/json",
    "x-mcp-transport": "json-oneshot"
  };
}

export function mcpOneShotBody(accept: string | null | undefined, payload: unknown) {
  if (wantsMcpSse(accept)) {
    return encodeJsonRpcSse(payload);
  }
  return JSON.stringify(payload);
}

export function mcpOneShotResponse(
  accept: string | null | undefined,
  payload: unknown,
  status = 200,
  extraHeaders?: Record<string, string>
) {
  return new Response(mcpOneShotBody(accept, payload), {
    headers: {
      ...mcpOneShotHeaders(accept),
      ...extraHeaders
    },
    status
  });
}

export function jsonCloseResponse(
  payload: unknown,
  status = 200,
  extraHeaders?: Record<string, string>
) {
  return mcpOneShotResponse("application/json", payload, status, extraHeaders);
}

export function mcpGetSseNotSupported() {
  return new Response(null, {
    headers: {
      Allow: "POST",
      Connection: "close"
    },
    status: 405
  });
}

export function decodeMcpPayload(contentType: string, text: string) {
  if (contentType.toLowerCase().includes("text/event-stream")) {
    const data = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("");
    return JSON.parse(data) as unknown;
  }
  return JSON.parse(text) as unknown;
}
