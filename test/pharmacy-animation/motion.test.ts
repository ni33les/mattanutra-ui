import assert from "node:assert/strict";
import { test } from "node:test";
import * as motion from "../../lib/pharmacy-presentation.ts";
const area = (width = 650) => ({ left: 60, top: 110, width, height: 400, source: {x: 38, y: 38}, shellSize: 82 });
const length = (points: motion.Point[]) => points.slice(1).reduce((sum,p,i) => sum + Math.hypot(p.x-points[i].x,p.y-points[i].y),0);

test("PHARM-MOTION-01 one butterfly curve has gentle continuous movement through the former phase boundaries", () => {
  assert.equal(typeof motion.butterflyFlight, "function");
  const flight = motion.butterflyFlight(area());
  let previous = motion.butterflyPose(flight, 0), previousSpeed = 0;
  for (let time=16;time<50000;time+=16) {
    const pose=motion.butterflyPose(flight,time), speed=Math.hypot(pose.point.x-previous.point.x,pose.point.y-previous.point.y)/16;
    assert.ok(speed<.4, `speed ${speed} at ${time}`);
    assert.ok(Math.abs(speed-previousSpeed)<.02, `speed jump at ${time}`);
    assert.ok(Math.abs(pose.angle-previous.angle)<1, `banking jump at ${time}`);
    if(time>3400)assert.ok(speed>.01, `unrequested pause at ${time}`);
    previous=pose;previousSpeed=speed;
  }
});
test("PHARM-MOTION-02 takeoff begins at the logo and the same smooth path closes without a seam", () => {
  const flight=motion.butterflyFlight(area());
  assert.deepEqual(motion.butterflyPose(flight,0).point,area().source);
  for(const time of [7600,11710,13900,24000,48000]){
    const before=motion.butterflyPose(flight,time-.1),at=motion.butterflyPose(flight,time),after=motion.butterflyPose(flight,time+.1);
    const a={x:(at.point.x-before.point.x)/.1,y:(at.point.y-before.point.y)/.1},b={x:(after.point.x-at.point.x)/.1,y:(after.point.y-at.point.y)/.1};
    assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<.002,`seam at ${time}`);
  }
  assert.ok(flight.samples.length<=769);
});
test("PHARM-MOTION-03 trail is distance-based, frame-rate independent, bounded and always ends at the sprite tip", () => {
  for(const step of [8,16,33]){
    const history:motion.Point[]=[],flight=motion.butterflyFlight(area());
    for(let time=0;time<90000;time+=step){
      const tip=motion.butterflyPose(flight,time).tip,trail=motion.updateFlightTrail(history,tip,260);
      assert.deepEqual(trail.at(-1),tip);
      assert.ok(history.length<=133);
      assert.ok(length(trail)<=260.001);
      if(time>12000)assert.ok(Math.abs(length(trail)-260)<.001,`trail collapsed at ${time}/${step}`);
    }
  }
});
test("PHARM-FLIGHT-01 movement continues for as long as processing takes without a second routine",()=>{
  const flight=motion.butterflyFlight(area());
  for(const time of [18000,40000,90000]){
    const a=motion.butterflyPose(flight,time),b=motion.butterflyPose(flight,time+500);
    assert.ok(Math.hypot(a.point.x-b.point.x,a.point.y-b.point.y)>10);
  }
});
test("PHARM-FLIGHT-02 banking and subtle flutter keep the trail tip attached exactly",()=>{
  const flight=motion.butterflyFlight(area());
  for(let time=0;time<30000;time+=23){
    const pose=motion.butterflyPose(flight,time),offset=flight.shellSize*.36*pose.scale,radians=pose.angle*Math.PI/180;
    assert.ok(Math.abs(pose.tip.x-pose.point.x-offset*(Math.cos(radians)+Math.sin(radians)))<.001);
    assert.ok(Math.abs(pose.tip.y-pose.point.y-offset*(Math.sin(radians)-Math.cos(radians)))<.001);
    assert.ok(Math.abs(pose.angle)<16);
  }
});
test("PHARM-FLIGHT-03 landing preserves entry velocity and eases into an exact stationary destination",()=>{
  const flight=motion.butterflyFlight(area()),target=area().source;
  const pose=(time:number)=>motion.landButterflyPose(motion.butterflyPose(flight,18123+time),target,38/82,82,time/1200);
  assert.deepEqual(pose(0).point,motion.butterflyPose(flight,18123).point);
  const before=motion.butterflyPose(flight,18122).point,start=pose(0).point,after=pose(1).point;
  assert.ok(Math.hypot(start.x-before.x-(after.x-start.x),start.y-before.y-(after.y-start.y))<.002);
  assert.deepEqual(pose(1200).point,target);assert.deepEqual(pose(9000).point,target);
  assert.equal(pose(1200).angle,0);assert.equal(pose(1200).scale,38/82);
  assert.ok(Math.hypot(pose(1199).point.x-target.x,pose(1199).point.y-target.y)<.001);
});
test("PHARM-FLIGHT-04 single flight stays inside the supplied visible mobile area",()=>{
  const input=area(240),flight=motion.butterflyFlight(input);
  for(let time=3400;time<90000;time+=100){
    const pose=motion.butterflyPose(flight,time);
    assert.ok(pose.point.x>=input.left&&pose.point.x<=input.left+input.width);
    assert.ok(pose.point.y>=input.top&&pose.point.y<=input.top+input.height);
  }
});
