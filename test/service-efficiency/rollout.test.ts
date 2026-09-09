import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
const url=new URL("../../scripts/service-efficiency/rollout-proof.mjs",import.meta.url);
async function helpers(){assert.ok(existsSync(url),"The bounded DEV/UAT rollout must have an independently checked proof");return import(url.href);}
const bases={dev:"4".repeat(40),uat:"8".repeat(40)},source="c".repeat(40),lockHash="a".repeat(64);
const rollout={version:1,environments:["dev","uat"],deploymentBases:bases,sourceCommit:source,lockRegisterSha256:lockHash};

test("LOCK-ROLLOUT-01 scoped promotion rejects wrong environment, bases, source or register identity",async()=>{
  const {validateRolloutBinding}=await helpers();
  const expected={sourceCommit:source,deploymentBases:bases,lockRegisterSha256:lockHash};
  assert.equal(validateRolloutBinding(rollout,expected,"uat",bases.uat),true);
  assert.equal(validateRolloutBinding(rollout,expected,"dev",bases.dev),true);
  for(const [value,environment,base] of [[rollout,"prd",bases.uat],[rollout,"uat",bases.dev],[{...rollout,sourceCommit:"d".repeat(40)},"uat",bases.uat],
    [{...rollout,lockRegisterSha256:"b".repeat(64)},"uat",bases.uat],[{...rollout,deploymentBases:{...bases,uat:bases.dev}},"uat",bases.uat]])
    assert.throws(()=>validateRolloutBinding(value,expected,environment,base));
});

test("LOCK-ROLLOUT-02 all 39 mechanisms require actual successful case evidence",async()=>{
  const {verifyLockExecution}=await helpers();
  const register={mechanisms:Array.from({length:39},(_,n)=>({number:n+1,disposition:"retain",cases:[{file:"fixture.test.ts",name:`case-${n+1}`}]}))};
  const events=register.mechanisms.map(row=>({file:"fixture.test.ts",name:`case-${row.number}`,type:"test",passed:true}));
  assert.equal(verifyLockExecution(register,events).passed,true);
  assert.throws(()=>verifyLockExecution(register,events.slice(1)));
  assert.throws(()=>verifyLockExecution(register,events.map((row,i)=>i?row:{...row,passed:false})));
  assert.throws(()=>verifyLockExecution({...register,mechanisms:register.mechanisms.slice(1)},events));
  assert.throws(()=>verifyLockExecution({...register,mechanisms:register.mechanisms.map(row=>({...row,cases:[]}))},events));
});

test("LOCK-ROLLOUT-03 UAT configuration binds all worker identities without changing pools, profiles or replicas",async()=>{
  const {withUatWorkerIdentity}=await helpers();
  const spec={name:"mattanutra-ui-uat",services:[{name:"mattanutra-ui",instance_count:2,instance_size_slug:"apps-s-1vcpu-1gb",
    github:{branch:"uat",repo:"fixture/mattanutra-ui",deploy_on_push:true},envs:[{key:"DB_POOL_MAX",value:"30",scope:"RUN_TIME",type:"GENERAL"},
      {key:"WORKER_VERSION",value:bases.uat,scope:"RUN_TIME",type:"GENERAL"},{key:"WORKER_TOKEN",value:"fixture-secret",scope:"RUN_TIME",type:"SECRET"}]}]};
  const original=structuredClone(spec),next=withUatWorkerIdentity(spec,source);
  assert.deepEqual(spec,original);
  for(const key of ["AGENTIC_BUILD_ID","AGENTIC_WORKER_VERSION","WORKER_VERSION"])assert.equal(next.services[0].envs.find(row=>row.key===key)?.value,source);
  assert.equal(next.services[0].instance_count,2);assert.equal(next.services[0].instance_size_slug,"apps-s-1vcpu-1gb");
  for(const key of ["DB_POOL_MAX","WORKER_TOKEN"])assert.deepEqual(next.services[0].envs.find(row=>row.key===key),original.services[0].envs.find(row=>row.key===key));
  assert.throws(()=>withUatWorkerIdentity({...spec,name:"mattanutra-ui-prd"},source));
  assert.throws(()=>withUatWorkerIdentity(spec,"0.1.17"));
  const entry=readFileSync(new URL("../../scripts/deploy-uat.mjs",import.meta.url),"utf8");
  assert.match(entry,/--service-efficiency-attestation/);
  assert.match(entry,/return deployEfficiencyUat/);
});
