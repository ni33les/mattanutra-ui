import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type Stripe from "stripe";
import { assertSessionMatchesPayment, type PaymentRow } from "../lib/stripe-payments.ts";
import type { StripePaymentConfig } from "../lib/stripe-payment-config.ts";
import { metaConfig } from "../lib/meta-config.ts";
import { metaCustomData, metaEventName, metaEventForBpm, sanitiseMetaUrl, browserPixelPageSafe, metaRequestOriginAllowed } from "../lib/meta-event-policy.ts";
const planId = "843893a8-4c1b-44d9-86f4-092e16270d1a";
describe("campaign export boundary", () => {
  it("accepts both production hostnames behind a proxy while rejecting foreign and cross-environment origins", () => {
    const request = (origin?: string) => new Request("http://0.0.0.0:8080/api/marketing/consent", { headers: origin ? { origin } : {} });
    for (const origin of ["https://mattanutra.com", "https://www.mattanutra.com"]) assert.equal(metaRequestOriginAllowed(request(origin), "prd"), true);
    for (const origin of [undefined, "null", "https://evil.example", "https://www.mattanutra.com.evil.example", "http://www.mattanutra.com", "https://uat.mattanutra.com"]) assert.equal(metaRequestOriginAllowed(request(origin), "prd"), false);
    assert.equal(metaRequestOriginAllowed(request("https://www.mattanutra.com"), "uat"), false);
    assert.equal(metaRequestOriginAllowed(request("https://uat.mattanutra.com"), "uat"), true);
    assert.equal(metaRequestOriginAllowed(request("https://dev.mattanutra.com"), "dev"), true);
  });
  it("requires the actual paid provider total to match the saved purchase before publishing a conversion", () => {
    const payment = { selected_plan: "precision", amount: 690000000, currency: "THB", stripe_price_id: null } as PaymentRow;
    const config = { env: "dev", mode: "test", priceIds: { precision: "", pro: "" } } as StripePaymentConfig;
    const session = { payment_status: "paid", currency: "thb", amount_total: 69000 } as Stripe.Checkout.Session;
    assert.doesNotThrow(() => assertSessionMatchesPayment(session, payment, config));
    for (const amount_total of [0, null, 68900, 70000]) assert.throws(() => assertSessionMatchesPayment({ ...session, amount_total }, payment, config), /amount/);
  });
  it("overwrites environment claims and excludes arbitrary customer/health/product fields", () => {
    assert.deepEqual(metaCustomData("Purchase", { mn_env: "prd", planId, value: 690, currency: "THB", email: "sensitive@example.com", phone: "0812345678", supplements: ["example"], healthscore: 74, answers: { condition: "private" }, contents: [{ id: "private-product" }] }, "uat"),
      { mn_env: "uat", event_schema: "1", plan_id: planId, value: 690, currency: "THB" });
    assert.deepEqual(metaCustomData("Purchase", { value: Infinity, currency: "private", planId: "private", progress: 35 }, "dev"), { mn_env: "dev", event_schema: "1" });
  });
  it("keeps DEV/UAT conversions out of standard production events even with a shared pixel", () => {
    for (const name of ["PageView", "Purchase", "Lead"] as const) {
      assert.equal(metaEventName(name, "dev"), `DEV_${name}`);
      assert.equal(metaEventName(name, "uat"), `UAT_${name}`);
      assert.equal(metaEventName(name, "prd"), name);
    }
    const old = process.env.MATTANUTRA_ENV, oldPublic = process.env.NEXT_PUBLIC_MATTANUTRA_ENV;
    try { process.env.MATTANUTRA_ENV = "uat"; process.env.NEXT_PUBLIC_MATTANUTRA_ENV = "prd"; assert.equal(metaConfig().environment, "uat"); }
    finally { if(old===undefined)delete process.env.MATTANUTRA_ENV; else process.env.MATTANUTRA_ENV=old; if(oldPublic===undefined)delete process.env.NEXT_PUBLIC_MATTANUTRA_ENV; else process.env.NEXT_PUBLIC_MATTANUTRA_ENV=oldPublic; }
  });
  it("permits coarse purchase categories and offers without supplement identities", () => {
    assert.deepEqual(metaCustomData("Purchase", { purchase_type: "plan", offer: "precision", channel: "pharmacy", locale: "th", value: 690, currency: "THB", campaign_id: "123", content_ids: ["private"], content_name: "private" }, "prd"),
      { mn_env: "prd", event_schema: "1", locale: "th", channel: "retail", offer: "precision", purchase_type: "plan", value: 690, currency: "THB", campaign_id: "123" });
    assert.equal(metaCustomData("Purchase", { purchase_type: "products", channel: "mcp_web" }, "uat").purchase_type, "products");
    assert.equal(metaCustomData("Purchase", { purchase_type: "private-supplement", offer: "private-condition" }, "prd").purchase_type, undefined);
    assert.equal(metaCustomData("PageView", { purchase_type: "products" }, "prd").purchase_type, undefined);
  });
  it("retains permitted page/plan URLs and strips contacts, products, capabilities and arbitrary search text", () => {
    assert.equal(sanitiseMetaUrl(`https://uat.mattanutra.com/en/nutrition/healthscore?planId=${planId}&email=private&condition=private#secret`, "uat"), `https://uat.mattanutra.com/en/nutrition/healthscore?planId=${planId}`);
    assert.equal(sanitiseMetaUrl("https://uat.mattanutra.com/en/mcp/checkout/secret-token?order=private", "uat"), "https://uat.mattanutra.com/en/basket/checkout");
    assert.equal(sanitiseMetaUrl("https://uat.mattanutra.com/en/admin/dashboard", "uat"), null);
    assert.equal(sanitiseMetaUrl("https://mattanutra.com/en", "uat"), null);
    assert.equal(sanitiseMetaUrl("https://evil.example/en", "prd"), null);
  });
  it("never loads native Pixel on personalised pages or with a sensitive referrer", () => {
    assert.equal(browserPixelPageSafe("https://mattanutra.com/en", "", "prd"), true);
    for (const url of [`https://mattanutra.com/en?email=private`, `https://mattanutra.com/en/nutrition/healthscore?planId=${planId}`, "https://mattanutra.com/en/basket/checkout"]) assert.equal(browserPixelPageSafe(url, "", "prd"), false);
    assert.equal(browserPixelPageSafe("https://mattanutra.com/en", "https://mattanutra.com/en/nutrition/healthscore?private", "prd"), false);
    assert.equal(browserPixelPageSafe("https://mattanutra.com/en", "https://customer-private.example/en", "prd"), false);
  });
  it("detects native Pixel on tagged public landing pages opened from Meta tools or ads", () => {
    const landing = "https://mattanutra.com/en?fbclid=opaque-click_123&campaign_id=111&adset_id=222&ad_id=333&creative_id=444";
    for (const referrer of ["", "https://business.facebook.com/", "https://adsmanager.facebook.com/", "https://m.facebook.com/", "https://lm.facebook.com/", "https://l.instagram.com/"]) {
      assert.equal(browserPixelPageSafe(landing, referrer, "prd"), true, referrer);
    }
    assert.equal(browserPixelPageSafe("https://www.mattanutra.com/th", landing, "prd"), true);
    assert.equal(browserPixelPageSafe("https://mattanutra.com/en", "https://mattanutra.com/en/privacy", "prd"), true);
  });
  it("rejects sensitive or malformed ad parameters and lookalike Meta referrers", () => {
    for (const query of ["campaign_id=health-condition", "campaign_id=111&campaign_id=private", "ad_id={{ad.id}}", "fbclid=private@example.com", "fbclid=", "utm_campaign=private", "campaign_id=111&email=private", "campaign_id=" + "1".repeat(26)]) {
      assert.equal(browserPixelPageSafe(`https://mattanutra.com/en?${query}`, "https://business.facebook.com/", "prd"), false, query);
    }
    for (const referrer of ["https://business.facebook.com.evil.example/", "http://business.facebook.com/", "https://business.facebook.com/?private=1", "https://business.facebook.com/private", "https://business.facebook.com/#private", "https://mattanutra.com/en/privacy?email=private", "https://uat.mattanutra.com/en"]) {
      assert.equal(browserPixelPageSafe("https://mattanutra.com/en", referrer, "prd"), false, referrer);
    }
  });
  it("counts genuine funnel milestones rather than internal chatter or an assessment view", () => {
    assert.equal(metaEventForBpm("chat_view"), null);
    assert.equal(metaEventForBpm("chat_start"), "QuizStart");
    assert.equal(metaEventForBpm("line_connected"), "Contact");
    assert.equal(metaEventForBpm("payment_succeeded"), null);
    assert.equal(metaEventForBpm("chat_complete"), null);
    assert.equal(metaEventForBpm("retail_product_checkout_viewed"), null);
  });
});
