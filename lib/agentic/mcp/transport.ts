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
