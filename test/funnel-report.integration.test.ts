import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, it, mock } from "node:test";
import type postgres from "postgres";
import { fixtureDatabaseUrl } from "./helpers/fixture-teardown.ts";
import { emptyAdminDashboardFilters } from "../lib/admin-dashboard-filters.ts";

fixtureDatabaseUrl();
const db=await import("../lib/db.ts"), sql=db.getSql()!;
let scoped: postgres.Sql | postgres.TransactionSql = sql;
mock.module("../lib/db.ts", {namedExports:{...db,getSql:()=>scoped}});
const {funnelBpmSource}=await import("../lib/admin-funnel-events.ts");
const {metaResourceChannel}=await import("../lib/meta-tracking.ts");
const {getAdminFlowData}=await import("../lib/admin-flow-data.ts");
const {getAdminExternalQueryData}=await import("../lib/admin-query-data.ts");
after(db.closeSqlPool);

it("queries real SQL: recovers web history while excluding retail and MCP bridge assessments",async()=>{
  const rollback=new Error("fixture rollback");
  try{await sql.begin(async tx=>{
    scoped=tx;
    const campaign=`fixture-funnel-${randomUUID()}`,web=randomUUID(),retail=randomUUID(),mcp=randomUUID();
    for(const [id,answers] of [[web,{}],[retail,{inStorePharmacy:{slug:"fixture",acquisition:{source:"in_store",ray:randomUUID()}}}],[mcp,{channel:"mcp",source:"mcp"}]] as const){
      await tx`insert into public.assessments(plan_id,locale,selected_plan,status,answers) values(${id}::uuid,'en','precision','captured',${tx.json(answers)})`;
    }
    assert.equal(await metaResourceChannel(tx,web,"plan",web),"web");
    assert.equal(await metaResourceChannel(tx,retail,"plan",retail),"retail");
    assert.equal(await metaResourceChannel(tx,mcp,"plan",mcp),"mcp");
    assert.equal(await metaResourceChannel(tx,null,"agentic","order-opaque"),"mcp");
    const ray=randomUUID();let minute=0;
    async function add(name:string,plan:string|null,path:string,source="direct",eventRay=ray){
      const at=new Date(Date.UTC(2026,9,4,0,minute++));
      await tx`insert into public.bpm(id,ray,plan_id,event_name,event_type,event_status,path,traffic_source,utm_campaign,locale,properties,occurred_at)
        values(${randomUUID()}::uuid,${eventRay}::uuid,${plan}::uuid,${name},'funnel','observed',${path},${source},${campaign},'en','{}',${at})`;
    }
    await add("assessment_viewed",null,"/en/nutrition/quiz");
    await add("chat_start",null,"/en/nutrition/quiz");
    await add("chat_start",null,"/en/nutrition/quiz");
    await add("assessment_captured",web,"/en/nutrition/quiz");
    await add("page_viewed",web,"/en/nutrition/healthscore");
    // Server events may have no route/attribution; durable assessment provenance is decisive.
    await add("assessment_captured",retail,"","direct",randomUUID());
    await add("healthscore_viewed",mcp,"/en/nutrition/healthscore","direct",randomUUID());
    await add("chat_start",null,"/en/retail/fixture/quiz","pharmacy",randomUUID());
    await add("page_viewed",null,"/en/mcp/checkout/token","direct",randomUUID());
    const channels=await tx`select journey_channel,count(*)::int as n from ${funnelBpmSource(tx as unknown as postgres.Sql)} where utm_campaign=${campaign} group by 1`;
    assert.deepEqual(Object.fromEntries(channels.map(row=>[row.journey_channel,row.n])),{web:5,retail:2,mcp:2});
    const flow=await getAdminFlowData("all",{...emptyAdminDashboardFilters,campaign});
    assert.equal(flow.databaseAvailable,true);
    const count=(id:string)=>flow.nodes.find(row=>row.id===id)?.count;
    assert.equal(count("landingViewed"),1);assert.equal(count("assessmentStarted"),1);assert.equal(count("assessmentSubmitted"),1);
    assert.equal(count("healthscoreViewed"),1);assert.equal(count("healthscoreDisplayed"),0);
    assert.deepEqual(flow.transitions?.assessmentCompletions,{numerator:1,denominator:1});
    const report=await getAdminExternalQueryData("campaigns",new URLSearchParams({range:"all",campaign}));
    const data=report.data as {journeyChannel:string;summary:{landed:number;assessmentStarts:number;assessmentCompletions:number;healthScoreViews:number};healthScoreDisplayed:number};
    assert.equal(data.journeyChannel,"web");assert.equal(data.summary.landed,1);assert.equal(data.summary.assessmentStarts,1);
    assert.equal(data.summary.assessmentCompletions,1);assert.equal(data.summary.healthScoreViews,1);assert.equal(data.healthScoreDisplayed,0);
    await add("healthscore_viewed",web,"/en/nutrition/healthscore");
    const displayed=await getAdminFlowData("all",{...emptyAdminDashboardFilters,campaign});
    assert.equal(displayed.nodes.find(row=>row.id==="healthscoreViewed")?.count,1);
    assert.equal(displayed.nodes.find(row=>row.id==="healthscoreDisplayed")?.count,1);
    throw rollback;
  });}catch(error){if(error!==rollback)throw error;}finally{scoped=sql;}
});
