import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { isDeepStrictEqual } from "node:util";

const [environment, build, output] = process.argv.slice(2);
assert.ok(["dev", "uat"].includes(environment)); assert.match(build ?? "", /^[a-f0-9]{40}$/);
assert.ok(output?.startsWith("/") && !resolve(output).startsWith(process.cwd()+"/"));
mkdirSync(output, { mode: 0o700 });
const save = (file, value) => writeFileSync(resolve(output, file), JSON.stringify(value, null, 2)+"\n", { flag: "wx", mode: 0o600 });
const golden = locale => JSON.parse(readFileSync(`test/mcp-discovery/goldens/${locale}.json`, "utf8"));
const baseline = JSON.parse(gunzipSync(readFileSync("test/mcp-discovery/baseline-tools.json.gz")));
const names = ["info", "plan", "execute", "order", "support", "feedback", "evidence"];
const schemaChecksum = "b90da9cf4b6b9e8f7cf4f49b8420be5751af5ed17e99b1a874c39ee0bcb985a1";
const origin = `https://${environment}.mattanutra.com`;
const snapshots = [], transport = []; let nextRequest = 0;
async function rpc(method, params) {
  await new Promise(done => setTimeout(done, Math.max(0, nextRequest-Date.now())));
  nextRequest=Date.now()+1100;
  const start=performance.now(), response=await fetch(`${origin}/api/mcp`, { method:"POST",
    headers:{"Content-Type":"application/json","Cache-Control":"no-cache"},
    body:JSON.stringify({jsonrpc:"2.0",id:transport.length+1,method,params}), signal:AbortSignal.timeout(15000) });
  const body=await response.json(); assert.equal(response.status,200); assert.ok(!body.error,JSON.stringify(body.error));
  assert.equal(response.headers.get("x-agentic-build-id"),build); assert.equal(response.headers.get("x-agentic-schema-checksum"),schemaChecksum);
  transport.push({method,ms:performance.now()-start,httpStatus:response.status,build});
  const result=method==="tools/call"?body.result.structuredContent:body.result; assert.ok(result);
  return result;
}
for (const run of ["a","b"]) {
  const snapshot={environment,build,responses:{}};
  for (const locale of ["en","th","zh-CN"]) {
    const copy=golden(locale), init=await rpc("initialize", {protocolVersion:"2025-06-18",locale,capabilities:{},clientInfo:{name:`discovery-${run}`,version:"1"}});
    assert.equal(init.serverInfo.name,`mattanutra_${environment}`); assert.equal(init.serverInfo.title,"MattaNutra");
    assert.equal(init.instructions.split("\n")[0],copy.initialization); assert.ok(init.instructions.indexOf(copy.environmentWarnings[environment])>0);
    const listing=await rpc("tools/list",{locale}); assert.equal(listing.contractVersion,"7.2.4"); assert.equal(listing.schemaChecksum,schemaChecksum);
    assert.deepEqual(listing.tools.map(row=>row.name),names);
    for (const tool of listing.tools) {
      assert.equal(tool.title,copy.titles[tool.name]); assert.ok(tool.description.startsWith(copy.purposes[tool.name]));
      const previous=baseline.find(row=>row.name===tool.name); assert.ok(previous);
      for (const field of ["inputSchema","outputSchema","annotations"]) assert.deepEqual(tool[field],previous[field]);
    }
    const info=await rpc("tools/call",{name:"info",arguments:{locale}});
    assert.equal(info.serviceName,"MattaNutra"); assert.equal(info.description,copy.infoDescription);
    assert.equal(info.buildId,build); assert.equal(info.contractVersion,"7.2.4"); assert.equal(info.schemaChecksum,schemaChecksum);
    assert.deepEqual(info.supportedLocales,["en","th","zh-CN"]);
    assert.deepEqual(info.supportedCountries.map(row=>row.countryCode),["TH"]);
    assert.ok(info.clientInstructions.indexOf(copy.environmentWarnings[environment])>0);
    assert.match(info.clientInstructions,/finite catalogue/); assert.match(info.clientInstructions,/unassessed, never cleared/);
    const guide=await rpc("tools/call",{name:"info",arguments:{locale,view:"client_guide"}});
    assert.equal(guide.clientGuideText.split("\n\n")[1],copy.initialization);
    assert.ok(guide.clientGuideText.includes(copy.environmentWarnings[environment]));
    for (const other of ["dev","uat"].filter(env=>env!==environment)) assert.ok(!guide.clientGuideText.includes(copy.environmentWarnings[other]));
    for (const [method,view,value] of [["initialize","overview",init],["tools/list","overview",listing],["tools/call","overview",info],["tools/call","client_guide",guide]]) snapshot.responses[`${environment}:${locale}:${method}:${view}`]=value;
  }
  const manifestResponse=await fetch(`${origin}/.well-known/mcp.json`,{headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(15000)});
  assert.equal(manifestResponse.status,200); const manifest=await manifestResponse.json();
  assert.equal(manifest.title,"MattaNutra"); assert.equal(manifest.name,`mattanutra_${environment}`);
  assert.equal(manifest.environment,environment); assert.equal(manifest.url,`${origin}/api/mcp`);
  assert.equal(manifest.shortDescription,golden("en").shortDescription); assert.equal(manifest.longDescription,golden("en").longDescription);
  assert.equal(manifest.unsupportedUseGuidance,golden("en").unsupportedUseGuidance);
  assert.equal(manifest.environmentWarning,golden("en").environmentWarnings[environment]);
  for (const locale of ["en","th","zh-CN"]) assert.deepEqual(manifest.locales[locale],golden(locale));
  assert.deepEqual(manifest.tools,snapshot.responses[`${environment}:en:tools/list:overview`].tools);
  snapshot.connectorManifest=manifest;
  // Responses contain no generated handles. Preserve every metadata field,
  // including titles, descriptions, schema order and environment warnings.
  snapshots.push(snapshot); save(`discovery-${run}.json`,snapshot);
}
assert.ok(isDeepStrictEqual(snapshots[0],snapshots[1]),"Pinned discovery responses changed between independent client sessions");
save("transport.json",transport);
save("result.json",{passed:true,environment,build,contractVersion:"7.2.4",schemaChecksum,identical:true,
  canonicalSha256:createHash("sha256").update(JSON.stringify(snapshots[0])).digest("hex"),
  calls:transport.length,installedConnectorVerified:false,
  outstanding:"Owner refresh and actual installed-host export are separate from native endpoint and public manifest verification."});
console.log(JSON.stringify({passed:true,environment,build,identical:true,output}));
