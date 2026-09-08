import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { handleLightweightJsonRpc } from "../../lib/agentic/mcp/rpc.ts";
import { runtime } from "../ax-refinement/helpers.ts";
import { readContractResource } from "../../lib/agentic/contract/guide.ts";
test("published_listing_version_matches_info", async () => {
 const config=runtime("m723-identity").config;
 const listing=(await handleLightweightJsonRpc(config,{id:1,method:"tools/list"}))!.result!;
 const info=(await handleLightweightJsonRpc(config,{id:2,method:"tools/call",params:{name:"info",arguments:{view:"plan_schema",planOperation:"get"}}}))!.result!.structuredContent as Record<string,unknown>;
 assert.equal(listing.contractVersion,info.contractVersion); assert.equal(listing.schemaChecksum,info.schemaChecksum);
 const plan=(listing.tools as {name:string;inputSchema:{anyOf:{properties:{operation:{const:string}}}[]}}[]).find(row=>row.name==="plan")!;
 const schema=plan.inputSchema.anyOf.find(row=>"anyOf" in row && (row.anyOf as {properties:{operation:{const:string}}}[]).every(child=>child.properties.operation.const==="get"));
 assert.ok(schema);
 const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,row])=>[key,canonical(row)])):value;
 const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
 assert.equal(hash(schema),hash(JSON.parse(String(info.planSchemaJson))));
 const published=JSON.parse(readFileSync(`contract/mcp/${info.contractVersion}/tools.json`,"utf8"));
 assert.deepEqual(published.tools.find((row:{name:string})=>row.name==="plan").inputSchema,plan.inputSchema);
 assert.equal(published.contractVersion, info.contractVersion); assert.equal(published.schemaChecksum, info.schemaChecksum);
 for (const file of ["public/.well-known/mcp.json", "lib/agentic/adapters/openai.json", "lib/agentic/adapters/anthropic.json", "lib/agentic/adapters/xai.json"]) {
   const projection = JSON.parse(readFileSync(file, "utf8")); assert.equal(projection.contractVersion, info.contractVersion); assert.equal(projection.schemaChecksum, info.schemaChecksum);
 }
 for (const [name, file] of [["client-guide", "README.md"], ["schema", "schema.json"]]) {
   const previous = readContractResource(`mattanutra://contract/7.2.2/${name}`); assert.ok(previous);
   assert.equal(previous.contents[0].text, readFileSync(`contract/mcp/7.2.2/${file}`, "utf8"));
 }
});
