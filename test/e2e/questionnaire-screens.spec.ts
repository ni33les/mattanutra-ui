import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "../helpers/offline-browser";

async function select(page: Page, key: string, value: string) {
  await page.locator(`[data-question="${key}"] button[data-value="${value}"]`).click();
}
async function next(page: Page, screen: string) {
  await page.getByTestId("questionnaire-next").click();
  await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible();
}

for (const [locale, pharmacy] of [["en", false], ["th", true]] as const) {
  test(`QUIZ-CAPTURE ${locale} ${pharmacy ? "pharmacy" : "web"} grouped answers survive review edits and native capture`, async ({ page }) => {
    const session = randomUUID();
    const requests: Array<{ body: Record<string, unknown>; key: string | undefined }> = [];
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/bpm", route => route.fulfill({ json: { ok: true } }));
    await page.route("**/api/questionnaire/session", route => route.fulfill({ json: { ok: true } }));
    await page.route("**/api/assessment", async route => {
      requests.push({ body: route.request().postDataJSON(), key: route.request().headers()["idempotency-key"] });
      await route.fulfill({ status: 503, json: { message: "Controlled capture barrier" } });
    });
    const path = pharmacy ? "/retail/matcher-v5-isolated-fixture-retailer/quiz" : "/nutrition/quiz";
    await page.goto(`/${locale}${path}?session=${session}&source=business_card`);
    if (!pharmacy) await page.getByTestId("questionnaire-welcome-cta").click();
    await page.locator('[data-question="firstName"]').getByRole("textbox").fill("Maya");
    await next(page, "goals");
    await select(page, "goals", "energy");
    await select(page, "goals", "sleep");
    await next(page, "symptoms");
    await select(page, "symptoms", "great");
    await next(page, "basics");
    await select(page, "age", "36-45");
    await select(page, "sex", "male");
    await next(page, "sleep");
    await select(page, "sleepHrs", "7-8");
    await select(page, "energy", "good");
    await next(page, "move");
    await select(page, "activity", "moderate");
    await select(page, "stress", "low");
    await next(page, "habits");
    await select(page, "smoking", "never");
    await select(page, "alcohol", "none");
    await select(page, "caffeine", "1");
    await next(page, "body");
    await expect(page.getByTestId("questionnaire-next")).toBeDisabled();
    await page.locator("#height").fill("0");
    await page.locator("#weight").fill("72");
    await expect(page.getByTestId("questionnaire-next")).toBeDisabled();
    await page.locator("#height-unknown").check();
    await expect(page.locator("#height")).toBeDisabled();
    await next(page, "sun");
    await select(page, "skin", "3");
    await select(page, "sun", "15-30");
    await select(page, "sunscreen", "daily");
    await next(page, "country");
    await select(page, "country", "Thailand");
    await next(page, "gut");
    await select(page, "digestion", "none");
    await select(page, "antibiotics", "no");
    await next(page, "gutCondition");
    await select(page, "digCondition", "none");
    await next(page, "diet");
    await select(page, "diet", "balanced");
    await next(page, "foodA");
    await select(page, "f_redmeat", "1-2");
    await select(page, "f_dairy", "1-2");
    await select(page, "f_fruitveg", "3+");
    await next(page, "foodB");
    await select(page, "f_eggs", "weekly");
    await select(page, "f_legumes", "most");
    await select(page, "f_fish", "once");
    await next(page, "allergies");
    await select(page, "allergies", "milk");
    await page.locator('[data-question="avoid"]').getByRole("textbox").fill("No grapefruit");
    await next(page, "consent");
    await page.locator('[data-question="consentSafety"]').getByRole("checkbox").check();
    await next(page, "organs");
    await select(page, "kidney", "normal");
    await select(page, "liver", "normal");
    await select(page, "surgery", "no");
    await next(page, "meds");
    await select(page, "meds", "yes");
    await select(page, "medTypes", "other");
    await page.locator('[data-question="otherMed"]').getByRole("textbox").fill("Prescribed medicine, details to discuss");
    await next(page, "suppreact");
    await select(page, "suppAllergies", "other");
    await page.locator('[data-question="otherSupp"]').getByRole("textbox").fill("Reaction to an unidentified supplement");
    await next(page, "supps");
    await select(page, "supplements", "none");
    await next(page, "family");
    await select(page, "family", "heart");
    await select(page, "family", "unsure");
    await expect(page.locator('[data-question="family"] button[data-value="heart"]')).toHaveAttribute("aria-pressed", "false");
    await next(page, "bloods");
    await select(page, "labs", "yes");
    await page.locator("#lab_vitd").fill("-2");
    await expect(page.getByTestId("questionnaire-next")).toBeDisabled();
    await page.locator("#lab_vitd").fill("42");
    await page.locator('[data-question="labs"]').getByRole("combobox").first().selectOption("nmol/L");
    await next(page, "review");
    await expect(page.getByTestId("questionnaire-submit")).toBeDisabled();
    expect(requests).toHaveLength(0);
    await page.getByTestId("questionnaire-disclosure").check();
    await page.getByTestId("questionnaire-review").locator("summary").click();
    await page.locator('[data-edit-screen="sleep"]').first().click();
    await expect(page.locator('[data-screen="sleep"]')).toBeVisible();
    await select(page, "energy", "excellent");
    await next(page, "review");
    await expect(page.getByTestId("questionnaire-disclosure")).not.toBeChecked();
    await expect(page.getByTestId("questionnaire-submit")).toBeDisabled();
    await page.getByTestId("questionnaire-disclosure").check();
    await page.getByTestId("questionnaire-submit").click();
    await expect.poll(() => requests.length).toBe(1);
    const { body, key } = requests[0];
    expect(key).toBeTruthy();
    expect(body).toMatchObject({ intent: "capture", locale, sessionId: session });
    expect(body.answers).toMatchObject({ firstName: "Maya", heightCm: "", weightKg: "72", energy: "excellent", family: ["unsure"],
      allergies: ["milk"], avoid: "No grapefruit", otherSupp: "Reaction to an unidentified supplement",
      medTypes: ["other"], otherMed: "Prescribed medicine, details to discuss", labs: { vitd: "42" }, labUnits: { vitd: "nmol/L" }, disclosure: true });
    // The shared capture adapter marks the outgoing request as in flight; the
    // receipt changes it to complete only after the server acknowledges it.
    expect(body.questionnaireState).toMatchObject({ version: "v15.5-screens", sessionId: session, phase: "completing",
      answers: { heightStatus: "unknown", weightStatus: "known", labsHave: "yes" } });
    if (pharmacy) {
      expect(body.pharmacyId).toBe("matcher-v5-isolated-fixture-retailer");
      expect(body.bpm).toMatchObject({ ray: session, attribution: { trafficSource: "pharmacy", sourceDetail: "business_card" } });
    } else expect(body.pharmacyId).toBeUndefined();
    const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`mn-questionnaire:v1:${id}`)!), session);
    expect(saved.state.answers.energy).toBe("excellent");
    expect(saved.state.answers.heightStatus).toBe("unknown");
    expect(saved.captured).toBeNull();
  });
}
