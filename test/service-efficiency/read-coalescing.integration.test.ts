import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after,test} from "node:test";
import postgres from "postgres";
import {closeSqlPool} from "../../lib/db.ts";
import {withServiceMeasurements,serviceMeasurements} from "../../lib/service-metrics.ts";
import {refreshAdminSafetyCeilings} from "../../lib/agentic/catalogue/load-safety-ceilings.ts";
import {resetMatcherSafetyCeilings} from "../../lib/matcher/safety-ceilings.ts";
import {appendSupplementSafetyLimitVersion} from "../../lib/supplement-safety-limit-versions.ts";
import {listDeliverableMarkets} from "../../lib/agentic/catalogue/market.ts";
import {ensureCatalogueSnapshot,setCatalogueInitGateForTests,setCatalogueInitEnteredForTests} from "../../lib/agentic/catalogue/snapshot.ts";
import {installGoldCatalogue,uninstallGoldCatalogue} from "../helpers/gold-catalogue.ts";
import {readPlanState} from "../../lib/agentic/presentation/plan-read.ts";
import {storedFixture,internalFixture} from "../mcp-conversation-pack/helpers.ts";
import {withLivePlanRequest,isLivePlanInFlight,keepPlanPathWarm} from "../../lib/agentic/plan/warm-dev.ts";

assert.ok(process.env.TEST_DB_URL,"Isolated PostgreSQL is mandatory");
const url=new URL(process.env.TEST_DB_URL);assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/^\/mattanutra_lock_review_ax_/);
const sql=postgres(url.href,{max:3,prepare:false});
after(async()=>{uninstallGoldCatalogue();await closeSqlPool();await sql.end();});

test("LOCK-COALESCE-32 catalogue single-flight waits only its own immutable load and cannot block status",async()=>{
  installGoldCatalogue();const {app,handle}=await storedFixture(internalFixture());
  let release!:()=>void,entered=0;const barrier=new Promise<void>(resolve=>{release=resolve;});
  setCatalogueInitGateForTests(barrier);setCatalogueInitEnteredForTests(()=>{entered++;});
  const calls=Array.from({length:12},()=>ensureCatalogueSnapshot("dev","TH"));
  try {assert.equal(entered,1);assert.ok("projection" in await readPlanState(app,handle));}
  finally {release();setCatalogueInitGateForTests(null);setCatalogueInitEnteredForTests(null);}
  const rows=await Promise.all(calls);assert.ok(rows[0].products.length);assert.ok(rows.every(row=>row===rows[0]));
});

test("LOCK-COALESCE-33 reference refresh coalesces one MVCC read behind a held reference writer",async()=>{
  resetMatcherSafetyCeilings();const id=randomUUID();
  await sql`insert into supplements(id,name,normalized_name,category) values(${id}::uuid,${`Lock fixture ${id}`},${id},'test_fixture')`;
  await sql.begin(tx=>appendSupplementSafetyLimitVersion(tx,{supplementId:id,lifeStage:"adult",sourceScope:"total",maxAmount:100,maxUnit:"mcg/day",confidence:"high",safetyFlags:[],safetyNotes:"Synthetic lock fixture",sourceUrl:"https://fixture.invalid/reference",basisRationale:"Synthetic concurrency test"}));
  const [epoch]=await sql`select revision from catalogue_runtime_revision where singleton`;
  let release!:()=>void,ready!:()=>void;const entered=new Promise<void>(resolve=>{ready=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const held=sql.begin(async tx=>{await tx`select id from supplement_safety_limits where supplement_id=${id}::uuid for update`;ready();await gate;});
  await entered;
  try {
    await withServiceMeasurements(async()=>{
      const values=await Promise.all(Array.from({length:12},()=>refreshAdminSafetyCeilings({runtimeRevision:Number(epoch.revision),force:true})));
      assert.equal(values[0].find(row=>row.subjectId===id)?.maxAmount,100);
      assert.ok(values.every(value=>value===values[0]));
      assert.equal(serviceMeasurements()["db.acquire_begin_ms"]?.count,1,"One shared database read, not twelve");
      assert.equal(serviceMeasurements()["db.lock_statement_client_ms"],undefined);
    });
  } finally {
    release();await held;resetMatcherSafetyCeilings();
    await sql.begin(async tx=>{await tx`set local session_replication_role=replica`;await tx`delete from supplement_safety_limits where supplement_id=${id}::uuid`;await tx`delete from supplements where id=${id}::uuid`;});
  }
});

test("LOCK-COALESCE-34 market discovery coalesces ordinary reads without holding tenant locks",async()=>{
  const id=randomUUID();
  const [tenant]=await sql`insert into organisations(id,slug,name,organisation_type,status,country_code,currency)
    values(${id}::uuid,${`lock-market-${id}`},'Synthetic market lock fixture','tenant','active','TH','THB') returning id`;
  assert.ok(tenant,"The isolated catalogue requires a real active TH tenant");
  let release!:()=>void,ready!:()=>void;const entered=new Promise<void>(resolve=>{ready=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const held=sql.begin(async tx=>{await tx`select id from organisations where id=${tenant.id}::uuid for update`;ready();await gate;});await entered;
  try {
    await withServiceMeasurements(async()=>{
      const values=await Promise.all(Array.from({length:12},()=>listDeliverableMarkets()));
      assert.ok(values[0].some(row=>row.countryCode==="TH"));assert.ok(values.every(row=>row===values[0]));
      assert.equal(serviceMeasurements()["db.acquire_begin_ms"]?.count,1);
      assert.equal(serviceMeasurements()["db.lock_statement_client_ms"],undefined);
    });
  } finally {release();await held;await sql`delete from organisations where id=${id}::uuid`;}
});

test("LOCK-MAINT-38 live-work tracking suppresses maintenance without serializing customer requests",async()=>{
  let release!:()=>void,entered=0;const gate=new Promise<void>(resolve=>{release=resolve;});
  const work=Array.from({length:2},()=>withLivePlanRequest(async()=>{entered++;await gate;return entered;}));
  try {assert.equal(entered,2);assert.equal(isLivePlanInFlight(),true);await keepPlanPathWarm("dev");assert.equal(entered,2);}
  finally {release();await Promise.all(work);}
  assert.equal(isLivePlanInFlight(),false);
});
