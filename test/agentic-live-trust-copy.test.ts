import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLegalContent } from "../lib/legal-content.ts";
import { CONNECTOR_COPY } from "../lib/agentic/discovery/content.ts";
import { RESPONSIBILITY_MATRIX } from "../lib/agentic/responsibility/matrix.ts";
import { RESPONSIBILITY_VERSION } from "../lib/agentic/discovery/versions.ts";
import { LIVE_PUBLIC, liveCall } from "./helpers/live-mcp.ts";

describe("live connector and Terms consistency", () => {
  it("LIVE-TRUST-01 public info description is specific wellness matching copy", async () => {
    const info = await liveCall(LIVE_PUBLIC, "info", { locale: "en" });
    const description = String(info.structured.description ?? "");
    const words = description.trim().split(/\s+/).filter(Boolean);
    assert.equal(info.structured.ok, true);
    assert.ok(words.length >= 30, description);
    assert.match(description, /real-?product matching/i);
    assert.match(description, /stock/i);
    assert.match(description, /overlap/i);
    assert.match(description, /wellness/i);
    assert.match(description, /not clinical/i);
    assert.match(description, /pharmacy/i);
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
    assert.match(connector, /not clinical diagnosis or a pharmacy/);
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
