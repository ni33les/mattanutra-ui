import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  planChatFallbackRegion,
  planChatLimitErrorMessage,
  planChatWelcomeBody
} from "../lib/plan-concierge.ts";

describe("plan concierge", () => {
  it("starts GUI chat with a useful first message", () => {
    const body = planChatWelcomeBody("en");

    assert.match(body, /MattaNutra AI/);
    assert.match(body, /tailor your food and supplement guidance/);
    assert.match(body, /remove, swap, simplify, or adjust/);
    assert.match(body, /\n\n/);
    assert.match(body, /go ahead/);
  });

  it("uses the localized deliver-plan label in welcome copy", () => {
    assert.match(planChatWelcomeBody("th"), /ส่งมอบแผนโภชนาการ/);
    assert.match(planChatWelcomeBody("zh-CN"), /交付营养计划/);
    assert.equal(planChatWelcomeBody("th").includes("Deliver Nutrition Plan"), false);
    assert.equal(planChatWelcomeBody("zh-CN").includes("Deliver Nutrition Plan"), false);
  });

  it("falls back to Thailand for every locale, not the UI-language country", () => {
    assert.match(planChatFallbackRegion("en"), /Thailand/i);
    assert.match(planChatFallbackRegion("th"), /ไทย/);
    assert.equal(planChatFallbackRegion("zh-CN").includes("中国"), false);
  });

  it("localizes the plan-chat limit error", () => {
    assert.match(planChatLimitErrorMessage("en"), /limit reached/i);
    assert.notEqual(planChatLimitErrorMessage("th"), planChatLimitErrorMessage("en"));
    assert.notEqual(planChatLimitErrorMessage("zh-CN"), planChatLimitErrorMessage("en"));
  });
});
