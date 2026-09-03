import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AGENTIC_PUBLIC_TOOLS } from "../lib/agentic/contract/instructions.ts";
import { authorizeQaRequest, QA_AUDIENCE } from "../lib/agentic/qa/authorize.ts";
import { assertInternalQaHarness, loadAgenticConfig } from "../lib/agentic/config.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { infoTool } from "../lib/agentic/info.ts";
import { AGENTIC_SERVER_INSTRUCTIONS } from "../lib/agentic/contract/instructions.ts";
import {
  createAgenticRuntime,
  setAgenticRuntimeForTests
} from "../lib/agentic/runtime.ts";
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
  delete process.env.INTERNAL_QA_HARNESS;
  delete process.env.MATTANUTRA_ENV;
  delete process.env.AGENTIC_PAYMENT_PROVIDER;
  delete process.env.TH_RETAILER_ADAPTER;
  delete process.env.AGENTIC_CAPABILITY_KEY;
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

  it("AUTH-07 DEV and UAT empty headers are allowed (ChatGPT cannot send custom headers)", () => {
    delete process.env.MCP_QA_TOKEN;
    assert.equal(authorizeQaRequest(requestWith({}), "dev"), true);
    assert.equal(authorizeQaRequest(requestWith({}), "uat"), true);
  });

  it("AUTH-02 DEV and UAT still allow a bearer", () => {
    process.env.MCP_QA_TOKEN = "not-for-chatgpt";
    assert.equal(
      authorizeQaRequest(
        requestWith({ authorization: "Bearer not-for-chatgpt" }),
        "dev"
      ),
      true
    );
    assert.equal(authorizeQaRequest(requestWith({}), "uat"), true);
  });

  it("AUTH-03 DEV and UAT ignore a wrong audience", () => {
    delete process.env.MCP_QA_TOKEN;
    assert.equal(
      authorizeQaRequest(
        requestWith({ "x-mattanutra-qa-audience": "mattanutra-uat-qa" }),
        "dev"
      ),
      true
    );
    assert.equal(
      authorizeQaRequest(
        requestWith({ "x-mattanutra-qa-audience": "mattanutra-uat-qa" }),
        "uat"
      ),
      true
    );
  });

  it("AUTH-04 PRD stays fail-closed without a non-empty token", () => {
    delete process.env.MCP_QA_TOKEN;
    const audienceOnly = requestWith({ "x-mattanutra-qa-audience": QA_AUDIENCE });
    assert.equal(authorizeQaRequest(audienceOnly, "prd"), false);
    assert.equal(authorizeQaRequest(requestWith({}), "prd"), false);

    process.env.MCP_QA_TOKEN = "prd-secret";
    assert.equal(authorizeQaRequest(audienceOnly, "prd"), false);
    assert.equal(
      authorizeQaRequest(
        requestWith({
          authorization: "Bearer prd-secret",
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

  it("AUTH-08 UAT harness is on by default and open without headers", () => {
    process.env.MATTANUTRA_ENV = "uat";
    process.env.AGENTIC_PAYMENT_PROVIDER = "stripe_test";
    process.env.TH_RETAILER_ADAPTER = "thailand_uat";
    process.env.AGENTIC_CAPABILITY_KEY = "uat-test-capability-key-not-for-dev";
    delete process.env.INTERNAL_QA_HARNESS;
    delete process.env.MCP_QA_TOKEN;

    const on = loadAgenticConfig();
    assert.equal(on.environment, "uat");
    assert.equal(on.internalQaHarness, true);
    assert.equal(on.paymentProvider, "stripe_test");
    assert.equal(on.thailandRetailerAdapter, "thailand_uat");
    assert.equal(assertInternalQaHarness(on), undefined);
    assert.equal(authorizeQaRequest(requestWith({}), "uat"), true);

    process.env.INTERNAL_QA_HARNESS = "false";
    const off = loadAgenticConfig();
    assert.equal(off.internalQaHarness, false);
  });

  it("AUTH-09 PRD never enables the QA harness", () => {
    process.env.MATTANUTRA_ENV = "prd";
    process.env.INTERNAL_QA_HARNESS = "true";
    process.env.MCP_QA_TOKEN = "prd-secret";
    process.env.AGENTIC_PAYMENT_PROVIDER = "stripe_live";
    process.env.TH_RETAILER_ADAPTER = "thailand_live";
    process.env.AGENTIC_CAPABILITY_KEY = "prd-test-capability-key-not-for-dev";
    const config = loadAgenticConfig();
    assert.equal(config.environment, "prd");
    assert.equal(config.internalQaHarness, false);
    assert.throws(() => assertInternalQaHarness(config));
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
