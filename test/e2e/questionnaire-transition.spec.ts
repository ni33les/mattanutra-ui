import { randomUUID } from "node:crypto";
import { applyAnswer, createInitialState, getDefinition, startQuestionnaire } from "../../lib/questionnaire/engine";
import { expect, test } from "../helpers/offline-browser";

for (const [locale, pharmacy] of [["en", false], ["th", true], ["zh-CN", true]] as const) {
  test(`QUIZ-MOTION ${locale} section handoff settles the next question before uncovering it`, async ({ page }) => {
    let state = startQuestionnaire(createInitialState({ locale, channel: "web", sessionId: randomUUID() })).state;
    for (const [key, value] of [["firstName", "Maya"], ["goals", ["energy", "sleep"]]] as const) {
      const answer = applyAnswer(state, key, value);
      expect(answer.ok).toBe(true);
      if (!answer.ok) throw new Error("Invalid transition fixture");
      state = answer.state;
    }
    const definition = getDefinition(state);
    expect(definition.turns[state.turnIndex].k).toBe("symptoms");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(({ state }) => {
      localStorage.setItem(`mn-questionnaire:v1:${state.sessionId}`, JSON.stringify({ version: 1, state, revision: 0,
        captured: null, contactEmail: null, paymentId: null, updatedAt: Date.now() }));
      const scrolls: string[] = [];
      Object.assign(window, { quizScrolls: scrolls });
      const intoView = Element.prototype.scrollIntoView, scrollTo = Element.prototype.scrollTo;
      Element.prototype.scrollIntoView = function (options) {
        if (typeof options === "object" && options.behavior === "smooth") scrolls.push("intoView");
        return intoView.call(this, options);
      };
      Element.prototype.scrollTo = function (...args: Parameters<typeof scrollTo>) {
        if (typeof args[0] === "object" && args[0].behavior === "smooth") scrolls.push("scrollTo");
        return scrollTo.apply(this, args);
      };
    }, { state });
    const path = pharmacy ? "/retail/matcher-v5-isolated-fixture-retailer/quiz" : "/nutrition/quiz";
    await page.goto(`/${locale}${path}?session=${state.sessionId}`);
    await page.getByRole("button", { name: definition.ui.resumeYes, exact: true }).click();
    const symptoms = definition.turns.find(t => t.k === "symptoms")!;
    await page.getByRole("button", { name: symptoms.opts!.find(o => o.v === "great")!.l, exact: true }).click();
    await page.evaluate(() => { (window as unknown as { quizScrolls: string[] }).quizScrolls.length = 0; });
    await page.getByTestId("question-answers").locator(".mn-chat-q__primary").click();
    await expect(page.getByTestId("section-stage-overlay")).toBeVisible();
    const question = page.getByTestId("paged-question");
    await expect(question).toContainText(definition.turns.find(t => t.k === "sex")!.q, { timeout: 1000 });
    await expect(page.getByTestId("section-stage-overlay")).toBeVisible();
    // The old question must never flash back during the overlay's fade-out.
    await expect.poll(() => question.evaluate(el => [...el.getAnimations(), ...el.querySelector(".mn-chat-q__bubble")!.getAnimations()].filter(a => a.playState === "running").length), { timeout: 700 }).toBe(0);
    await expect(page.getByTestId("section-stage-overlay")).toBeVisible();
    await expect(page.getByTestId("section-stage-overlay")).toHaveCount(0);
    const before = await question.boundingBox();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await question.boundingBox()).toEqual(before);
    expect(await page.evaluate(() => (window as unknown as { quizScrolls: string[] }).quizScrolls)).toEqual([]);
    expect(await page.locator(".mn-chat-q__page").evaluate(el => el.scrollTop)).toBe(0);
    expect(await page.getByTestId("question-answers").evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`section-${locale}.png`), fullPage: true });
    // Normal question changes retain one entrance; reduced motion remains immediate.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByTestId("question-answers").locator("button.mn-chat-q__chip").first().click();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(question).toContainText(definition.turns.find(t => t.k === "age")!.q);
    await expect(page.getByTestId("section-stage-overlay")).toHaveCount(0);
  });
}
