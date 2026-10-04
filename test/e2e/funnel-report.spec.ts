import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const execute=promisify(execFile);
test.setTimeout(120_000);
async function runApp<T>(script:string):Promise<T>{
  const {stdout}=await execute(process.execPath,["--experimental-strip-types","--import","./scripts/register-ts-path-loader.mjs","--import","./test/helpers/offline-network.mjs","--input-type=module","-e",script],{env:process.env,maxBuffer:1024*1024});
  return JSON.parse(stdout.split("\n").find(line=>line.startsWith("REPORT_FIXTURE:"))!.slice(15));
}
async function fixture(input:Record<string,unknown>){
  const {stdout}=await execute(process.execPath,["--experimental-strip-types","--import","./scripts/register-ts-path-loader.mjs","--import","./test/helpers/offline-network.mjs","test/helpers/web-funnel-fixture.ts",JSON.stringify(input)],{env:process.env,maxBuffer:1024*1024});
  return JSON.parse(stdout.split("\n").find(line=>line.startsWith("FIXTURE:"))!.slice(8));
}
test.beforeEach(async({baseURL,context})=>{
  expect(new URL(baseURL!).hostname).toBe("127.0.0.1");
  expect(new URL(process.env.TEST_DB_URL!).hostname).toBe("127.0.0.1");
  await context.route("**/*",route=>["localhost","127.0.0.1"].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
});

for(const locale of ["en","th","zh-CN"]){
  test(`${locale}: Web, Retail and MCP share coloured tables on desktop and mobile`,async({baseURL,context,page})=>{
    const session=await runApp<{sessionCookie:string;csrfToken:string;sessionId:string}>(`
      import {createAdminBrowserSession} from './test/helpers/admin-browser-fixture.ts';
      import {getSql,closeSqlPool} from './lib/db.ts';
      import {randomUUID} from 'node:crypto';
      try {
        const session=await createAdminBrowserSession(process.env.ADMIN_E2E_TARGET_ORGANISATION_ID),sql=getSql();
        const ray=randomUUID();
        await sql\`insert into public.bpm(id,ray,event_name,event_type,event_status,locale,traffic_source,source_channel,source_detail,occurred_at)
          values(\${randomUUID()}::uuid,\${ray}::uuid,'pharmacy_landing_viewed','funnel','observed','${locale}','pharmacy','report-fixture','in_store',now())\`;
        await sql\`insert into public.agentic_funnel_events(event_id,correlation_id,event_type,attribution,payload,sequence,created_at)
          values(\${'report-fixture:'+randomUUID()},\${'report-fixture:'+randomUUID()},'connected','qa_campaign',\${sql.json({locale:'${locale}'})},1,now())\`;
        console.log('REPORT_FIXTURE:'+JSON.stringify(session));
      }finally{await closeSqlPool();}
    `);
    try{
      await context.addCookies([{name:"mn_admin_session",url:baseURL,value:session.sessionCookie},{name:"mn_admin_csrf",url:baseURL,value:session.csrfToken}]);
      await page.goto(`/${locale}/admin/dashboard?view=flow&range=month`);
      for(const name of ["Web","Retail","MCP"])await expect(page.getByRole("heading",{name,exact:true})).toBeVisible();
      for(const width of [1280,390]){
        await page.setViewportSize({width,height:900});
        const tables=page.getByTestId("funnel-stage-table");
        expect(await tables.count()).toBeGreaterThanOrEqual(3);
        const colours=await tables.evaluateAll(nodes=>nodes.map(table=>getComputedStyle(table.querySelector('tbody th')!).borderLeftColor));
        expect(colours.every(colour=>colour!=="rgba(0, 0, 0, 0)")).toBe(true);
        expect(await page.locator("body").innerText()).not.toMatch(/NaN|Infinity/);
        await expect(page.getByTestId("pharmacy-source-funnel").getByRole("combobox").first()).toBeEnabled();
      }
    }finally{
      await runApp(`import {getSql,closeSqlPool} from './lib/db.ts';try{await getSql()\`update public.admin_sessions set revoked_at=now() where id=\${'${session.sessionId}'}::uuid\`;console.log('REPORT_FIXTURE:{}');}finally{await closeSqlPool();}`);
    }
  });

  test(`${locale}: visible HealthScore records a display separately from page arrival`,async({page})=>{
    const {planId}=await fixture({action:"capture",locale});
    await fixture({action:"copy",locale,planId});
    const seen:Array<{eventName:string;planId?:string;properties?:{journeyChannel?:string}}>=[];
    page.on("request",request=>{if(new URL(request.url()).pathname==="/api/bpm")seen.push(request.postDataJSON());});
    await page.goto(`/${locale}/nutrition/healthscore?plan=${planId}`);
    await expect(page.locator(".mn-healthscore-v7")).toBeVisible();
    await expect.poll(()=>seen.filter(event=>event.eventName==="healthscore_viewed").length).toBe(1);
    const display=seen.find(event=>event.eventName==="healthscore_viewed")!;
    expect(display.planId).toBe(planId);expect(display.properties?.journeyChannel).toBe("web");
    await expect.poll(()=>seen.some(event=>event.eventName==="healthscore_page_viewed")).toBe(true);
  });
}
