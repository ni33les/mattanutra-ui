import { expect, test } from "../helpers/offline-browser";
import { pharmacyCopy } from "../../lib/pharmacy-copy";
for (const locale of ["en", "th", "zh-CN"] as const) for (const source of ["in_store", "business_card"]) {
  test(`PHARM-SOURCE ${locale} ${source} QR keeps source through entry and reload`, async ({ page }) => {
    const events: Array<{eventName: string; ray: string; attribution: {sourceDetail: string; sourceChannel: string}}> = [];
    await page.route("**/api/bpm", async route => { events.push(route.request().postDataJSON()); await route.fulfill({json:{ok:true}}); });
    await page.goto(`/${locale}/retail/matcher-v5-isolated-fixture-retailer?source=${source}`);
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
    expect(events.filter(event=>event.attribution.sourceChannel==="matcher-v5-isolated-fixture-retailer").every(event=>event.attribution.sourceDetail===source)).toBe(true);
  });
}

test("PHARM-SOURCE new entries isolate rays, preserve language and work with blocked browser storage", async ({page}) => {
  await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error("blocked");};Storage.prototype.setItem=()=>{throw new Error("blocked");};});
  await page.route("**/api/bpm",route=>route.fulfill({json:{ok:true}}));
  const slug="matcher-v5-isolated-fixture-retailer";
  await page.goto(`/en/retail/${slug}?source=business_card`);
  await expect(page.getByTestId("pharmacy-landing")).toBeVisible();
  const first=new URL(page.url());
  const ray=first.searchParams.get("session");expect(ray).toBeTruthy();
  await page.goto(page.url().replace("/en/retail/","/th/retail/"));
  await expect(page.locator("[data-pharmacy-source]")).toHaveAttribute("data-pharmacy-source","business_card");
  expect(new URL(page.url()).searchParams.get("session")).toBe(ray);
  await page.goto(`/en/retail/${slug}`);
  await expect(page.locator("[data-pharmacy-source]")).toHaveAttribute("data-pharmacy-source","in_store");
  expect(new URL(page.url()).searchParams.get("session")).not.toBe(ray);
  await page.goto(`/en/retail/${slug}?source=unrecognised`);
  await expect(page.locator("[data-pharmacy-source]")).toHaveAttribute("data-pharmacy-source","unknown");
});

test("PHARM-SOURCE chat capture sends the entry attribution without adding it to questionnaire answers", async ({page}) => {
  let captured: {bpm:{ray:string;attribution:{sourceDetail:string}};answers:Record<string,unknown>}|null=null;
  await page.route("**/api/bpm",route=>route.fulfill({json:{ok:true}}));
  await page.route("**/api/assessment",async route=>{captured=route.request().postDataJSON();await route.fulfill({status:503,json:{message:"Controlled capture barrier"}});});
  await page.goto("/en/retail/matcher-v5-isolated-fixture-retailer/quiz?source=business_card");
  await expect(page.getByTestId("question-answers").getByRole("textbox")).toBeVisible();
  const ray=new URL(page.url()).searchParams.get("session");
  await page.getByTestId("dev-fill-questionnaire").click();
  await expect.poll(()=>captured?.bpm?.attribution?.sourceDetail).toBe("business_card");
  expect(captured!.bpm.ray).toBe(ray);
  expect(captured!.answers.inStorePharmacy).toBeUndefined();
});
