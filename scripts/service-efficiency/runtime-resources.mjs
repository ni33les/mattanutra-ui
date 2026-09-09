import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
export function validateUatResources(value) {
  const [quota,period]=value.cpuMax.split(/\s+/).map(Number);
  assert.ok(Number.isFinite(quota) && quota>0 && quota===period,"Runtime must have exactly one CPU of quota");
  assert.equal(value.memoryMax,"1073741824","Runtime must have the UAT 1-GiB memory limit");
  assert.equal(value.swapMax,"0","Swap cannot hide a UAT memory failure");
  assert.equal(value.events.oom,0);assert.equal(value.events.oom_kill,0);
  assert.ok(Number.isFinite(value.peakBytes) && value.peakBytes>0 && value.peakBytes<=Number(value.memoryMax));
  return true;
}
export function runtimeResourceSnapshot() {
  const line=readFileSync("/proc/self/cgroup","utf8").split("\n").find(row=>row.startsWith("0::"));
  assert.ok(line,"A measured cgroup v2 runtime is required");
  const group=line.slice(3),read=name=>readFileSync(`/sys/fs/cgroup${group}/${name}`,"utf8").trim();
  const value={group,cpuMax:read("cpu.max"),memoryMax:read("memory.max"),swapMax:read("memory.swap.max"),
    peakBytes:Number(read("memory.peak")),events:Object.fromEntries(read("memory.events").split("\n").map(row=>{const [name,value]=row.split(/\s+/);return [name,Number(value)];}))};
  validateUatResources(value);return value;
}
export function scopedBenchmarkCommand(name,args) {
  assert.match(name,/^[a-z0-9-]+$/);
  return {command:"systemd-run",args:["--scope","--quiet",`--unit=mattanutra-lock-benchmark-${process.pid}-${name}`,
    "--property=CPUQuota=100%","--property=MemoryMax=1G","--property=MemorySwapMax=0",...args]};
}
