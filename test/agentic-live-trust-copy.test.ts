import { AGENT_CARD } from "../lib/agentic/contract/agent-card.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLegalContent } from "../lib/legal-content.ts";
import { CONNECTOR_COPY } from "../lib/agentic/discovery/content.ts";
import { RESPONSIBILITY_MATRIX } from "../lib/agentic/responsibility/matrix.ts";
import { RESPONSIBILITY_VERSION } from "../lib/agentic/discovery/versions.ts";
import { LIVE_PUBLIC, LIVE_CLIENT_HEADERS, liveCall, livePost } from "./helpers/live-mcp.ts";
import { AGENTIC_CONTRACT_VERSION } from "../lib/agentic/config.ts";
import { CONTRACT_SCHEMA_URI } from "../lib/agentic/contract/guide.ts";

describe("live connector and Terms consistency", () => {
  it("LIVE-TRUST-01 public info description is specific wellness matching copy", async () => {
    const info = await liveCall(LIVE_PUBLIC, "info", { locale: "en" });
    const description = String(info.structured.description ?? "");
    const words = description.trim().split(/\s+/).filter(Boolean);
    assert.equal(info.structured.ok, true);
    assert.ok(words.length >= 30, description);
    assert.match(description, /\bproduct/);
    assert.match(AGENT_CARD, /stock/i);
    assert.match(description, /overlap/i);
    assert.match(description, /wellness guidance/i);
    assert.match(AGENT_CARD, /pharmacy/i);
    assert.equal(info.structured.responsibilityVersion, RESPONSIBILITY_VERSION);
    assert.equal(description, CONNECTOR_COPY.en);
  });

  it("LIVE-TRUST-02 Terms do not contradict connector or responsibility", () => {
    const terms = getLegalContent("en", "terms");
    const section = terms.sections.find((item) => item.title.startsWith("6."));
    const termsBlob = `${section?.paragraphs?.join(" ") ?? ""}`.toLowerCase();
    const connector = CONNECTOR_COPY.en.toLowerCase();
    const fulfilment = RESPONSIBILITY_MATRIX.find((item) => item.domain === "fulfilment")
      ?.text.en
      .toLowerCase();
    assert.match(termsBlob, /do not manufacture, sell, dispense, or control/);
    assert.match(connector, /not diagnosis or medical approval/);
    assert.match(AGENT_CARD, /pharmacy/);
    assert.match(String(fulfilment), /does not warehouse or deliver/);
    assert.equal(/matta.?nutra (is|operates) a pharmacy/i.test(connector), false);
    assert.equal(/we dispense/i.test(connector), false);
  });

  it("LIVE-TRUST-03 info.responsibilityVersion is present and stable across locales", async () => {
    const en = await liveCall(LIVE_PUBLIC, "info", { locale: "en" });
    const th = await liveCall(LIVE_PUBLIC, "info", { locale: "th" });
    assert.equal(en.structured.responsibilityVersion, RESPONSIBILITY_VERSION);
    assert.equal(en.structured.responsibilityVersion, th.structured.responsibilityVersion);
    assert.equal(en.structured.buildId, th.structured.buildId);
  });
});


describe("live connector discovery contract identity", () => {
  it("GET discovery, RPC info and the published contract agree on version and schemas", async () => {
    const response = await fetch(LIVE_PUBLIC, { headers: { ...LIVE_CLIENT_HEADERS, accept: "application/json, text/event-stream" }, signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, 405);
    const listing = await livePost(LIVE_PUBLIC, { jsonrpc: "2.0", id: 3, method: "tools/list" });
    const discovery = listing.structured;
    const info = await liveCall(LIVE_PUBLIC, "info", { locale: "en" });
    const resource = await livePost(LIVE_PUBLIC, { jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: CONTRACT_SCHEMA_URI } });
    assert.equal(info.structured.ok, true);
    const contents = resource.structured.contents as Array<{ text: string }>;
    assert.equal(contents.length, 1);
    const contract = JSON.parse(contents[0].text);
    assert.equal(discovery.contractVersion, AGENTIC_CONTRACT_VERSION);
    assert.equal(discovery.contractVersion, info.structured.contractVersion);
    assert.equal(discovery.contractVersion, contract.contractVersion);
    assert.equal(discovery.tools.length, 6);
    for (const tool of discovery.tools) {
      assert.deepEqual(tool.inputSchema, contract.tools[tool.name].inputSchema);
      assert.deepEqual(tool.outputSchema, contract.tools[tool.name].outputSchema);
    }
  });
});
