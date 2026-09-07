import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleLightweightJsonRpc, toolList, toolResult } from "../lib/agentic/mcp/rpc.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { MCP_BODY_LIMIT_BYTES, McpBodyTooLargeError, McpInvalidRequestError, readMcpRequest } from "../lib/agentic/mcp/transport.ts";

function request(body: string | ReadableStream<Uint8Array>, signal?: AbortSignal) {
  return new Request("http://localhost/api/mcp", { method: "POST", body, signal, duplex: "half" } as RequestInit);
}

describe("MCP client and HTTP contract", () => {
  it("gives text-only clients every continuation field and error detail", () => {
    for (const payload of [
      { ok: true, planHandle: "opaque", revision: 2, nextAction: "execute", optionId: "choice" },
      { ok: false, error: { reasonCode: "stale_revision", message: "Refresh the plan.", retryable: false } }
    ]) {
      const result = toolResult(payload, !payload.ok);
      assert.deepEqual(JSON.parse(result.content[1].text), result.structuredContent);
      assert.equal(result.isError, !payload.ok);
    }
  });

  it("negotiates structured-output support and keeps the older client version", async () => {
    for (const version of ["2025-03-26", "2025-06-18"]) {
      const result = await handleLightweightJsonRpc(loadAgenticConfig(), {
        id: 1, method: "initialize", params: { protocolVersion: version }
      });
      assert.equal(result?.result?.protocolVersion, version);
      assert.deepEqual(result?.result?.capabilities, { tools: { listChanged: false }, resources: { listChanged: false, subscribe: false } });
    }
    for (const tool of toolList()) {
      assert.ok(tool.outputSchema.anyOf.every(branch => branch.required.includes("ok")));
      assert.equal(tool.annotations.readOnlyHint, ["info", "order", "evidence"].includes(tool.name));
    }
  });

  it("rejects batches before dispatching any calls", async () => {
    await assert.rejects(readMcpRequest(request(JSON.stringify([{ id: 1, method: "tools/call", params: { name: "execute" } }]))), McpInvalidRequestError);
  });

  it("caps streamed bodies even without a content-length header", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(MCP_BODY_LIMIT_BYTES + 1)); },
      cancel() { cancelled = true; }
    });
    await assert.rejects(readMcpRequest(request(stream)), McpBodyTooLargeError);
    assert.equal(cancelled, true);
  });

  it("stops reading a stalled body when the client disconnects", async () => {
    const controller = new AbortController();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const pending = readMcpRequest(request(stream, controller.signal));
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(cancelled, true);
  });
});
