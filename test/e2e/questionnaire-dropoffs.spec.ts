import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { questionnaireFunnelCopy } from "../../lib/questionnaire-funnel-copy.ts";
import { getQuestionnaireDefinition } from "../../lib/questionnaire/definition.ts";
const execute=promisify(execFile);
let fixture:{session:{sessionCookie:string;csrfToken:string};campaign:string};
test.beforeAll(async()=>{
  expect(new URL(process.env.TEST_DB_URL!).hostname).toBe("127.0.0.1");
  const {stdout}=await execute(process.execPath,["--experimental-strip-types","--import","./scripts/register-ts-path-loader.mjs","test/helpers/questionnaire-funnel-fixture.ts"],{env:process.env});
  fixture=JSON.parse(stdout.split("\n").find(line=>line.startsWith("QUESTIONNAIRE_FIXTURE:"))!.slice("QUESTIONNAIRE_FIXTURE:".length));
});
test.beforeEach(async({baseURL,context})=>{
  expect(new URL(baseURL!).hostname).toBe("127.0.0.1");
  await context.route("**/*",route=>["127.0.0.1","localhost"].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
});
for(const locale of ["en","th","zh-CN"] as const) test(`${locale}: funnel breakdown, paging, search and lead details on desktop and mobile`,async({page,context,baseURL})=>{
  await context.addCookies([{name:"mn_admin_session",url:baseURL,value:fixture.session.sessionCookie},{name:"mn_admin_csrf",url:baseURL,value:fixture.session.csrfToken}]);
  await page.goto(`/${locale}/admin/dashboard?view=flow&range=all&campaign=${fixture.campaign}`);
  const c=questionnaireFunnelCopy[locale],web=page.getByTestId("questionnaire-funnel").first();
  await expect(page.getByTestId("questionnaire-funnel")).toHaveCount(2);
  await expect(web.getByRole("heading",{name:c.title})).toBeVisible();
  await web.locator("summary").click();
  await expect(web.getByRole("rowheader").filter({hasText:getQuestionnaireDefinition(locale).turns[0].q})).toBeVisible();
  for(const width of [1280,390]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
    const panels=page.getByRole("heading",{name:"Web",exact:true}).locator("..").locator("..");
    await expect(panels).toBeVisible();
  }
  await web.getByRole("button",{name:/1,005|1.005/}).first().click();
  const dialog=page.getByRole("dialog");
  await expect(dialog.getByText(`1,005 ${c.matches}`,{exact:true})).toBeVisible();
  await dialog.getByRole("button",{name:c.last,exact:true}).click();
  await expect(dialog.locator("tbody tr")).toHaveCount(5);
  await dialog.getByRole("searchbox").fill("FRaGmENT@EXamPLE");
  await expect(dialog.locator("tbody tr")).toHaveCount(1);
  await dialog.getByRole("button",{name:`${c.details}: browser.fragment@example.test`}).click();
  await expect(page.getByRole("heading",{name:"browser.fragment@example.test",exact:true})).toBeVisible();
  await expect(page.getByRole("dialog").getByText(getQuestionnaireDefinition(locale).turns[0].q,{exact:true}).first()).toBeVisible();
});

for(const pharmacy of [false,true]) test(`${pharmacy ? "pharmacy" : "web"}: views follow visible questions and resume preserves the attempt`,async({page})=>{
  const seen:Array<{eventName:string;properties:Record<string,unknown>}>=[];
  page.on("request",request=>{if(new URL(request.url()).pathname==="/api/bpm")seen.push(request.postDataJSON());});
  const session=randomUUID();
  const path=pharmacy ? `/en/retail/questionnaire-fixture-shop/quiz?session=${session}&source=business_card` : `/en/nutrition/quiz?session=${session}`;
  await page.goto(path);
  if(!pharmacy) {
    await expect(page.getByTestId("questionnaire-welcome")).toBeVisible();
    expect(seen.some(e=>e.eventName==="chat_question_viewed")).toBe(false);
    await page.getByTestId("questionnaire-welcome-cta").click();
  }
  await expect.poll(()=>seen.filter(e=>e.eventName==="chat_question_viewed").length).toBe(1);
  const first=seen.find(e=>e.eventName==="chat_question_viewed")!;
  expect(first.properties.turnKey).toBe("firstName");
  expect(first.properties.journeyChannel).toBe(pharmacy ? "retail" : "web");
  await page.getByTestId("question-answers").getByRole("textbox").fill("Fixture");
  await page.getByTestId("question-answers").getByRole("button",{name:"Confirm",exact:true}).click();
  await expect.poll(()=>seen.filter(e=>e.eventName==="chat_question_viewed").length).toBe(2);
  const answer=seen.find(e=>e.eventName==="chat_answer")!;
  expect(answer.properties.displayId).toBe(first.properties.displayId);
  expect(answer.properties).not.toHaveProperty("value");
  expect(seen.filter(e=>e.eventName==="chat_question_viewed")[1].properties.turnKey).toBe("goals");
  await page.reload();
  await page.getByTestId("question-answers").getByRole("button",{name:"Continue",exact:true}).click();
  await expect.poll(()=>seen.filter(e=>e.eventName==="chat_question_viewed").length).toBe(3);
  expect(seen.filter(e=>e.eventName==="chat_question_viewed")[2].properties.attemptId).toBe(first.properties.attemptId);
});
