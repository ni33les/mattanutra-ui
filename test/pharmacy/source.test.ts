import assert from "node:assert/strict";
import { it } from "node:test";
import { assessmentInputHash } from "../../lib/assessment-revisions.ts";
import { getBpmPayload } from "../../lib/bpm-client.ts";
const ray = "aaaabbbb-1111-4111-8111-aaaabbbbcccc";
const answers = { age: "36-45", inStorePharmacy: { organisationId: "11111111-1111-4111-8111-111111111111", slug: "delight-pharmacy" } };
it("PHARM-SRC-01 acquisition does not change generation identity", () => {
  for (const source of ["in_store", "business_card", "unknown"]) {
    assert.equal(assessmentInputHash({ ...answers, inStorePharmacy: { ...answers.inStorePharmacy, acquisition: { source, ray } } }), assessmentInputHash(answers));
  }
  assert.notEqual(assessmentInputHash({ ...answers, age: "46-55" }), assessmentInputHash(answers));
});
it("PHARM-SRC-02 server-rendered pharmacy context overrides old browser attribution even without storage", () => {
  const saved = new Map(["window", "document", "navigator"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      location: { pathname: "/en/retail/delight/quiz", search: "?source=in_store", href: "https://dev.example/en/retail/delight/quiz?source=in_store" },
      innerWidth: 390, sessionStorage: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } }
    }});
    Object.defineProperty(globalThis, "document", { configurable: true, value: { referrer: "", querySelector: () => ({ dataset: { pharmacySource: "business_card", pharmacyRay: ray, pharmacySlug: "delight-pharmacy" } }) }});
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "fixture" }});
    const payload = getBpmPayload();
    assert.equal(payload.ray, ray);
    assert.equal(payload.attribution.sourceDetail, "business_card");
    assert.equal(payload.attribution.sourceChannel, "delight-pharmacy");
    assert.equal(payload.attribution.trafficSource, "pharmacy");
  } finally { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } }
});

it("PHARM-SRC-03 defaults only new untagged entries and preserves historical unknowns", async () => {
  const { pharmacySource, resolvePharmacyAcquisition } = await import("../../lib/pharmacy-acquisition.ts");
  assert.equal(pharmacySource(undefined),"in_store");
  for (const invalid of ["", "poster", ["in_store","business_card"], 1]) assert.equal(pharmacySource(invalid),"unknown");
  assert.equal(resolvePharmacyAcquisition({ray,attribution:{sourceDetail:"in_store"}},answers,ray).source,"unknown");
});
it("PHARM-SRC-04 saved source wins without modifying matching pharmacy ownership", async () => {
  const { resolvePharmacyAcquisition, withoutPharmacyAcquisition } = await import("../../lib/pharmacy-acquisition.ts");
  const saved = {...answers,inStorePharmacy:{...answers.inStorePharmacy,acquisition:{source:"business_card",ray}}};
  assert.deepEqual(resolvePharmacyAcquisition({ray:"11111111-1111-4111-8111-111111111111",attribution:{sourceDetail:"in_store"}},saved,ray),{source:"business_card",ray});
  assert.deepEqual(withoutPharmacyAcquisition(saved), answers);
  assert.ok(saved.inStorePharmacy.acquisition);
});
it("PHARM-SRC-05 funnel keeps two sources separate and counts repeated milestones once", async () => {
  const {summarizePharmacySources}=await import("../../lib/pharmacy-funnel.ts");
  const base={id:"a",ray,planId:null,pharmacy:"delight-pharmacy",source:"business_card" as const,stage:"landing" as const};
  const events=[base,{...base,id:"b"},{...base,id:"c",stage:"started" as const},{...base,id:"d",planId:"plan",stage:"captured" as const},{...base,id:"e",planId:"plan",stage:"revealed" as const},{...base,id:"o",orderId:"order",planId:"plan",stage:"orders" as const}, {...base,id:"i",ray:"other",source:"in_store" as const}];
  const rows=summarizePharmacySources(events);
  assert.deepEqual(rows.find(row=>row.source==="business_card"),{pharmacy:"delight-pharmacy",source:"business_card",landing:1,started:1,captured:1,revealed:1,orders:1,orderedJourneys:1});
  assert.equal(rows.find(row=>row.source==="in_store")?.landing,1);
  assert.equal(rows.find(row=>row.source==="unknown")?.orders,0);
  assert.deepEqual(summarizePharmacySources([...events].reverse()),rows);
});
it("PHARM-SRC-06 ordinary web attribution remains independent of pharmacy visits", () => {
  const saved = new Map(["window", "document", "navigator"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    const attribution={trafficSource:"social",sourceChannel:"line",sourceDetail:"old-web-campaign"};
    Object.defineProperty(globalThis,"window",{configurable:true,value:{location:{pathname:"/en/nutrition/quiz",search:"",href:"https://dev.example/en/nutrition/quiz"},innerWidth:1200,sessionStorage:{getItem:(key:string)=>key.endsWith(":ray")?ray:JSON.stringify(attribution),setItem(){}}}});
    Object.defineProperty(globalThis,"document",{configurable:true,value:{referrer:"",querySelector:()=>null}});
    Object.defineProperty(globalThis,"navigator",{configurable:true,value:{userAgent:"fixture"}});
    assert.equal(getBpmPayload().attribution.sourceDetail,"old-web-campaign");
    assert.equal(getBpmPayload().attribution.sourceChannel,"line");
  } finally { for (const [key,descriptor] of saved) {if(descriptor) Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);} }
});
