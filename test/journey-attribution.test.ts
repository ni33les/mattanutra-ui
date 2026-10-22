import test from "node:test";
import assert from "node:assert/strict";
import { commerceBpmContext, normalizeJourneyAttribution } from "../lib/journey-attribution.ts";

test("acquisition persists only the defined internal attribution fields", () => {
  const saved = normalizeJourneyAttribution({ ray: "ba16bc74-b17e-40b4-adb4-8a9c7a28042c", attribution: {
    utmCampaign: " first campaign ", campaignId: "1201234", adId: "1206789", conditions: ["private"], email: "private@example.com"
  } });
  assert.deepEqual(saved, { ray: "ba16bc74-b17e-40b4-adb4-8a9c7a28042c", attribution: { adId: "1206789", campaignId: "1201234", utmCampaign: "first campaign" } });
  assert.equal(normalizeJourneyAttribution({ answers: { goals: ["private"] } }), null);
});

test("commerce events retain first attribution and trusted test markers", () => {
  const context = commerceBpmContext({ channel: "web", journeyVersion: "web-products-v1", internal_test: "true",
    acquisitionAttribution: { attribution: { utmSource: "facebook", utmCampaign: "first" } }
  }, "live");
  assert.equal(context.attribution?.utmSource, "facebook");
  assert.equal(context.properties.internal_test, true);
  assert.equal(context.properties.stripeMode, "live");
  assert.equal(context.properties.journeyVersion, "web-products-v1");
  assert.equal(commerceBpmContext(null, "mock").properties.internal_test, false);
});
