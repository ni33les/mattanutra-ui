import { randomUUID } from "node:crypto";
import { screenCopy } from "../../lib/questionnaire/screens";
import type { Locale } from "../../lib/i18n";
import { expect, test, type Page } from "../helpers/offline-browser";

const slug = "matcher-v5-isolated-fixture-retailer";
type Source = "in_store" | "business_card";

async function openPharmacyReview(page: Page, source: Source, locale: Locale = "en") {
  await page.route("**/api/bpm", route => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/questionnaire/session", route => route.fulfill({ json: { ok: true } }));
  await page.goto(`/${locale}/retail/${slug}?source=${source}`);
  await expect(page.getByTestId("pharmacy-landing")).toBeVisible();
  await page.getByTestId("pharmacy-landing").locator('a[data-bpm-event="pharmacy_landing_assessment_clicked"]').click();
  await expect(page.locator('[data-question="firstName"]').getByRole("textbox")).toBeVisible();
  const url = new URL(page.url());
  const sessionId = url.searchParams.get("session");
  expect(sessionId).toBeTruthy();
  expect(url.searchParams.get("source")).toBe(source);
  await page.getByTestId("dev-fill-questionnaire").click();
  await expect(page.getByTestId("questionnaire-review")).toBeVisible();
  return { sessionId: sessionId!, quizUrl: page.url() };
}

async function expectSharedConfirmation(page: Page, locale: Locale) {
  const copy = screenCopy(locale).x;
  const root = page.getByTestId("chat-questionnaire");
  await expect(root).toHaveAttribute("data-confirmation-layout", "true");
  await expect(page.getByTestId("questionnaire-email-card").getByRole("heading")).toHaveText(copy.emailTitle);
  await expect(page.locator('section[aria-labelledby="questionnaire-confirmation-title"] details')).toBeVisible();
  await expect(page.getByText(copy.unknownNotice, { exact: true })).toHaveCount(0);
  await expect(page.getByText(copy.emailOptionalNote, { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("questionnaire-back")).toHaveCount(0);
  await expect(root.getByRole("button", { name: /LINE/i })).toHaveCount(0);
  await expect(page.locator("#questionnaire-contact-email")).toHaveJSProperty("required", true);
  expect(await page.evaluate(() => {
    const email = document.querySelector('[data-testid="questionnaire-email-card"]')!.getBoundingClientRect();
    const submit = document.querySelector('[data-testid="questionnaire-submit"]')!.getBoundingClientRect();
    return submit.top >= email.bottom;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const source of ["in_store", "business_card"] as const) {
  test(`PHARM-CONFIRMATION ${source} validates email and preserves contact and acquisition through reload and language change`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const captures: Array<Record<string, unknown>> = [];
    await page.route("**/api/assessment", route => {
      captures.push(route.request().postDataJSON());
      return route.fulfill({ status: 503, json: { message: "Capture inspection barrier" } });
    });
    const { sessionId, quizUrl } = await openPharmacyReview(page, source);
    await expectSharedConfirmation(page, "en");
    await expect(page.getByTestId("questionnaire-submit")).toBeDisabled();
    await page.getByTestId("questionnaire-disclosure").check();
    const email = page.locator("#questionnaire-contact-email");
    for (const invalid of ["", "   ", "not an email"]) {
      await email.fill(invalid);
      await expect(page.getByTestId("questionnaire-submit")).toBeEnabled();
      await page.getByTestId("questionnaire-submit").click();
      await expect(email).toHaveAttribute("aria-invalid", "true");
      await expect(email).toBeFocused();
      await expect(page.locator("#questionnaire-email-error")).toBeVisible();
      await expect(page.locator("#questionnaire-email-error")).toHaveText(invalid.trim()
        ? screenCopy("en").x.emailError : screenCopy("en").x.emailRequired);
      await expect(page.getByTestId("questionnaire-review")).toBeVisible();
      expect(captures).toHaveLength(0);
      expect(new URL(page.url()).pathname).toBe(`/en/retail/${slug}/quiz`);
    }
    await email.fill("Pharmacy@fixture.test");
    await page.reload();
    await page.getByTestId("questionnaire-resume").click();
    await expect(email).toHaveValue("Pharmacy@fixture.test");
    await page.goto(quizUrl.replace("/en/retail/", "/th/retail/"));
    await page.getByTestId("questionnaire-resume").click();
    await expectSharedConfirmation(page, "th");
    await expect(email).toHaveValue("Pharmacy@fixture.test");
    await expect(page.getByTestId("questionnaire-disclosure")).toBeChecked();
    expect(new URL(page.url()).searchParams.get("session")).toBe(sessionId);
    expect(new URL(page.url()).searchParams.get("source")).toBe(source);
    await page.getByTestId("questionnaire-submit").click();
    await expect.poll(() => captures.length).toBe(1);
    expect(captures[0]).toMatchObject({ intent: "capture", locale: "th", sessionId, pharmacyId: slug,
      contactEmail: "pharmacy@fixture.test", bpm: { ray: sessionId,
        attribution: { trafficSource: "pharmacy", sourceChannel: slug, sourceDetail: source } } });
    expect(captures[0].answers).not.toHaveProperty("contactEmail");
    expect(captures[0].answers).not.toHaveProperty("inStorePharmacy");
    expect(captures[0].questionnaireState).not.toHaveProperty("answers.contactEmail");
  });

  test(`PHARM-CONFIRMATION ${source} captures normalized email and hands the assessment to pharmacy reveal`, async ({ page }) => {
    const captures: Array<Record<string, unknown>> = [];
    const contactEmail = `Pharmacy.${randomUUID()}@fixture.test`;
    await page.route("**/api/assessment", async route => {
      captures.push(route.request().postDataJSON());
      // Native capture against isolated PostgreSQL proves contact capture
      // keeps the pharmacy journey and acquisition binding. SMTP is blocked,
      // and no email worker runs against this fixture.
      await route.fulfill({ response: await route.fetch() });
    });
    const { sessionId } = await openPharmacyReview(page, source, "th");
    await expectSharedConfirmation(page, "th");
    await expect(page.locator("#questionnaire-contact-email")).toBeEmpty();
    await page.getByTestId("questionnaire-disclosure").check();
    await page.locator("#questionnaire-contact-email").fill(contactEmail);
    await page.getByTestId("questionnaire-submit").click();
    await expect(page).toHaveURL(new RegExp(`/th/retail/${slug}/reveal\\?plan=`));
    await expect(page.getByTestId("pharmacy-combined")).toBeVisible();
    await expect(page.locator("[data-pharmacy-source]")).toHaveAttribute("data-pharmacy-source", source);
    expect(captures).toHaveLength(1);
    expect(captures[0].contactEmail).toBe(contactEmail.toLowerCase());
    expect(captures[0]).toMatchObject({ sessionId, pharmacyId: slug,
      bpm: { ray: sessionId, attribution: { sourceDetail: source } } });
    await expect(page.getByTestId("questionnaire-calculating")).toHaveCount(0);
  });

  test(`PHARM-CONFIRMATION ${source} corrects a captured contact without recapturing the assessment`, async ({ page }) => {
    const captures: string[] = [], contacts: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
    const planId = randomUUID();
    await page.route("**/api/assessment", route => { captures.push(route.request().url()); return route.abort(); });
    await page.route("**/api/assessment/*/contact", route => {
      const request = route.request(), body = request.postDataJSON();
      contacts.push({ method: request.method(), path: new URL(request.url()).pathname, body });
      return route.fulfill({ json: { planId, revision: 2, contactEmail: body.contactEmail } });
    });
    // Hold navigation at the reveal boundary: this receipt is a browser
    // fixture, and contact corrections must not calculate or recapture it.
    await page.route(`**/retail/${slug}/reveal?**`, route => route.abort());
    const { sessionId } = await openPharmacyReview(page, source, "th");
    await page.getByTestId("questionnaire-disclosure").check();
    await page.evaluate(({ sessionId, planId }) => {
      const key = `mn-questionnaire:v1:${sessionId}`;
      const draft = JSON.parse(localStorage.getItem(key)!);
      draft.state.planId = planId;
      draft.revision = 2;
      draft.captured = { planId, revision: 2, contactEmail: "saved@fixture.test" };
      draft.contactEmail = "saved@fixture.test";
      draft.updatedAt = Date.now();
      localStorage.setItem(key, JSON.stringify(draft));
    }, { sessionId, planId });
    await page.reload();
    await page.getByTestId("questionnaire-resume").click();
    const email = page.locator("#questionnaire-contact-email");
    await expect(email).toHaveValue("saved@fixture.test");
    await email.fill("Corrected@fixture.test");
    await page.getByTestId("questionnaire-submit").click();
    await expect.poll(() => contacts.length).toBe(1);
    expect(contacts[0]).toEqual({ method: "PATCH", path: `/api/assessment/${planId}/contact`,
      body: { contactEmail: "corrected@fixture.test", locale: "th" } });
    expect(captures).toHaveLength(0);
    await expect.poll(async () => {
      const storage = await page.context().storageState();
      const saved = storage.origins.flatMap(origin => origin.localStorage)
        .find(item => item.name === `mn-questionnaire:v1:${sessionId}`);
      return saved ? JSON.parse(saved.value).captured : null;
    }).toEqual({ planId, revision: 2, contactEmail: "corrected@fixture.test" });
  });

  for (const recovery of [{ phase: "complete", captured: true }, { phase: "completing", captured: false }] as const) {
    test(`PHARM-CONFIRMATION ${source} ${recovery.phase} draft without email returns to confirmation before resuming`, async ({ page }) => {
      const captures: Array<Record<string, unknown>> = [], contacts: Array<Record<string, unknown>> = [];
      const planId = recovery.captured ? randomUUID() : null;
      await page.route("**/api/assessment", route => {
        captures.push(route.request().postDataJSON());
        return route.fulfill({ status: 503, json: { message: "Capture inspection barrier" } });
      });
      await page.route("**/api/assessment/*/contact", route => {
        const body = route.request().postDataJSON(); contacts.push(body);
        return route.fulfill({ json: { planId, revision: 2, contactEmail: body.contactEmail } });
      });
      await page.route(`**/retail/${slug}/reveal?**`, route => route.abort());
      const { sessionId } = await openPharmacyReview(page, source, "th");
      await page.getByTestId("questionnaire-disclosure").check();
      await page.evaluate(({ sessionId, planId, phase }) => {
        const key = `mn-questionnaire:v1:${sessionId}`;
        const draft = JSON.parse(localStorage.getItem(key)!);
        draft.state.planId = planId;
        draft.state.phase = phase;
        draft.revision = planId ? 2 : 0;
        draft.captured = planId ? { planId, revision: 2, contactEmail: null } : null;
        draft.contactEmail = null;
        draft.updatedAt = Date.now();
        localStorage.setItem(key, JSON.stringify(draft));
      }, { sessionId, planId, phase: recovery.phase });
      await page.reload();
      await expect(page.getByTestId("questionnaire-review")).toBeVisible();
      await expectSharedConfirmation(page, "th");
      const email = page.locator("#questionnaire-contact-email");
      await expect(email).toBeEmpty();
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
        expect(contacts[0]).toEqual({ contactEmail: "recovered@fixture.test", locale: "th" });
        expect(captures).toHaveLength(0);
      } else {
        await expect.poll(() => captures.length).toBe(1);
        expect(captures[0]).toMatchObject({ contactEmail: "recovered@fixture.test", pharmacyId: slug,
          bpm: { attribution: { sourceDetail: source } } });
        expect(contacts).toHaveLength(0);
      }
    });
  }
}
