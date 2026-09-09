import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { startHttpCandidate } from "../scripts/run-matcher-test-suite.mjs";
import { isolatedValidationEnvironment } from "../scripts/run-dev-advisory-validation.mjs";

test("MCP-HTTP-WORKER-01 the isolated public client reaches ready through a separately registered durable worker", {timeout:35000}, async () => {
  assert.ok(process.env.TEST_DB_URL,"Isolated PostgreSQL is mandatory");
  const buildId=JSON.parse(readFileSync(".next/required-server-files.json","utf8")).config.env.AGENTIC_BUILD_ID;
  const output=mkdtempSync(join(tmpdir(),"mcp-http-worker-"));
  const server=await startHttpCandidate({...isolatedValidationEnvironment(process.env),AGENTIC_BUILD_ID:buildId,DB_URL:process.env.TEST_DB_URL,DB_WORKER_URL:process.env.TEST_DB_URL,MATTANUTRA_ENV:"dev",NODE_ENV:"test"},output);
  try {
    async function call(args: Record<string,unknown>) {
      const response=await fetch(`${server.identity.origin}/api/mcp`,{method:"POST",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"plan",arguments:args}}),signal:AbortSignal.timeout(15000)});
      assert.equal(response.status,200);const body=await response.json();assert.ok(body.result?.structuredContent,JSON.stringify(body));return body.result.structuredContent;
    }
    const start=performance.now();
    const admitted=await call({operation:"create",idempotencyKey:`mcp-http-worker-${Date.now()}`,request:{locale:"en",destinationCountry:"TH",optimization:"lowest_cost",profile:{ageYears:40,lifeStage:"adult"},requirements:{},targets:[{name:"Vitamin D3",amount:2000,unit:"IU"}]}});
    let current=admitted;assert.equal(current.ok,true);
    while(current.status==="processing" && performance.now()-start<15000) { await delay(1000);current=await call({operation:"get",planHandle:admitted.planHandle,responseView:"status"}); }
    assert.ok(performance.now()-start<15000,"Standard D3 must complete within the existing 15-second condition");
    assert.equal(current.status,"ready",JSON.stringify(current));
    assert.ok(server.identity.worker?.workerSessionId,"Readiness requires a registered external execution owner");
  }finally{await server.stop();}
});
