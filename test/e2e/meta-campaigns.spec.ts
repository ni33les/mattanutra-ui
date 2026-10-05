import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";
import { metaCampaignCopy } from "../../lib/meta-campaign-copy";
import { metaAdUrlParameters } from "../../lib/meta-attribution";
import type { AdminBrowserSession } from "../helpers/admin-browser-fixture";

const execute = promisify(execFile);
test.use({ actionTimeout: 10_000 });
async function runApp<T>(script: string, fixture?: unknown): Promise<T> {
  const { stdout } = await execute(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "--import", "./test/helpers/offline-network.mjs", "--input-type=module", "-e", script],
    { env: { ...process.env, META_CAMPAIGN_FIXTURE: JSON.stringify(fixture) }, maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout.split("\n").find(line=>line.startsWith("META_FIXTURE:"))!.slice(13));
}

test("campaign tables separate sales from delivery, filter all flows, and work in three languages on mobile", async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  expect(new URL(baseURL!).hostname).toBe("127.0.0.1");
  expect(new URL(process.env.TEST_DB_URL!).hostname).toBe("127.0.0.1");
  await context.route("**/*", route=>["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const fixture = await runApp<{ session: AdminBrowserSession; ids: string[] }>(`
    import { createAdminBrowserSession } from './test/helpers/admin-browser-fixture.ts';
    import { getSql,closeSqlPool } from './lib/db.ts';
    import { randomUUID } from 'node:crypto';
    import { metaConfig } from './lib/meta-config.ts';
    try {
      const session=await createAdminBrowserSession(), sql=getSql(), ids=[];
      for (const [channel,locale,index] of [['web','en',0],['retail','th',1],['mcp','zh-CN',2]]) {
        const id=randomUUID(); ids.push(id);
        await sql\`insert into public.meta_tracking_contexts(id,environment,consent_granted) values(\${id}::uuid,'dev',true)\`;
        for(const name of ['PageView','Purchase']) {
          const eventId=randomUUID();
          const data={campaign_id:'900001',adset_id:'900002',ad_id:'900003',channel,locale,...(name==='Purchase'?{purchase_type:index?'products':'plan',offer:index?'unknown':'precision',value:690,currency:'THB'}:{})};
          await sql\`insert into public.meta_conversion_events(id,environment,pixel_id,event_name,source_key,context_id,custom_data,status)
            values(\${eventId}::uuid,'dev',\${metaConfig().pixelId},\${name},\${eventId},\${id}::uuid,\${sql.json(data)},\${index===2?'retrying':'accepted'})\`;
        }
      }
      console.log('META_FIXTURE:'+JSON.stringify({session,ids}));
    } finally {await closeSqlPool();}
  `);
  try {
    await context.addCookies([{ name: "mn_admin_session", value: fixture.session.sessionCookie, url: baseURL! }, { name: "mn_admin_csrf", value: fixture.session.csrfToken, url: baseURL! }]);
    for (const locale of ["en", "th", "zh-CN"] as const) {
      const t = metaCampaignCopy[locale];
      await page.goto(`/${locale}/admin/dashboard?view=campaigns&range=month`);
      const panel = page.getByRole("region", { name: t.title });
      await expect(panel).toBeVisible();
      await panel.getByLabel(t.search).fill("900001");
      const sales = panel.getByRole("table", { name: t.sales, exact: true });
      await expect(sales.locator("tbody tr")).toHaveCount(3);
      await expect(panel.getByText(t.ads, { exact: true })).toBeVisible();
      for (const width of [1280,390]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(panel.getByRole("table", { name: t.activity })).toBeVisible();
        expect(await panel.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
        expect(await panel.innerText()).not.toMatch(/NaN|Infinity/);
      }
      await panel.getByRole("combobox", { name: t.flow, exact: true }).selectOption("mcp");
      await expect(sales.locator("tbody tr")).toHaveCount(1);
      await expect(sales.locator("tbody")).toContainText("MCP");
      await panel.getByRole("combobox", { name: t.language, exact: true }).selectOption("en");
      await expect(sales.locator("tbody")).toHaveText(t.empty);
      await panel.getByRole("combobox", { name: t.language, exact: true }).selectOption("");
      await panel.getByRole("combobox", { name: t.flow, exact: true }).selectOption("");
      await panel.locator("summary").filter({hasText:t.setup}).click();
      await expect(panel.getByLabel(t.parameters)).toHaveValue(metaAdUrlParameters);
      await page.evaluate(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:()=>Promise.reject(new Error("blocked"))}}));
      const copy = panel.getByRole("button", { name: t.copy, exact: true });
      await copy.focus(); await page.keyboard.press("Enter");
      await expect(panel.getByRole("status")).toHaveText(t.copyFailed);
      await page.evaluate(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async(text:string)=>{(window as unknown as {copied:string}).copied=text;}}}));
      await copy.click(); await expect(panel.getByRole("status")).toHaveText(t.copied);
      expect(await page.evaluate(()=>(window as unknown as {copied:string}).copied)).toBe(metaAdUrlParameters);
    }
  } finally {
    await runApp(`
      import {cleanupAdminBrowserSession} from './test/helpers/admin-browser-fixture.ts';
      import {getSql,closeSqlPool} from './lib/db.ts';
      const fixture=JSON.parse(process.env.META_CAMPAIGN_FIXTURE);
      try {await cleanupAdminBrowserSession(fixture.session);await getSql()\`delete from public.meta_tracking_contexts where id=any(\${fixture.ids}::uuid[])\`;console.log('META_FIXTURE:{}');}
      finally{await closeSqlPool();}
    `, fixture);
  }
});
