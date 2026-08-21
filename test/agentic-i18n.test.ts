import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agenticMessage, agenticMessageKeys } from "../lib/agentic/i18n.ts";

describe("agentic i18n", () => {
  it("has en, th and zh-CN copy for every message key", () => {
    const keys = agenticMessageKeys();
    assert.ok(keys.includes("feedback.invitation"));
    assert.ok(keys.includes("mcp.errors.unsupported_unit"));
    assert.ok(keys.includes("support.acknowledgement"));
    assert.ok(keys.includes("mcp.cannot_deliver"));
    assert.ok(keys.includes("mcp.unsupported_currency_detail"));

    for (const key of keys) {
      const en = agenticMessage("en", key);
      const th = agenticMessage("th", key);
      const zh = agenticMessage("zh-CN", key);
      assert.notEqual(en, key, key);
      assert.notEqual(th, en, key);
      assert.notEqual(zh, en, key);
    }
  });

  it("fills cannot-deliver placeholders", () => {
    const message = agenticMessage("en", "mcp.cannot_deliver", {
      destination: "Singapore",
      served: "Thailand"
    });
    assert.match(message, /cannot deliver to Singapore/i);
    assert.match(message, /Thailand/);
  });
});
