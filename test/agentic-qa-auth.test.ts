import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AGENTIC_PUBLIC_TOOLS } from "../lib/agentic/contract/instructions.ts";
import { authorizeQaRequest, QA_AUDIENCE } from "../lib/agentic/qa/authorize.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { infoTool } from "../lib/agentic/info.ts";
import { AGENTIC_SERVER_INSTRUCTIONS } from "../lib/agentic/contract/instructions.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests
} from "../lib/agentic/runtime.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";

function requestWith(headers: Record<string, string>) {
  return new Request("https://dev.mattanutra.com/api/mcp/qa", {
    headers,
    method: "POST"
  });
}

afterEach(() => {
  setAgenticRuntimeForTests(null);
  delete process.env.MCP_QA_TOKEN;
});

describe("DEV QA audience-only auth", () => {
  it("AUTH-01 DEV audience header without bearer is allowed", () => {
    delete process.env.MCP_QA_TOKEN;
    const allowed = authorizeQaRequest(
      requestWith({ "x-mattanutra-qa-audience": QA_AUDIENCE }),
      "dev"
    );
    assert.equal(allowed, true);
  });

  it("AUTH-02 DEV missing audience is denied even with a bearer", () => {
    process.env.MCP_QA_TOKEN = "not-for-chatgpt";
    assert.equal(authorizeQaRequest(requestWith({}), "dev"), false);
    assert.equal(
      authorizeQaRequest(
        requestWith({ authorization: "Bearer not-for-chatgpt" }),
        "dev"
      ),
      false
    );
  });

  it("AUTH-03 DEV wrong audience is denied", () => {
    delete process.env.MCP_QA_TOKEN;
    assert.equal(
      authorizeQaRequest(
        requestWith({ "x-mattanutra-qa-audience": "mattanutra-uat-qa" }),
        "dev"
      ),
      false
    );
  });

  it("AUTH-04 UAT/PRD stay fail-closed without a non-empty token", () => {
    delete process.env.MCP_QA_TOKEN;
    const audienceOnly = requestWith({ "x-mattanutra-qa-audience": QA_AUDIENCE });
    assert.equal(authorizeQaRequest(audienceOnly, "uat"), false);
    assert.equal(authorizeQaRequest(audienceOnly, "prd"), false);

    process.env.MCP_QA_TOKEN = "uat-secret";
    assert.equal(authorizeQaRequest(audienceOnly, "uat"), false);
    assert.equal(
      authorizeQaRequest(
        requestWith({
          authorization: "Bearer uat-secret",
          "x-mattanutra-qa-audience": QA_AUDIENCE
        }),
        "uat"
      ),
      true
    );
    assert.equal(
      authorizeQaRequest(
        requestWith({
          authorization: "Bearer uat-secret",
          "x-mattanutra-qa-audience": QA_AUDIENCE
        }),
        "prd"
      ),
      true
    );
  });

  it("AUTH-05 public tools/list still hides QA write tools", async () => {
    const runtime = createAgenticRuntime({
      config: loadAgenticConfig(),
      store: createMemoryStore()
    });
    const listed = await handleJsonRpc(runtime, { id: 1, method: "tools/list" });
    const names = ((listed?.result?.tools as Array<{ name: string }>) ?? []).map(
      (item) => item.name
    );
    assert.deepEqual(names, [...AGENTIC_PUBLIC_TOOLS]);
    for (const banned of ["beginRun", "simulate", "observe", "preflight", "setClock", "reset"]) {
      assert.equal(names.includes(banned), false, banned);
    }
  });

  it("AUTH-06 public info and initialize copy do not mention MCP_QA_TOKEN", async () => {
    const runtime = createAgenticRuntime({
      config: { ...loadAgenticConfig(), environment: "dev", buildId: "test-build" },
      store: createMemoryStore()
    });
    const info = await infoTool({ config: runtime.config, locale: "en" });
    const blob = `${JSON.stringify(info)}\n${AGENTIC_SERVER_INSTRUCTIONS}`;
    assert.equal(blob.includes("MCP_QA_TOKEN"), false);
    assert.equal(/Bearer\s+\S+/.test(blob), false);
  });
});
