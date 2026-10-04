import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
test.beforeEach(async ({ baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
});

async function openCheckout(page: Page, mode: "ready" | "reject" | "stall" | "script", locale = "en") {
  const attempt = randomUUID(), paymentId = randomUUID();
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(({ mode }) => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("Clipboard denied"); } }, configurable: true });
    if (mode === "script" && !sessionStorage.getItem("retried")) {
      sessionStorage.setItem("retried", "true");
      return;
    }
    Object.defineProperty(window, "Stripe", { value: () => ({
      elements() {}, createToken() {}, createPaymentMethod() {}, confirmCardPayment() {},
      createEmbeddedCheckoutPage: async () => {
        if (mode === "reject") throw new Error("Provider initialization failed");
        if (mode === "stall") await new Promise(() => undefined);
        return { mount(element: HTMLElement) { element.innerHTML = '<label>Card number<input name="cardNumber" /></label>'; }, destroy() {} };
      }
    }) });
  }, { mode });
  await page.route("**/*", route => {
    const request = route.request(), url = new URL(request.url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    if (url.pathname === "/api/payments/checkout-session") {
      requests.push(request.headers()["idempotency-key"]);
      return route.fulfill({ json: { paymentId, clientSecret: "cs_test_fixture_secret_local", mock: false } });
    }
    if (url.pathname === `/api/payments/${paymentId}`) return route.fulfill({ json: { id: paymentId, status: "checkout_opened" } });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { ok: true } });
    return route.continue();
  });
  await page.clock.install();
  await page.goto(`/${locale}/nutrition/payment/checkout?plan=precision&source=healthscore&attempt=${attempt}`);
  await expect.poll(() => requests.length).toBe(1);
  return { attempt, requests, errors };
}

for (const locale of ["en", "th", "zh-CN"]) {
  test(`${locale}: ready form replaces loading and precedes collapsed payment help`, async ({ page }) => {
    const { errors } = await openCheckout(page, "ready", locale);
    await expect(page.getByRole("textbox", { name: "Card number" })).toBeVisible();
    const help = page.getByTestId("payment-recovery");
    await expect(help).not.toHaveAttribute("open");
    expect(await page.getByTestId("stripe-checkout").evaluate(element => Boolean(element.nextElementSibling?.matches("details")))).toBe(true);
    await expect(page.getByText(/Loading secure checkout|กำลังโหลดหน้าชำระเงิน|正在加载安全结账/)).toHaveCount(0);
    await page.clock.fastForward(120_001);
    await expect(help).not.toHaveAttribute("open");
    await expect(help.getByRole("button").first()).not.toBeVisible();
    expect(errors).toEqual([]);
  });
}

for (const mode of ["reject", "stall"] as const) {
  test(`${mode}: actual form initialization failure ends loading and offers browser recovery`, async ({ page }) => {
    const { attempt, errors } = await openCheckout(page, mode);
    if (mode === "stall") {
      await expect(page.getByTestId("stripe-checkout")).toHaveCount(1);
      await page.clock.fastForward(20_001);
    }
    await expect(page.getByText("The secure payment form could not load.", { exact: false })).toBeVisible();
    await expect(page.getByText("Loading secure checkout...", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Copy recovery link", exact: true }).click();
    const link = new URL(await page.getByRole("textbox", { name: "Copy recovery link" }).inputValue());
    expect(link.searchParams.get("attempt")).toBe(attempt);
    expect(link.href).not.toContain("secret");
    expect(errors).toEqual([]);
  });
}

test("retry reloads a failed Stripe script and reuses the same payment attempt", async ({ page }) => {
  const { attempt, requests, errors } = await openCheckout(page, "script");
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Card number" })).toBeVisible();
  expect(requests).toEqual([attempt, attempt]);
  expect(errors).toEqual([]);
});
