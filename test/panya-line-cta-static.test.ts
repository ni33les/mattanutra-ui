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
    assert.match(reveal, /src="\/v11\/brand-mark\.png"/);
    assert.match(reveal, /src="\/v11\/brand-mark\.png"[\s\S]{0,80}unoptimized=\{true\}/);
    assert.match(reveal, /finalCopy\.panyaByline/);
    assert.match(reveal, /finalCopy\.panyaWisdomBody/);
    assert.match(reveal, /panyaLineModeForPlan/);
    assert.match(reveal, /const isLivingProtocol = panyaLineMode === "living_protocol"/);
    assert.match(reveal, /finalCopy\.panyaLivingBody/);
    assert.match(reveal, /finalCopy\.panyaPlanBody/);
    assert.match(reveal, /const qrUrl = useMemo/);
    assert.match(reveal, /createConnectCode/);
    assert.match(reveal, /void createConnectCode\(false, true\)/);
    assert.match(reveal, /connect\?\.code/);
    assert.match(reveal, /finalCopy\.panyaOpenLine/);
    assert.match(reveal, /\/api\/qr\?data=/);
    assert.doesNotMatch(reveal, /copyConnectCode/);
    assert.doesNotMatch(reveal, /navigator\.clipboard/);
    assert.doesNotMatch(reveal, /finalCopy\.panyaCopyCode/);
    assert.doesNotMatch(reveal, /finalCopy\.panyaCopied/);
    assert.doesNotMatch(reveal, /LivingProtocolLineCta/);
    assert.doesNotMatch(reveal, /MN PLAN/);
    assert.doesNotMatch(reveal, /source="reveal_products"/);
    assert.doesNotMatch(reveal, /source="reveal_products_checkout"/);
    assert.match(cta, /Connect with Panya for ongoing nutrition support/);
    assert.match(cta, /Connect with Panya to discuss your nutrition plan/);
    assert.match(cta, /presentation\?: "button" \| "inline_qr" \| "section"/);
    assert.match(cta, /presentation !== "inline_qr"/);
    assert.match(cta, /showBody\?: boolean/);
    assert.match(cta, /showEyebrow\?: boolean/);
    assert.match(cta, /connect\?\.code/);
    assert.match(cta, /\/api\/qr\?data=/);
    assert.doesNotMatch(cta, /MN PLAN/);
    assert.doesNotMatch(cta, /copyCommand/);
    assert.doesNotMatch(cta, /navigator\.clipboard/);
    assert.doesNotMatch(cta, /labels\.copy/);
    assert.doesNotMatch(cta, /labels\.copied/);
    assert.doesNotMatch(cta, /Copy code/);
    const inlineQrStart = cta.indexOf('presentation === "inline_qr"');
    const inlineQrEnd = cta.indexOf(') : presentation === "section"', inlineQrStart);
    const inlineQr = cta.slice(inlineQrStart, inlineQrEnd);
    assert.match(inlineQr, /className="mn-font-body text-sm leading-6 text-\[var\(--mn-ink-soft\)\]"/);
    assert.match(inlineQr, /showEyebrow \? \(/);
    assert.match(inlineQr, /<h2 className="text-xl font-semibold leading-7 text-\[var\(--mn-ink\)\]">/);
    assert.doesNotMatch(inlineQr, /role="heading"/);
    assert.doesNotMatch(inlineQr, /aria-level=\{2\}/);
    assert.match(inlineQr, /grid gap-5 sm:grid-cols-\[auto_minmax\(0,1fr\)\]/);
    assert.match(inlineQr, /labels\.openLine/);
    assert.doesNotMatch(inlineQr, /font-serif/);
    assert.doesNotMatch(inlineQr, /uppercase tracking-\[0\.16em\]/);
    assert.match(route, /const command = `MN \$\{token\.code\}`/);
    assert.match(route, /buildLineOfficialAccountMessageUrl\(command\)/);
    assert.doesNotMatch(route, /MN PLAN/);
    assert.match(chatLinks, /\/R\/oaMessage\/\$\{encodeURIComponent\(officialId\)\}\/\?\$\{encodeURIComponent\(message\)\}/);
    assert.match(communications, /randomBytes\(3\)/);
  });
});
