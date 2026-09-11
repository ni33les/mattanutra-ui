import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { startHttpCandidate } from "../scripts/run-matcher-test-suite.mjs";
import { isolatedValidationEnvironment } from "../scripts/run-dev-advisory-validation.mjs";
import postgres from "postgres";
import { seedPublicMatcherFixtures } from "../scripts/seed-matcher-public-fixtures.mjs";

test("MCP-HTTP-WORKER-01 the isolated public client reaches ready through a separately registered durable worker", {timeout:35000}, async () => {
  assert.ok(process.env.TEST_DB_URL,"Isolated PostgreSQL is mandatory");
  isolatedValidationEnvironment(process.env);
  const fixtureDb=postgres(process.env.TEST_DB_URL,{max:1,prepare:false});
  try { await fixtureDb.begin(seedPublicMatcherFixtures); } finally { await fixtureDb.end(); }
  const buildId=process.env.AGENTIC_BUILD_ID;
  assert.match(buildId ?? "", /^[a-f0-9]{40}$/, "The isolated runner must pin application and worker identity without requiring an unrelated browser build");
  const output=mkdtempSync(join(tmpdir(),"mcp-http-worker-"));
  const server=await startHttpCandidate({...isolatedValidationEnvironment(process.env),AGENTIC_BUILD_ID:buildId,DB_URL:process.env.TEST_DB_URL,DB_WORKER_URL:process.env.TEST_DB_URL,MATTANUTRA_ENV:"dev",NODE_ENV:"test"},output);
  try {
    async function call(args: Record<string,unknown>) {
      const response=await fetch(`${server.identity.origin}/api/mcp`,{method:"POST",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"plan",arguments:args}}),signal:AbortSignal.timeout(15000)});
      assert.equal(response.status,200);const body=await response.json();assert.ok(body.result?.structuredContent,JSON.stringify(body));return body.result.structuredContent;
    }
    const start=performance.now();
    const admitted=await call({idempotencyKey:`mcp-http-worker-${Date.now()}`,locale:"en",destinationCountry:"TH",scoring:{profile:"lowest_cost"},profile:{ageYears:40,lifeStage:"adult"},requirements:{},targets:[{name:"Vitamin D3",amount:2000,unit:"IU"}]});
    let current=admitted;assert.equal(current.ok,true,JSON.stringify(current));
    while(current.status==="processing" && performance.now()-start<15000) { await delay(1000);current=await call({planHandle:admitted.planHandle}); }
    assert.ok(performance.now()-start<15000,"Standard D3 must complete within the existing 15-second condition");
    assert.equal(current.status,"ready",JSON.stringify(current));
    assert.ok(server.identity.worker?.workerSessionId,"Readiness requires a registered external execution owner");
  }finally{await server.stop();}
});
