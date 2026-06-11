import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("reveal Panya LINE CTA", () => {
  it("places Panya as a top-level reveal section instead of a checkout widget", async () => {
    const [reveal, cta, route, chatLinks, communications] = await Promise.all([
      readFile("components/formulation-results.tsx", "utf8"),
      readFile("components/living-protocol-line-cta.tsx", "utf8"),
      readFile("app/api/assessment/[planId]/line-connect/route.ts", "utf8"),
      readFile("lib/chat-links.ts", "utf8"),
      readFile("lib/communications.ts", "utf8"),
    ]);

    assert.match(reveal, /function RevealPanyaLineSupportSection/);
    assert.match(reveal, /id="panya-support"/);
    assert.match(reveal, /source: "reveal_panya_support"/);
    assert.match(reveal, /05 · \{labels\.eyebrow\}/);
    assert.match(reveal, /06 · \{copy\.foodSupportEyebrow\}/);
    assert.match(reveal, /bg-\[var\(--mn-cream\)\]/);
    assert.match(reveal, /bg-\[var\(--mn-cream-deep\)\] py-20/);
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
    assert.match(cta, /presentation\?: "button" \| "section"/);
    assert.match(cta, /showBody\?: boolean/);
    assert.doesNotMatch(cta, /MN PLAN/);
    assert.match(route, /const command = `MN \$\{token\.code\}`/);
    assert.match(route, /buildLineOfficialAccountMessageUrl\(command\)/);
    assert.doesNotMatch(route, /MN PLAN/);
    assert.match(chatLinks, /\/R\/oaMessage\/\$\{encodeURIComponent\(officialId\)\}\/\?\$\{encodeURIComponent\(message\)\}/);
    assert.match(communications, /randomBytes\(3\)/);
  });
});
