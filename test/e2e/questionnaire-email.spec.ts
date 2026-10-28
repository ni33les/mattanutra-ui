import { randomUUID } from "node:crypto";
import { createScreenState, fastForwardScreens, screenCopy } from "../../lib/questionnaire/screens";
import type { ChatDraft } from "../../lib/questionnaire/browser-draft";
import type { Locale } from "../../lib/i18n";
import { expect, test, type Page } from "../helpers/offline-browser";

async function openReview(page: Page, locale: Locale, captured = false,
  recovery?: { phase: "complete" | "completing"; contactEmail: string | null }) {
  const sessionId = randomUUID(), planId = captured ? randomUUID() : null;
  const state = fastForwardScreens(createScreenState(locale, sessionId));
  const contactEmail = recovery ? recovery.contactEmail : captured ? "saved@fixture.test" : null;
  const draft: ChatDraft = { version: 1,
    state: { ...state, ...(recovery ? { phase: recovery.phase } : {}), planId,
      answers: { ...state.answers, disclosure: captured || Boolean(recovery) } },
    revision: captured ? 2 : 0, captured: planId ? { planId, revision: 2, contactEmail } : null,
    contactEmail, paymentId: null, updatedAt: Date.now() };
  await page.addInitScript(saved => {
    const key = `mn-questionnaire:v1:${saved.state.sessionId}`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(saved));
  }, draft);
  await page.route("**/api/bpm", route => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/questionnaire/session", route => route.fulfill({ json: { ok: true } }));
  await page.goto(`/${locale}/nutrition/quiz?session=${sessionId}`);
  if (!recovery) await page.getByTestId("questionnaire-resume").click();
  await expect(page.getByTestId("questionnaire-review")).toBeVisible();
  return { sessionId, planId };
}

for (const locale of ["en", "th", "zh-CN"] as const) {
  test(`QUESTIONNAIRE-EMAIL ${locale} requires valid contact and preserves it across reload and locale switch`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const captures: Array<Record<string, unknown>> = [];
    await page.route("**/api/assessment", route => {
      captures.push(route.request().postDataJSON());
      return route.fulfill({ status: 503, json: { message: "Capture inspection barrier" } });
    });
    const { sessionId } = await openReview(page, locale);
    const card = page.getByTestId("questionnaire-email-card");
    await expect(card.getByRole("heading")).toHaveText(screenCopy(locale).x.emailTitle);
    await expect(card.getByRole("button")).toHaveCount(0);
    await expect(page.getByTestId("questionnaire-submit")).toBeDisabled();
    await page.getByTestId("questionnaire-disclosure").check();
    const email = page.locator("#questionnaire-contact-email");
    await expect(email).toHaveJSProperty("required", true);
    for (const invalid of ["", "   ", "not an email"]) {
      await email.fill(invalid);
      await expect(page.getByTestId("questionnaire-submit")).toBeEnabled();
      await page.getByTestId("questionnaire-submit").click();
      await expect(email).toHaveAttribute("aria-invalid", "true");
      await expect(email).toBeFocused();
      await expect(page.locator("#questionnaire-email-error")).toBeVisible();
      await expect(page.locator("#questionnaire-email-error")).toHaveText(invalid.trim()
        ? screenCopy(locale).x.emailError : screenCopy(locale).x.emailRequired);
      await expect(page.getByTestId("questionnaire-review")).toBeVisible();
      expect(captures).toHaveLength(0);
      expect(new URL(page.url()).pathname).toBe(`/${locale}/nutrition/quiz`);
    }
    await email.fill("Maya@fixture.test");
    await page.reload();
    await page.getByTestId("questionnaire-resume").click();
    await expect(email).toHaveValue("Maya@fixture.test");
    const displayLocale = locale === "th" ? "en" : "th";
    await page.goto(`/${displayLocale}/nutrition/quiz?session=${sessionId}`);
    await page.getByTestId("questionnaire-resume").click();
    await expect(email).toHaveValue("Maya@fixture.test");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByTestId("questionnaire-submit").click();
    await expect.poll(() => captures.length).toBe(1);
    expect(captures[0].contactEmail).toBe("maya@fixture.test");
    expect(captures[0].locale).toBe(displayLocale);
    expect(captures[0].answers).not.toHaveProperty("contactEmail");
    expect(captures[0].questionnaireState).not.toHaveProperty("answers.contactEmail");
  });
}

for (const recovery of [{ phase: "complete", captured: true }, { phase: "completing", captured: false }] as const) {
  test(`QUESTIONNAIRE-EMAIL ${recovery.phase} draft without email returns to confirmation before resuming`, async ({ page }) => {
    const captures: Array<Record<string, unknown>> = [], contacts: Array<Record<string, unknown>> = [];
    await page.route("**/api/assessment", route => {
      captures.push(route.request().postDataJSON());
      return route.fulfill({ status: 503, json: { message: "Capture inspection barrier" } });
    });
    await page.route("**/api/assessment/*/contact", route => {
      const body = route.request().postDataJSON(); contacts.push(body);
      const planId = new URL(route.request().url()).pathname.split("/")[3];
      return route.fulfill({ json: { planId, revision: 2, contactEmail: body.contactEmail } });
    });
    await page.route("**/nutrition/reveal?**", route => route.abort());
    await openReview(page, "en", recovery.captured, { phase: recovery.phase, contactEmail: null });
    const email = page.locator("#questionnaire-contact-email");
    await expect(email).toBeEmpty();
    await expect(email).toHaveJSProperty("required", true);
    await expect(page.getByTestId("questionnaire-disclosure")).toBeChecked();
    await expect(page.getByTestId("questionnaire-calculating")).toHaveCount(0);
    expect(captures).toHaveLength(0);
    expect(contacts).toHaveLength(0);
    await page.getByTestId("questionnaire-submit").click();
    await expect(email).toBeFocused();
    await expect(page.locator("#questionnaire-email-error")).toBeVisible();
    expect(captures).toHaveLength(0);
    expect(contacts).toHaveLength(0);
    await email.fill("Recovered@fixture.test");
    await page.getByTestId("questionnaire-submit").click();
    if (recovery.captured) {
      await expect.poll(() => contacts.length).toBe(1);
      expect(contacts[0]).toEqual({ contactEmail: "recovered@fixture.test", locale: "en" });
      expect(captures).toHaveLength(0);
    } else {
      await expect.poll(() => captures.length).toBe(1);
      expect(captures[0].contactEmail).toBe("recovered@fixture.test");
      expect(contacts).toHaveLength(0);
    }
  });
}

test("QUESTIONNAIRE-EMAIL updates captured contact without creating a new assessment", async ({ page }) => {
  const captures: string[] = [], contacts: Array<Record<string, unknown>> = [];
  await page.route("**/api/assessment", route => { captures.push(route.request().url()); return route.abort(); });
  await page.route("**/api/assessment/*/contact", route => {
    const body = route.request().postDataJSON(); contacts.push(body);
    const planId = new URL(route.request().url()).pathname.split("/")[3];
    return route.fulfill({ json: { planId, revision: 2, contactEmail: body.contactEmail } });
  });
  // Navigation is intentionally held at the results boundary: this test only
  // inspects the contact transaction and never calculates a fixture plan.
  await page.route("**/nutrition/reveal?**", route => route.abort());
  const { sessionId, planId } = await openReview(page, "th", true);
  await expect(page.locator("#questionnaire-contact-email")).toHaveValue("saved@fixture.test");
  await page.locator("#questionnaire-contact-email").fill("new@fixture.test");
  await page.getByTestId("questionnaire-submit").click();
  await expect.poll(() => contacts.length).toBe(1);
  expect(contacts[0]).toEqual({ contactEmail: "new@fixture.test", locale: "th" });
  expect(captures).toHaveLength(0);
  // The successful contact update immediately navigates to reveal. Inspect
  // browser storage independently of the document being replaced.
  await expect.poll(async () => {
    const storage = await page.context().storageState();
    const saved = storage.origins.flatMap(origin => origin.localStorage)
      .find(item => item.name === `mn-questionnaire:v1:${sessionId}`);
    return saved ? JSON.parse(saved.value).captured : null;
  }).toEqual({ planId, revision: 2, contactEmail: "new@fixture.test" });
});
