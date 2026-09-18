import assert from "node:assert/strict";
import {test} from "node:test";
import {clarityFlight,clarityPose} from "../../lib/pharmacy-presentation.ts";
function route(width=650){return clarityFlight({width,height:360,source:{x:20,y:-190},questions:[{x:width*.24,y:122.4},{x:width*.76,y:136.8},{x:width*.3,y:273.6}],core:{x:width/2,y:213},shellSize:width===650?92:82});}
test("PHARM-MOTION-01 rotation is continuous across every move and hold boundary",()=>{
  for(const width of [350,650]){
    const flight=route(width);let previous=clarityPose(flight,0);
    for(let time=16;time<=4110;time+=16){const current=clarityPose(flight,time);assert.ok(Math.abs(current.angle-previous.angle)<2,`rotation jump at ${time}ms`);previous=current;}
  }
});
test("PHARM-MOTION-02 leaf tip reaches every question and the final core",()=>{
  const flight=route();
  for(const [index,time] of [870,1610,2350,3610].entries()){
    const tip=clarityPose(flight,time).tip,target=flight.tapPoints[index];
    assert.ok(Math.hypot(tip.x-target.x,tip.y-target.y)<.1,`tap ${index}`);
  }
});
test("PHARM-MOTION-03 trail distance is monotonic, bounded and reaches the same final tip",()=>{
  const flight=route();assert.ok(flight.samples.length<600);let previous=0;
  for(let time=0;time<=4200;time+=7){const pose=clarityPose(flight,time);assert.ok(pose.distance>=previous&&pose.distance<=flight.distance);previous=pose.distance;}
  assert.equal(clarityPose(flight,-10).distance,0);
  assert.equal(clarityPose(flight,100000).distance,flight.distance);
  const end=clarityPose(flight,100000).tip;assert.deepEqual(end,flight.samples.at(-1)!.tip);
});
