import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { metaAdUrlParameters, metaCampaignAttribution, metaClickId, metaFbc } from "../lib/meta-attribution.ts";

describe("Meta campaign capture", () => {
  it("captures only numeric ad identifiers from eligible pages", () => {
    assert.deepEqual(metaCampaignAttribution("/th?campaign_id=123&adset_id=456&ad_id=789&creative_id=012&email=private&condition=private", "prd"),
      { campaign_id: "123", adset_id: "456", ad_id: "789", creative_id: "012" });
    assert.deepEqual(metaCampaignAttribution("/en?campaign_id={{campaign.id}}&ad_id=private&creative_id=12345678901234567890123456", "prd"), {});
    assert.equal(metaAdUrlParameters, "campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}");
  });
  it("rejects private, foreign and other-environment source pages", () => {
    for (const source of ["/en/admin/dashboard", "https://evil.example/en", "https://uat.mattanutra.com/en"]) {
      assert.deepEqual(metaCampaignAttribution(`${source}?campaign_id=123&fbclid=click`, "prd"), {});
      assert.equal(metaClickId(`${source}?fbclid=click`, "prd"), null);
    }
    assert.equal(metaClickId("https://www.mattanutra.com/en?fbclid=click_123", "prd"), "click_123");
    assert.equal(metaClickId("/en?fbclid=invalid%20click", "prd"), null);
  });
  it("retains the last captured ad on an untagged return, without mixing new and old ad IDs", () => {
    const previous = { campaign_id: "123", adset_id: "456", ad_id: "789", email: "private" };
    assert.deepEqual(metaCampaignAttribution("/en/nutrition/payment/return", "prd", previous), { campaign_id: "123", adset_id: "456", ad_id: "789" });
    assert.deepEqual(metaCampaignAttribution("/en?campaign_id=999", "prd", previous), { campaign_id: "999" });
    assert.deepEqual(metaCampaignAttribution("/en?fbclid=newClick", "prd", previous, true), {});
  });
  it("keeps original fbc timestamps across refreshes and ignores stale browser cookies", () => {
    const original = "fb.1.1770000000000.clickOne", stale = "fb.1.1760000000000.oldClick";
    assert.equal(metaFbc("clickOne", stale, original, 1780000000000), original);
    assert.equal(metaFbc(null, stale, original, 1780000000000), original);
    assert.equal(metaFbc("clickTwo", stale, original, 1780000000000), "fb.1.1780000000000.clickTwo");
    assert.equal(metaFbc("oldClick", stale, undefined, 1780000000000), stale);
    assert.equal(metaFbc(null, null, undefined), undefined);
    assert.equal(metaFbc(null, "invalid", "invalid"), undefined);
  });
});
