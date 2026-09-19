import assert from "node:assert/strict";
import {test} from "node:test";
import {clarityFlight,clarityPose} from "../../lib/pharmacy-presentation.ts";
import * as presentation from "../../lib/pharmacy-presentation.ts";
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
test("PHARM-FLIGHT-01 pending flight keeps moving beyond the demonstration and joins without a position jump",()=>{
  assert.equal(typeof presentation.continuingClarityPose,"function");
  const flight=route();
  const pose=(t:number)=>presentation.continuingClarityPose(flight,t,650,360,92);
  assert.deepEqual(pose(4110).point,clarityPose(flight,4110).point);
  assert.ok(Math.hypot(pose(4110.01).point.x-pose(4110).point.x,pose(4110.01).point.y-pose(4110).point.y)<0.01);
  for(const time of [18000,40000,90000]){
    const a=pose(time),b=pose(time+500);
    assert.ok(Math.hypot(a.point.x-b.point.x,a.point.y-b.point.y)>5);
    assert.ok(a.point.x>=46&&a.point.x<=604&&a.point.y>=46&&a.point.y<=314);
  }
});
test("PHARM-FLIGHT-02 repeated flight is continuous with bounded frame movement and an attached tip",()=>{
  assert.equal(typeof presentation.continuingClarityPose,"function");
  for(const width of [350,650]){
    const flight=route(width),size=width===650?92:82;
    let previous=presentation.continuingClarityPose(flight,5310,width,360,size);
    for(let time=5326;time<30000;time+=16){
      const current=presentation.continuingClarityPose(flight,time,width,360,size);
      assert.ok(Math.hypot(current.point.x-previous.point.x,current.point.y-previous.point.y)<6);
      assert.ok(Math.abs(current.angle-previous.angle)<1);
      assert.ok(Math.abs(Math.hypot(current.tip.x-current.point.x,current.tip.y-current.point.y)-size*.36*current.scale*Math.SQRT2)<.001);
      previous=current;
    }
  }
});
test("PHARM-FLIGHT-03 landing starts from the current flight and eases into an exact stationary destination",()=>{
  assert.equal(typeof presentation.landingClarityPose,"function");
  const flight=route(),target={x:20,y:-190},size=92;
  const pose=(time:number)=>presentation.landingClarityPose(presentation.continuingClarityPose(flight,18123+time,650,360,size),target,38/size,size,time/1200);
  const start=presentation.continuingClarityPose(flight,18123,650,360,size);
  assert.deepEqual(pose(0).point,start.point);
  const velocity=(a:{x:number;y:number},b:{x:number;y:number})=>({x:b.x-a.x,y:b.y-a.y});
  const before=velocity(presentation.continuingClarityPose(flight,18122,650,360,size).point,start.point),after=velocity(pose(0).point,pose(1).point);
  assert.ok(Math.hypot(before.x-after.x,before.y-after.y)<.002);
  assert.deepEqual(pose(1200).point,target);
  assert.deepEqual(pose(9000).point,target);
  assert.equal(pose(1200).angle,0);
  assert.equal(pose(1200).scale,38/size);
  assert.ok(Math.hypot(pose(1199).point.x-target.x,pose(1199).point.y-target.y)<.001);
});
test("PHARM-FLIGHT-04 waiting flight stays in its visible area when mobile tiles push the original core below the fold",()=>{
  const flight=route(350);
  for(let time=5310;time<30000;time+=100){
    const pose=presentation.continuingClarityPose(flight,time,350,400,82,-500);
    assert.ok(pose.point.y>-500&&pose.point.y<-100,`y=${pose.point.y}`);
  }
});
