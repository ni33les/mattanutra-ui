import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONNECTOR_COPY } from "../lib/agentic/discovery/content.ts";
import { RESPONSIBILITY_VERSION } from "../lib/agentic/discovery/versions.ts";
import { infoTool } from "../lib/agentic/info.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { createDetRuntime } from "./agentic/det-v3/harness.ts";

function words(text: string) {
  return text.trim().split(/\s+/).filter(Boolean);
}

describe("Slice A connector copy contract", () => {
  it("COPY-RED-01 required proposition words product stock safety", () => {
    const lowered = CONNECTOR_COPY.en.toLowerCase();
    assert.match(lowered, /\bproduct/);
    assert.match(lowered, /\bstock\b/);
    assert.match(lowered, /\bsafety\b/);
  });

  it("COPY-RED-02 description contains exact responsibilityVersion", async () => {
    const info = await infoTool({ config: loadAgenticConfig(), locale: "en" });
    assert.equal(info.ok, true);
    assert.equal(typeof info.responsibilityVersion, "string");
    assert.equal(info.description.includes(String(info.responsibilityVersion)), true);
    assert.equal(info.description.includes(RESPONSIBILITY_VERSION), true);
  });

  it("COPY-RED-03 word budget is at most 45 English words", () => {
    assert.ok(words(CONNECTOR_COPY.en).length <= 45, CONNECTOR_COPY.en);
  });

  it("COPY-RED-04 boundary copy states wellness guidance and excludes diagnosis pharmacy clinical advice", () => {
    const lowered = CONNECTOR_COPY.en.toLowerCase();
    assert.match(lowered, /wellness guidance/);
    assert.match(lowered, /diagnosis/);
    assert.match(lowered, /pharmacy/);
    assert.match(lowered, /clinical advice/);
    assert.equal(/matta.?nutra (is|operates) a pharmacy/i.test(CONNECTOR_COPY.en), false);
  });

  it("COPY-RED-05 twenty tools/list sessions are byte-identical", async () => {
    const runtime = createDetRuntime();
    const descriptions: string[] = [];
    for (let index = 0; index < 20; index += 1) {
      const listed = await handleJsonRpc(runtime, {
        id: 1,
        jsonrpc: "2.0",
        method: "tools/list",
        params: { locale: "en" }
      });
      const tools = ((listed?.result as { tools?: Array<{ name: string; description: string }> })?.tools ?? []);
      const info = tools.find((item) => item.name === "info" || item.name.endsWith(".info"));
      descriptions.push(String(info?.description ?? ""));
    }
    assert.equal(new Set(descriptions).size, 1);
    assert.equal(descriptions[0], CONNECTOR_COPY.en);
  });
});
