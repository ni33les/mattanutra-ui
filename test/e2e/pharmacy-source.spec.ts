import { expect, test } from "../helpers/offline-browser";
import { pharmacyCopy } from "../../lib/pharmacy-copy";
for (const locale of ["en", "th", "zh-CN"] as const) for (const source of ["in_store", "business_card"]) {
  test(`PHARM-SOURCE ${locale} ${source} QR keeps source through entry and reload`, async ({ page }) => {
    const events: Array<{eventName: string; ray: string; attribution: {sourceDetail: string; sourceChannel: string}}> = [];
    await page.route("**/api/bpm", async route => { events.push(route.request().postDataJSON()); await route.fulfill({json:{ok:true}}); });
    await page.goto(`/${locale}/retail/delight?source=${source}`);
    await expect(page.getByTestId("pharmacy-landing")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("source")).toBe(source);
    await page.getByRole("link", {name:`${pharmacyCopy[locale].start} →`,exact:true}).click();
    await expect(page.getByTestId("question-answers").getByRole("textbox")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("source")).toBe(source);
    const session = new URL(page.url()).searchParams.get("session"); expect(session).toBeTruthy();
    await page.reload();
    await expect(page.getByTestId("question-answers").getByRole("textbox")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("session")).toBe(session);
    await expect.poll(()=>events.some(event=>event.eventName==="assessment_viewed" && event.ray===session && event.attribution.sourceDetail===source)).toBe(true);
    expect(events.filter(event=>event.attribution.sourceChannel==="delight-pharmacy").every(event=>event.attribution.sourceDetail===source)).toBe(true);
  });
}
