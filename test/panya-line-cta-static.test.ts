import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("reveal Panya LINE CTA", () => {
  it("places Panya as a top-level reveal section instead of a checkout widget", async () => {
    const [reveal, cta, route, chatLinks, communications] = await Promise.all([
      readFile("components/reveal-final-results.tsx", "utf8"),
      readFile("components/living-protocol-line-cta.tsx", "utf8"),
      readFile("app/api/assessment/[planId]/line-connect/route.ts", "utf8"),
      readFile("lib/chat-links.ts", "utf8"),
      readFile("lib/communications.ts", "utf8"),
    ]);

    assert.match(reveal, /function RevealPanyaFinalSection/);
    assert.match(reveal, /id="panya-support"/);
    assert.match(reveal, /source: "reveal_panya_support"/);
    assert.match(reveal, /finalCopy\.panyaSection/);
    assert.match(reveal, /<RevealPanyaFinalSection/);
    assert.match(reveal, /<RevealFoodSupportFinalSection/);
    assert.match(reveal, /mn-reveal-panya border-t border-\[var\(--mn-line\)\] py-16/);
    assert.match(reveal, /mn-reveal-panya-card/);
    assert.match(reveal, /mn-reveal-panya-connect/);
    assert.doesNotMatch(reveal, /panyaSection[\s\S]{0,120}mn-reveal-final-label-number/);
    assert.match(reveal, /panyaLineModeForPlan/);
    assert.match(reveal, /const qrUrl = useMemo/);
    assert.match(reveal, /copyConnectCode/);
    assert.match(reveal, /createConnectCode/);
    assert.match(reveal, /void createConnectCode\(false, true\)/);
    assert.match(reveal, /<p className="mt-5 text-base leading-8 text-\[var\(--mn-ink-soft\)\]">/);
    assert.match(reveal, /\/api\/qr\?data=/);
    assert.doesNotMatch(reveal, /LivingProtocolLineCta/);
    assert.doesNotMatch(reveal, /MN PLAN/);
    assert.doesNotMatch(reveal, /source="reveal_products"/);
    assert.doesNotMatch(reveal, /source="reveal_products_checkout"/);
    assert.match(cta, /Connect with Panya for ongoing nutrition support/);
    assert.match(cta, /Connect with Panya to discuss your nutrition plan/);
    assert.match(cta, /presentation\?: "button" \| "inline_qr" \| "section"/);
    assert.match(cta, /presentation !== "inline_qr"/);
    assert.match(cta, /showBody\?: boolean/);
    assert.doesNotMatch(cta, /MN PLAN/);
    assert.match(route, /const command = `MN \$\{token\.code\}`/);
    assert.match(route, /buildLineOfficialAccountMessageUrl\(command\)/);
    assert.doesNotMatch(route, /MN PLAN/);
    assert.match(chatLinks, /\/R\/oaMessage\/\$\{encodeURIComponent\(officialId\)\}\/\?\$\{encodeURIComponent\(message\)\}/);
    assert.match(communications, /randomBytes\(3\)/);
  });
});
