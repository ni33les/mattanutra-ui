import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

// Exercise the actual checkout UI with provider and payment-status fixtures.
// Stripe never redirects: checkout itself must recover from the app handoff.
type FixtureWindow = Window & { completeCheckout: () => void; setCheckoutHidden: (hidden: boolean) => void };

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
test.beforeEach(async ({ baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
});

async function checkout(page: Page, locale = "en") {
  const paymentId = randomUUID(), planId = randomUUID(), attempt = randomUUID();
  const sessionId = `cs_test_recovery_${paymentId}`;
  const state = { status: "checkout_opened", reads: 0, unavailable: false, cancelStatus: "cancelled", cancelFails: false, hold: null as Promise<void> | null };
  await page.addInitScript(() => {
    const target = window as unknown as FixtureWindow;
    let hidden = false;
    Object.defineProperty(document, "hidden", { get: () => hidden, configurable: true });
    target.setCheckoutHidden = value => { hidden = value; document.dispatchEvent(new Event("visibilitychange")); };
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("Clipboard denied"); } }, configurable: true });
    Object.defineProperty(window, "Stripe", { value: () => ({
      elements() {}, createToken() {}, createPaymentMethod() {}, confirmCardPayment() {},
      createEmbeddedCheckoutPage: async (options: { onComplete: () => void }) => {
        target.completeCheckout = options.onComplete;
        return { mount(element: HTMLElement) { element.innerHTML = '<div data-testid="provider-fixture">Payment provider fixture</div>'; }, unmount() {}, destroy() {} };
      }
    }) });
  });
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === "facebook.com") return route.fulfill({ contentType: "text/html", body: "<h1>Simulated Facebook entry</h1>" });
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    if (url.pathname === "/api/payments/checkout-session") return route.fulfill({ json: { paymentId, clientSecret: "cs_test_fixture_secret_local", mock: false } });
    if (url.pathname === `/api/payments/${paymentId}`) {
      if (request.method() === "GET") state.reads++;
      if (request.method() === "GET" && state.hold) await state.hold;
      if (request.method() === "GET" && state.unavailable) return route.fulfill({ status: 503, json: { message: "Temporarily unavailable" } });
      if (request.method() === "DELETE" && state.cancelFails) return route.fulfill({ status: 503, json: { message: "Cannot cancel" } });
      return route.fulfill({ json: { id: paymentId, planId, stripeCheckoutSessionId: sessionId, status: request.method() === "DELETE" ? state.cancelStatus : state.status } });
    }
    if (/\/nutrition\/(payment\/return|healthscore|progress)$/.test(url.pathname)) return route.fulfill({ contentType: "text/html", body: "<h1>Recovered destination</h1>" });
    if (/^\/api\/(bpm|marketing|meta)(\/|$)/.test(url.pathname)) return route.fulfill({ json: { ok: true } });
    return route.continue();
  });
  await page.clock.install();
  await page.goto("https://facebook.com/");
  const path = `/${locale}/nutrition/payment/checkout?plan=precision&source=healthscore&planId=${planId}&attempt=${attempt}`;
  await page.goto(path);
  await expect(page.getByTestId("provider-fixture")).toBeVisible();
  const panel = page.getByTestId("payment-recovery");
  await panel.locator("summary").click();
  await expect(panel.getByRole("button").first()).toBeEnabled();
  await expect.poll(() => state.reads).toBeGreaterThan(0);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  return { state, panel, path, paymentId, planId, sessionId, attempt, locale };
}

for (const locale of ["en", "th", "zh-CN"]) {
  test(`${locale}: completion without provider redirect opens only a server-confirmed payment`, async ({ page }) => {
    const fixture = await checkout(page, locale), before = fixture.state.reads;
    await page.evaluate(() => (window as unknown as FixtureWindow).completeCheckout());
    await expect(page.getByTestId("funnel-loading")).toBeVisible();
    await expect.poll(() => fixture.state.reads).toBeGreaterThan(before);
    await expect(fixture.panel.getByRole("button").first()).toBeEnabled();
    expect(new URL(page.url()).pathname).toContain("/checkout");
    fixture.state.status = "paid";
    await page.evaluate(() => (window as unknown as FixtureWindow).completeCheckout());
    await expect(page).toHaveURL(new RegExp(`/${locale}/nutrition/payment/return\\?session_id=${fixture.sessionId}$`));
  });
}

test("returning from a banking app recovers without a completion callback", async ({ page }) => {
  const fixture = await checkout(page, "th"), before = fixture.state.reads;
  await page.evaluate(() => (window as unknown as FixtureWindow).setCheckoutHidden(true));
  fixture.state.status = "paid";
  await page.clock.runFor(15_000);
  expect(fixture.state.reads).toBe(before);
  await expect(page).toHaveURL(/\/checkout\?/);
  await page.evaluate(() => (window as unknown as FixtureWindow).setCheckoutHidden(false));
  await expect(page).toHaveURL(new RegExp(`/th/nutrition/payment/return\\?session_id=${fixture.sessionId}$`));
});

test("automatic polling recovers even when neither redirect nor completion callback arrives", async ({ page }) => {
  const fixture = await checkout(page);
  fixture.state.status = "paid";
  await page.clock.runFor(3001);
  await expect(page).toHaveURL(/\/payment\/return\?session_id=/);
});

test("automatic checks stop after two minutes and can be restarted manually", async ({ page }) => {
  const fixture = await checkout(page);
  await page.clock.fastForward(120_001);
  await expect(fixture.panel).toContainText("Automatic checks have paused");
  const before = fixture.state.reads;
  await page.clock.runFor(30_000);
  expect(fixture.state.reads).toBe(before);
  fixture.state.status = "paid";
  await fixture.panel.getByRole("button").first().click();
  await expect(page).toHaveURL(/\/payment\/return\?session_id=/);
});

test("in-flight checks are shared and a hidden page waits before navigating", async ({ page }) => {
  const fixture = await checkout(page), before = fixture.state.reads;
  let release: () => void = () => undefined;
  fixture.state.hold = new Promise<void>(resolve => { release = resolve; });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => fixture.state.reads).toBe(before + 1);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("pageshow"));
    (window as unknown as FixtureWindow).completeCheckout();
    (window as unknown as FixtureWindow).setCheckoutHidden(true);
  });
  fixture.state.status = "paid";
  release();
  await expect(fixture.panel.getByRole("button").first()).toBeEnabled();
  expect(fixture.state.reads).toBe(before + 1);
  await expect(page).toHaveURL(/\/checkout\?/);
  await page.evaluate(() => (window as unknown as FixtureWindow).setCheckoutHidden(false));
  await expect(page).toHaveURL(/\/payment\/return\?session_id=/);
});

for (const event of ["focus", "pageshow"]) {
  test(`${event} restores payment status after an interrupted handoff`, async ({ page }) => {
    const fixture = await checkout(page);
    fixture.state.status = "paid";
    await page.evaluate(name => window.dispatchEvent(new Event(name)), event);
    await expect(page).toHaveURL(/\/payment\/return\?session_id=/);
  });
}

test("cancel after payment opens the paid plan instead of returning to Facebook history", async ({ page }) => {
  const fixture = await checkout(page);
  fixture.state.cancelStatus = "paid";
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/payment\/return\?session_id=/);
});

test("unpaid cancellation returns explicitly to the healthscore", async ({ page }) => {
  const fixture = await checkout(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/en/nutrition/healthscore\\?plan=${fixture.planId}$`));
});

for (const failure of ["processing", "unavailable"]) {
  test(`cancel ${failure} keeps the user on checkout`, async ({ page }) => {
    const fixture = await checkout(page);
    fixture.state.cancelStatus = "processing";
    fixture.state.cancelFails = failure === "unavailable";
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText(failure === "unavailable"
      ? "We could not cancel this checkout. Check your payment status before trying again."
      : "Payment may still be processing. Check its status before trying again.")).toBeVisible();
    await expect(page).toHaveURL(/\/checkout\?/);
  });
}

test("failed status checks can be retried without starting another checkout", async ({ page }) => {
  const fixture = await checkout(page);
  fixture.state.unavailable = true;
  await fixture.panel.getByRole("button").first().click();
  await expect(fixture.panel).toContainText("We could not check your payment yet");
  fixture.state.unavailable = false;
  fixture.state.status = "paid";
  await fixture.panel.getByRole("button").first().click();
  await expect(page).toHaveURL(/\/payment\/return\?session_id=/);
});

test("blocked clipboard provides a durable link without the provider client secret", async ({ page }) => {
  const fixture = await checkout(page, "th");
  await fixture.panel.getByRole("button").nth(1).click();
  const value = await fixture.panel.getByRole("textbox").inputValue(), url = new URL(value);
  expect(url.pathname).toBe("/th/nutrition/payment/checkout");
  expect(url.searchParams.get("attempt")).toBe(fixture.attempt);
  expect(url.searchParams.get("planId")).toBe(fixture.planId);
  expect(url.searchParams.get("source")).toBe("healthscore");
  expect(value).not.toContain("secret");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
