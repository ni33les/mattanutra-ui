import { expect, test } from "../helpers/offline-browser";

test("public entry pages retain customer-facing branding in both languages", async ({ page }) => {
  for (const path of ["/en", "/th", "/en/nutrition/quiz"]) {
    const response = await page.goto(path);
    expect(response?.ok()).toBe(true);
    const visible = await page.locator("body").innerText();
    expect(visible).not.toMatch(/\bPanya\b/i);
    expect(visible).toMatch(/MattaNutra|Nong Mata|มัตตา|น้องมาตา/i);
    await expect(page.locator("main")).toBeVisible();
  }
});
