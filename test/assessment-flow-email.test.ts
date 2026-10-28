import assert from "node:assert/strict";
import { register } from "node:module";
import { it, mock } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildInitialAnswers } from "../components/assessment-flow-state.ts";

register("./payment-return/next-loader.mjs", import.meta.url);
register("./pharmacy-reveal/style-loader.mjs", import.meta.url);
mock.module("next/navigation.js", { namedExports: { useRouter: () => ({ replace() {} }), usePathname: () => "/en/nutrition/quiz", useSearchParams: () => new URLSearchParams() } });
const { AssessmentFlow, buildClassicServerReceipt } = await import("../components/assessment-flow.tsx");
const answers = { ...buildInitialAnswers(), disclosure: true };

function render(locale: "en" | "th" | "zh-CN", email: string, pharmacyId?: string, section = 5) {
  return renderToStaticMarkup(createElement(AssessmentFlow, { locale, pharmacyId, skipHealthScore: true,
    initialSectionIndex: section, prefillAnswers: answers, prefillContactEmail: email }));
}
const continueButton = (html: string) => html.match(/<button\b[^>]*class="mn-assessment-continue-button"[^>]*>/)?.[0] ?? "";

for (const locale of ["en", "th", "zh-CN"] as const) {
  it(`${locale}: classic web and pharmacy final steps require a visible valid email`, () => {
    for (const pharmacyId of [undefined, "fixture-pharmacy"]) {
      for (const email of ["", "   ", "invalid"]) {
        const html = render(locale, email, pharmacyId);
        assert.match(html, /data-testid="classic-required-email"/);
        const input = html.match(/<input\b[^>]*id="classic-contact-email"[^>]*>/)?.[0] ?? "";
        assert.match(input, /type="email"/); assert.match(input, /required=""/);
        assert.doesNotMatch(input, /hidden|disabled=/);
        assert.match(continueButton(html), /disabled=""/);
      }
      assert.doesNotMatch(continueButton(render(locale, "saved@fixture.test", pharmacyId)), /disabled=/);
    }
  });
}

it("classic progress remains available without email before the final step", () => {
  const html = render("en", "", undefined, 0);
  assert.doesNotMatch(html, /classic-required-email|id="classic-contact-email"/);
  assert.doesNotMatch(continueButton(html), /disabled=/);
  assert.match(html, /type="email"/);
});

it("a server-captured pharmacy plan reuses its receipt without HealthScore, while resume-only drafts still capture", () => {
  const receipt = buildClassicServerReceipt("saved-pharmacy-plan", 2, null);
  assert.equal(receipt?.planId, "saved-pharmacy-plan");
  assert.equal(receipt?.steps.find(step => step.id === "assessment")?.state, "complete");
  assert.equal(receipt?.healthScore, undefined);
  // An old stored contact is not evidence that saved-plan delivery was requested.
  assert.equal(receipt?.contactEmail, undefined);
  assert.equal(buildClassicServerReceipt("resume-only-plan", 0, null), null);
  assert.equal(buildClassicServerReceipt(undefined, 2, null), null);
});
