import assert from "node:assert/strict";
import { it, mock } from "node:test";
import { register } from "node:module";
register("../scripts/matcher-http-loader.mjs", import.meta.url);
const { NextRequest, NextResponse } = await import("next/server");
import { permissionForAdminRequest } from "../lib/admin-rbac.ts";
let permissions = ["marketing.read","performance.read"], authenticated = true, calls = 0;
mock.module("../lib/admin-route-auth.ts",{namedExports:{requireAdminRouteAccess:async (_request:unknown, permission:string)=>{
  assert.equal(permission,"marketing.read");
  return {context:authenticated ? {permissions} : null,unauthorized:!authenticated || !permissions.includes(permission)
    ? NextResponse.json({}, {status:authenticated ? 403 : 401}) : null};
}}});
mock.module("../lib/admin-questionnaire-data.ts",{namedExports:{getQuestionnaireDropoffs:async(input:unknown)=>{
  calls++;return {total:0,rows:[],input};
}}});
const {GET}=await import("../app/api/admin/questionnaire-dropoffs/route.ts");
function request(extra=""){return new NextRequest(`http://localhost/api/admin/questionnaire-dropoffs?journey=web&generatedAt=2026-10-07T00:00:00Z&${extra}`);}
it("drill-down requires a signed-in admin with both performance and marketing access",async()=>{
  assert.equal(permissionForAdminRequest("GET","/api/admin/questionnaire-dropoffs"),"marketing.read");
  authenticated=false;assert.equal((await GET(request())).status,401);
  authenticated=true;permissions=["performance.read"];assert.equal((await GET(request())).status,403);
  permissions=["marketing.read"];assert.equal((await GET(request())).status,403);
  assert.equal(calls,0);
  permissions=["marketing.read","performance.read"];assert.equal((await GET(request())).status,200);
});
it("validates report selection and normalises paging without caching lead details",async()=>{
  const response=await GET(request("limit=10000&cursor=-1&q=frAG&displayLocale=th"));
  assert.equal(response.headers.get("cache-control"),"no-store");
  const body=await response.json();assert.equal(body.input.limit,100);assert.equal(body.input.cursor,0);assert.equal(body.input.locale,"th");
  assert.equal((await GET(request("bucket=untrusted"))).status,400);
  assert.equal((await GET(new NextRequest("http://localhost/api/admin/questionnaire-dropoffs?journey=web&generatedAt=invalid"))).status,400);
});
