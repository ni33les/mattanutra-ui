import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "../helpers/offline-browser";
import { applyAnswer, createInitialState, startQuestionnaire } from "../../lib/questionnaire/engine";
import en from "../../content/questionnaire/v15-5/en.json" with { type: "json" };
import th from "../../content/questionnaire/v15-5/th.json" with { type: "json" };

const slug = "matcher-v5-isolated-fixture-retailer";
const copy = (locale: string) => locale === "th" ? th : en;

test.beforeEach(async ({ page }) => {
  // These checks exercise the landing and local draft flow without writing analytics or checkpoints.
  await page.route("**/api/bpm", route => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/questionnaire/session", route => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/marketing/**", route => route.fulfill({ json: { ok: true } }));
});

const landingCopy = {
  en: {
    headline: "Know what to take.And what to skip.",
    cta: "Get my free plan",
    lede: "Your personal supplement plan, free, the moment you finish",
    promises: ["About 5 minutes", "No obligation", "No subscription"],
    trust: ["Physician-founded", "Thai FDA-registered products"]
  },
  th: {
    headline: "รู้ว่าอะไรควรกินและอะไรไม่จำเป็น",
    cta: "รับแผนฟรี",
    lede: "รับแผนอาหารเสริมเฉพาะคุณ ฟรี ทันทีที่ทำเสร็จ",
    promises: ["ประมาณ 5 นาที", "ไม่จำเป็นต้องซื้อ", "ไม่ผูกมัดให้ซื้อประจำ"],
    trust: ["ก่อตั้งโดยแพทย์", "ผลิตภัณฑ์มีเลข อย. ทุกชิ้น"]
  }
} as const;

async function choose(page: Page, locale: string, key: string, value: string) {
  const turn = copy(locale).turns.find(turn => turn.k === key)!;
  const label = turn.opts?.find(option => option.v === value)?.l;
  expect(label, `Choice ${key}=${value} exists in the supplied questionnaire`).toBeTruthy();
  await page.locator(`[data-question="${key}"]`).getByRole("button", { name: label!, exact: true }).click();
}
async function advance(page: Page, screen: string) {
  await page.getByTestId("questionnaire-next").click();
  await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible();
}

for (const [locale, pharmacy] of [["en", false], ["th", true], ["zh-CN", true]] as const) {
  test(`QUIZ-MOTION ${locale} grouped answers remain stable across back, reload and resume`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const session = randomUUID();
    const path = pharmacy ? `/retail/${slug}/quiz` : "/nutrition/quiz";
    await page.goto(`/${locale}${path}?session=${session}&source=business_card`);
    if (!pharmacy) await page.getByTestId("questionnaire-welcome-cta").click();
    await page.locator('[data-question="firstName"]').getByRole("textbox").fill("Maya");
    await advance(page, "goals");
    await choose(page, locale, "goals", "energy");
    await choose(page, locale, "goals", "sleep");
    await advance(page, "symptoms");
    await choose(page, locale, "symptoms", "great");
    await advance(page, "basics");
    await expect(page.locator('[data-question="age"]')).toBeVisible();
    await expect(page.locator('[data-question="sex"]')).toBeVisible();
    await expect(page.getByTestId("questionnaire-next")).toBeDisabled();
    await choose(page, locale, "age", "36-45");
    await expect(page.getByTestId("questionnaire-next")).toBeDisabled();
    await choose(page, locale, "sex", "female");
    await advance(page, "repro");
    await expect(page.locator('[data-question="reproStatus"]')).toBeVisible();
    await page.getByTestId("questionnaire-back").click();
    await expect(page.locator('[data-screen="basics"]')).toBeVisible();
    const age = copy(locale).turns.find(turn => turn.k === "age")!.opts!.find(option => option.v === "36-45")!.l;
    await expect(page.locator('[data-question="age"]').getByRole("button", { name: age, exact: true })).toHaveAttribute("aria-pressed", "true");
    await choose(page, locale, "sex", "male");
    await advance(page, "sleep");
    await expect(page.locator('[data-question="sleepHrs"]')).toBeVisible();
    await expect(page.locator('[data-question="energy"]')).toBeVisible();
    await choose(page, locale, "sleepHrs", "7-8");
    await expect(page.getByTestId("questionnaire-next")).toBeDisabled();
    await page.reload();
    await page.getByTestId("questionnaire-resume").click();
    await expect(page.locator('[data-screen="sleep"]')).toBeVisible();
    const sleep = copy(locale).turns.find(turn => turn.k === "sleepHrs")!.opts!.find(option => option.v === "7-8")!.l;
    await expect(page.locator('[data-question="sleepHrs"]').getByRole("button", { name: sleep, exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(new URL(page.url()).searchParams.get("session")).toBe(session);
    await choose(page, locale, "energy", "good");
    await advance(page, "move");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: test.info().outputPath(`grouped-${locale}.png`), fullPage: true });
  });
}

for (const locale of ["en", "th", "zh-CN"] as const) {
  test(`QUIZ-WELCOME ${locale} uses the platform shell and waits for an explicit start`, async ({ page }) => {
    await page.goto(`/${locale}/nutrition/quiz`);
    const welcome = page.getByTestId("questionnaire-welcome");
    await expect(welcome).toBeVisible();
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
    await expect(page.getByRole("banner").locator(".mn-availability-bar")).toHaveCount(0);
    await expect(page.getByRole("contentinfo").locator(`a[href="/${locale}/privacy"]`)).toBeVisible();
    await expect(welcome).not.toContainText("690");
    if (locale !== "zh-CN") {
      const content = landingCopy[locale];
      await expect(welcome.getByRole("heading", { level: 1 })).toHaveText(content.headline);
      await expect(page.getByTestId("questionnaire-welcome-cta")).toHaveAccessibleName(content.cta);
      for (const text of [content.lede, ...content.promises, ...content.trust]) {
        await expect(welcome).toContainText(text);
      }
    }
    await expect(page.locator('[data-question="firstName"]')).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(`/${locale}/nutrition/quiz`);
    const session = new URL(page.url()).searchParams.get("session");
    expect(session).toBeTruthy();
    await page.reload();
    await expect(welcome).toBeVisible();
    await expect(page.getByTestId("questionnaire-resume")).toHaveCount(0);
    await page.getByTestId("questionnaire-welcome-cta").click();
    await expect(page.locator('[data-question="firstName"]')).toBeVisible();
    await expect(welcome).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("session")).toBe(session);
  });
}

for (const locale of ["en", "th"] as const) {
  test(`QUIZ-WELCOME ${locale} fits small phones and desktop with reduced motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Public visitors do not receive the development shortcut below the invitation.
    await page.setExtraHTTPHeaders({ "x-forwarded-host": "mattanutra.com" });
    await page.setViewportSize({ width: 375, height: 560 });
    await page.goto(`/${locale}/nutrition/quiz?session=${randomUUID()}`);
    const welcome = page.getByTestId("questionnaire-welcome");
    await expect(welcome).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    for (const viewport of [{ width: 375, height: 560 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.scrollTo(0, 0));
      const header = await page.getByRole("banner").boundingBox();
      const hero = await welcome.boundingBox();
      const cta = await page.getByTestId("questionnaire-welcome-cta").boundingBox();
      const footer = await page.getByRole("contentinfo").boundingBox();
      expect(header).not.toBeNull();
      expect(hero).not.toBeNull();
      expect(cta).not.toBeNull();
      expect(footer).not.toBeNull();
      expect(hero!.y, "Welcome begins below the platform header").toBeGreaterThanOrEqual(header!.y + header!.height - 1);
      expect(hero!.y + hero!.height, "The landing content fits above the fold").toBeLessThanOrEqual(viewport.height + 1);
      expect(cta!.height, "The primary action remains a comfortable touch target").toBeGreaterThanOrEqual(44);
      expect(cta!.y + cta!.height).toBeLessThanOrEqual(viewport.height);
      expect(footer!.y, "The shared footer follows the landing content").toBeGreaterThanOrEqual(hero!.y + hero!.height - 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
      expect(await welcome.evaluate(node => node.getAnimations({ subtree: true }).filter(animation => animation.playState === "running").length)).toBe(0);
      await page.screenshot({ path: test.info().outputPath(`welcome-${locale}-${viewport.width}x${viewport.height}.png`) });
    }
  });
}

test("QUIZ-WELCOME header and footer language switches preserve the quiz journey", async ({ page }) => {
  const session = randomUUID();
  const journey = { session, source: "business_card", selectedPlan: "foundation" };
  await page.goto(`/en/nutrition/quiz?${new URLSearchParams(journey)}`);
  await expect(page.getByTestId("questionnaire-welcome")).toBeVisible();

  for (const [landmark, label, locale] of [["banner", "ไทย", "th"], ["contentinfo", "EN", "en"]] as const) {
    const link = page.getByRole(landmark).getByRole("link", { name: label, exact: true });
    const target = new URL((await link.getAttribute("href"))!, page.url());
    expect(target.pathname).toBe(`/${locale}/nutrition/quiz`);
    for (const [key, value] of Object.entries(journey)) expect(target.searchParams.get(key)).toBe(value);
    await link.click();
    await expect(page.getByTestId("questionnaire-welcome")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`/${locale}/nutrition/quiz`);
    for (const [key, value] of Object.entries(journey)) expect(new URL(page.url()).searchParams.get(key)).toBe(value);
    await expect(page.locator('[data-question="firstName"]')).toHaveCount(0);
  }

  await page.getByTestId("questionnaire-welcome-cta").click();
  await page.locator('[data-question="firstName"]').getByRole("textbox").fill("Maya");
  await advance(page, "goals");
  await page.reload();
  await page.getByTestId("questionnaire-resume").click();
  await expect(page.locator('[data-question="goals"]')).toBeVisible();
  await page.getByRole("contentinfo").getByRole("link", { name: "ไทย", exact: true }).click();
  await page.getByTestId("questionnaire-resume").click();
  await expect(page.locator('[data-question="goals"]')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/th/nutrition/quiz");
  await page.getByTestId("questionnaire-back").click();
  await expect(page.locator('[data-question="firstName"]').getByRole("textbox")).toHaveValue("Maya");
  for (const [key, value] of Object.entries(journey)) expect(new URL(page.url()).searchParams.get(key)).toBe(value);
});

test("QUIZ-RESUME an unfinished previous questionnaire keeps its answers in the grouped flow", async ({ page }) => {
  const session = randomUUID();
  let state = startQuestionnaire(createInitialState({ locale: "en", channel: "web", sessionId: session })).state;
  for (const [key, answer] of [["firstName", "Saved visitor"], ["goals", ["energy", "sleep"]]] as const) {
    const result = applyAnswer(state, key, answer);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Invalid previous-version fixture");
    state = result.state;
  }
  expect(state.version).toBe("v6-conversational");
  await page.addInitScript(saved => {
    localStorage.setItem(`mn-questionnaire:v1:${saved.sessionId}`, JSON.stringify({ version: 1, state: saved,
      revision: 0, captured: null, contactEmail: null, paymentId: null, updatedAt: Date.now() }));
  }, state);
  await page.goto(`/en/nutrition/quiz?session=${session}`);
  await page.getByTestId("questionnaire-resume").click();
  await expect(page.locator('[data-screen="symptoms"]')).toBeVisible();
  await page.getByTestId("questionnaire-back").click();
  await expect(page.locator('[data-question="goals"] button[data-value="energy"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-question="goals"] button[data-value="sleep"]')).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("questionnaire-back").click();
  await expect(page.locator('[data-question="firstName"]').getByRole("textbox")).toHaveValue("Saved visitor");
  const migrated = await page.evaluate(id => JSON.parse(localStorage.getItem(`mn-questionnaire:v1:${id}`)!), session);
  expect(migrated.state.version).toBe("v15.5-screens");
  expect(migrated.state.sessionId).toBe(session);
});
