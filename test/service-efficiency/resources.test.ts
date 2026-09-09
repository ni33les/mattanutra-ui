import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {test} from "node:test";
test("LOCK-RESOURCE-01 UAT-equivalent evidence rejects unlimited CPU, excess memory, swap and OOM",async()=>{
  const resourceModule=new URL("../../scripts/service-efficiency/runtime-resources.mjs",import.meta.url);
  assert.ok(existsSync(resourceModule),"Resource equivalence must be measured and enforced");
  const {validateUatResources,scopedBenchmarkCommand}=await import(resourceModule.href);
  const good={cpuMax:"100000 100000",memoryMax:"1073741824",swapMax:"0",events:{oom:0,oom_kill:0},peakBytes:900_000_000};
  assert.equal(validateUatResources(good),true);
  for(const patch of [{cpuMax:"max 100000"},{cpuMax:"200000 100000"},{memoryMax:"max"},{memoryMax:"2147483648"},{swapMax:"1073741824"},{events:{oom:1,oom_kill:0}},{events:{oom:0,oom_kill:1}},{peakBytes:1_500_000_000}])
    assert.throws(()=>validateUatResources({...good,...patch}));
  const launch=scopedBenchmarkCommand("fixture",["node","fixture.mjs"]);
  assert.equal(launch.command,"systemd-run");
  for(const arg of ["--scope","--property=CPUQuota=100%","--property=MemoryMax=1G","--property=MemorySwapMax=0"])assert.ok(launch.args.includes(arg));
  assert.deepEqual(launch.args.slice(-2),["node","fixture.mjs"]);
});
