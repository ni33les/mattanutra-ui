import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createConnectToken, readConnectToken, successfulConnectInfo } from "../lib/connect-token.ts";
import { connectCampaign, connectHref } from "../lib/connect.ts";
import { browserPixelPageSafe, metaCustomData, sanitiseMetaUrl } from "../lib/meta-event-policy.ts";

describe("anonymous connection verification boundaries", () => {
  it("rejects expired, tampered, malformed and cross-environment tokens", () => {
    const now = Date.now(), id = randomUUID(), secret = "test-signing-key";
    const token = createConnectToken(id, "uat", new Date(now + 86400000), secret);
    assert.equal(readConnectToken(token, "uat", secret, now)?.id, id);
    assert.equal(readConnectToken(token, "prd", secret, now), null);
    assert.equal(readConnectToken(token, "uat", "different-key", now), null);
    assert.equal(readConnectToken(token, "uat", secret, now + 86400000), null);
    assert.equal(readConnectToken(token.replace(/^./, "!"), "uat", secret, now), null);
    assert.equal(readConnectToken("x".repeat(2000), "uat", secret, now), null);
    assert.equal(readConnectToken(createConnectToken(id, "uat", new Date(now + 172800000), secret), "uat", secret, now), null);
  });
  it("requires an actual successful info response, including text-only and batch response correlation", () => {
    const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "info" } };
    const reply = { jsonrpc: "2.0", id: 1, result: { isError: false, structuredContent: { ok: true } } };
    assert.equal(successfulConnectInfo(call, reply), true);
    assert.equal(successfulConnectInfo({ ...call, method: "initialize" }, reply), false);
    assert.equal(successfulConnectInfo({ ...call, method: "tools/list" }, reply), false);
    assert.equal(successfulConnectInfo({ ...call, params: { name: "plan" } }, reply), false);
    assert.equal(successfulConnectInfo(call, { ...reply, error: { code: -1 } }), false);
    assert.equal(successfulConnectInfo(call, { ...reply, result: { isError: true } }), false);
    assert.equal(successfulConnectInfo(call, { ...reply, result: { isError: false, content: [{ type: "text", text: '{"ok":true}' }] } }), true);
    assert.equal(successfulConnectInfo(call, { ...reply, result: { isError: false, content: [{ type: "text", text: "looks successful" }] } }), false);
    assert.equal(successfulConnectInfo([call], [reply]), true);
    assert.equal(successfulConnectInfo([call, call], [reply]), false);
    assert.equal(successfulConnectInfo(call, { ...reply, id: 2 }), false);
  });
  it("keeps campaign identifiers across language/provider links without carrying arbitrary data", () => {
    const query = "?campaign_id=123&ad_id=456&fbclid=opaqueClick&connect_token=secret&prompt=private&health=private&planId=private";
    assert.equal(connectHref("th", "grok", query), "/th/connect/grok?campaign_id=123&ad_id=456&fbclid=opaqueClick");
    assert.deepEqual(connectCampaign(query), { campaign_id: "123", ad_id: "456" });
  });
  it("never exports setup tokens, prompts or health/supplement details and keeps these pages CAPI-only", () => {
    const url = "https://mattanutra.com/zh-CN/connect/claude?connect_token=secret&prompt=private&planId=" + randomUUID();
    assert.equal(sanitiseMetaUrl(url, "prd"), "https://mattanutra.com/zh-CN/connect/claude");
    assert.equal(sanitiseMetaUrl("https://mattanutra.com/en/connect/unknown", "prd"), null);
    assert.equal(browserPixelPageSafe(url, "", "prd"), false);
    assert.deepEqual(metaCustomData("McpConnectionVerified", { provider: "claude", locale: "zh-CN", stage: "connect_verified", campaign_id: "123",
      planId: randomUUID(), prompt: "private", connect_token: "secret", supplements: ["private"], email: "private", health: 1 }, "prd"),
      { mn_env: "prd", event_schema: "1", locale: "zh-CN", funnel_stage: "connect_verified", provider: "claude", campaign_id: "123" });
  });
});
