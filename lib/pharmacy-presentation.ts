export type PharmacyPhase =
  | "inputs"
  | "rain"
  | "clarity"
  | "selected"
  | "matching"
  | "waiting"
  | "ready"
  | "failed";
export function pharmacyPresentationPhase(input: {
  phase: PharmacyPhase;
  formulaReady: boolean;
  ready: boolean;
  failed: boolean;
}): PharmacyPhase {
  if (input.ready) return "ready";
  if (input.failed) return "failed";
  if (input.formulaReady)
    return input.phase === "selected" ? "selected" : "matching";
  if (["selected", "matching", "ready"].includes(input.phase)) return "waiting";
  return input.phase;
}
export const pharmacyRainWords = [
  "Vitamin A",
  "Vitamin B1",
  "Vitamin B2",
  "Vitamin B3",
  "Vitamin B5",
  "Vitamin B6",
  "Vitamin B7",
  "Vitamin B9",
  "Vitamin B12",
  "Vitamin C",
  "Vitamin D3",
  "Vitamin E",
  "Vitamin K2",
  "Calcium",
  "Magnesium",
  "Iron",
  "Zinc",
  "Copper",
  "Selenium",
  "Iodine",
  "Chromium",
  "Manganese",
  "Molybdenum",
  "Boron",
  "Potassium",
  "Choline",
  "Inositol",
  "L-Carnitine",
  "L-Arginine",
  "L-Lysine",
  "Taurine",
  "L-Theanine",
  "CoQ10",
  "Creatine",
  "Omega-3",
  "Curcumin",
  "Ginseng",
  "Ashwagandha",
  "Rhodiola",
  "Glycine",
  "Collagen",
  "Probiotics",
  "Beta-carotene",
  "Astaxanthin",
  "Lutein",
  "Lycopene",
  "Quercetin",
  "Resveratrol",
  "Alpha-lipoic acid",
  "NAC",
  "GABA",
  "Glucosamine",
  "MSM",
  "Beta-glucan",
];
export function pharmacyRainStyle(index: number) {
  return {
    x: 3 + ((index * 29) % 90),
    delay: (index % 17) * 0.13,
    duration: 2.8 + (index % 6) * 0.15,
    drift: (index % 2 ? 1 : -1) * (8 + (index % 4) * 4),
  };
}
export type Point = { x: number; y: number };
export type Curve = { p0: Point; c1: Point; c2: Point; p1: Point };
/** Exact v2.5 geometry, measured against local DOM anchors rather than viewport coordinates. */
export function clarityFlight({
  width,
  height,
  source,
  questions,
  core: corePoint,
  shellSize,
}: {
  width: number;
  height: number;
  source: Point;
  questions: Point[];
  core: Point;
  shellSize: number;
}) {
  const tipOffset = shellSize * 0.36;
  const touchPoint = (point: Point) => ({
    x: point.x - tipOffset,
    y: point.y + tipOffset,
  });
  const approach = {
    x: corePoint.x + shellSize * 1.14,
    y: corePoint.y + shellSize * 0.58,
  };
  const points = [
    source,
    ...questions.map(touchPoint),
    approach,
    touchPoint(corePoint),
  ];
  const segments: Curve[] = [
    {
      p0: points[0],
      c1: { x: points[0].x + width * 0.04, y: points[0].y + height * 0.3 },
      c2: { x: points[1].x - width * 0.14, y: points[1].y - height * 0.19 },
      p1: points[1],
    },
    {
      p0: points[1],
      c1: { x: points[1].x + width * 0.24, y: points[1].y - height * 0.17 },
      c2: { x: points[2].x - width * 0.23, y: points[2].y - height * 0.16 },
      p1: points[2],
    },
    {
      p0: points[2],
      c1: { x: points[2].x + width * 0.04, y: points[2].y + height * 0.27 },
      c2: { x: points[3].x + width * 0.21, y: points[3].y - height * 0.08 },
      p1: points[3],
    },
    {
      p0: points[3],
      c1: { x: points[3].x + width * 0.18, y: points[3].y + height * 0.12 },
      c2: { x: points[4].x - width * 0.1, y: points[4].y + height * 0.12 },
      p1: points[4],
    },
    {
      p0: points[4],
      c1: {
        x: corePoint.x + shellSize * 1.42,
        y: corePoint.y - shellSize * 1.12,
      },
      c2: {
        x: corePoint.x - shellSize * 0.82,
        y: corePoint.y - shellSize * 1.38,
      },
      p1: points[5],
    },
  ];
  const arcs = segments.map((curve) => {
    const lengths = [0];
    let previous = curve.p0;
    for (let i = 1; i <= 128; i++) {
      const point = cubicPoint(curve, i / 128);
      lengths.push(lengths[i - 1] + Math.hypot(point.x - previous.x, point.y - previous.y));
      previous = point;
    }
    return lengths;
  });
  const route = { points, segments, arcs, shellSize };
  const samples: FlightPose[] = [];
  let distance = 0;
  // Compile once; the sprite and its drawn trail then use these same samples.
  for (let time = 0; time <= clarityDuration + 8; time += 8) {
    const pose = flightPose(route, Math.min(time, clarityDuration));
    const previous = samples.at(-1);
    if (previous) distance += Math.hypot(pose.tip.x - previous.tip.x, pose.tip.y - previous.tip.y);
    samples.push({ ...pose, distance });
  }
  const path = samples.map((pose, i) => `${i ? "L" : "M"} ${pose.tip.x.toFixed(4)} ${pose.tip.y.toFixed(4)}`).join(" ");
  return { points, segments, tapPoints: [...questions, corePoint], path, samples, distance };

}
export function cubicPoint(s: Curve, t: number): Point {
  const inverse = 1 - t,
    a = inverse ** 3,
    b = 3 * inverse ** 2 * t,
    c = 3 * inverse * t * t,
    d = t ** 3;
  return {
    x: a * s.p0.x + b * s.c1.x + c * s.c2.x + d * s.p1.x,
    y: a * s.p0.y + b * s.c1.y + c * s.c2.y + d * s.p1.y,
  };
}
export function smootherStep(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
}
export const clarityStages = [
  { type: "launch", point: 0, duration: 220 },
  { type: "move", segment: 0, duration: 650 },
  { type: "hold", point: 1, tap: 0, duration: 230 },
  { type: "move", segment: 1, duration: 510 },
  { type: "hold", point: 2, tap: 1, duration: 230 },
  { type: "move", segment: 2, duration: 510 },
  { type: "hold", point: 3, tap: 2, duration: 230 },
  { type: "move", segment: 3, duration: 420 },
  { type: "move", segment: 4, duration: 610 },
  { type: "hold", point: 5, tap: 3, duration: 500 },
] as const;

const clarityDuration = clarityStages.reduce((total, stage) => total + stage.duration, 0);
type FlightPose = { point: Point; tip: Point; angle: number; scale: number; distance: number; time: number; tap: number | null; moving: boolean };

function flightPose(route: { points: Point[]; segments: Curve[]; arcs: number[][]; shellSize: number }, time: number): FlightPose {
  let start = 0;
  let stage: (typeof clarityStages)[number] = clarityStages[clarityStages.length - 1];
  for (const candidate of clarityStages) {
    if (time <= start + candidate.duration) { stage = candidate; break; }
    start += candidate.duration;
  }
  const local = Math.max(0, Math.min(1, (time - start) / stage.duration));
  const envelope = Math.sin(Math.PI * local) ** 2;
  let point: Point, angle: number;
  if (stage.type === "move") {
    const curve = route.segments[stage.segment], lengths = route.arcs[stage.segment];
    const distance = smootherStep(local) * lengths[lengths.length - 1];
    let low = 0, high = lengths.length - 1;
    while (high - low > 1) { const middle = (low + high) >> 1; if (lengths[middle] < distance) low = middle; else high = middle; }
    const t = (low + (distance - lengths[low]) / (lengths[high] - lengths[low] || 1)) / 128;
    point = cubicPoint(curve, t);
    const before = cubicPoint(curve, Math.max(0, t - 0.001)), after = cubicPoint(curve, Math.min(1, t + 0.001));
    // Banking has no atan2 wrap and eases to zero at every stop.
    angle = 8 * envelope * (after.x - before.x) / (Math.hypot(after.x - before.x, after.y - before.y) || 1);
  } else {
    const base = route.points[stage.point];
    point = { x: base.x + Math.sin(local * Math.PI * 2) * 3.5 * envelope, y: base.y - envelope * 5.5 };
    angle = stage.type === "hold" ? envelope * 6 : 0;
  }
  const scale = stage.type === "move" ? 1 : 1 + envelope * 0.08;
  const tip = route.shellSize * 0.36 * scale, radians = angle * Math.PI / 180;
  return { point, angle, scale, time, distance: 0, moving: stage.type === "move", tap: "tap" in stage ? stage.tap : null,
    tip: { x: point.x + tip * (Math.cos(radians) + Math.sin(radians)), y: point.y + tip * (Math.sin(radians) - Math.cos(radians)) } };
}

/** One position/distance clock drives the transform, sparks and visible trail. */
export function clarityPose(flight: ReturnType<typeof clarityFlight>, time: number): FlightPose {
  const bounded = Math.max(0, Math.min(clarityDuration, time));
  const index = Math.min(Math.floor(bounded / 8), flight.samples.length - 2);
  const a = flight.samples[index], b = flight.samples[index + 1], mix = (bounded - a.time) / (b.time - a.time || 1);
  const value = (x: number, y: number) => x + (y - x) * mix;
  return { ...a, time: bounded, point: { x: value(a.point.x,b.point.x), y: value(a.point.y,b.point.y) },
    tip: { x: value(a.tip.x,b.tip.x), y: value(a.tip.y,b.tip.y) }, angle: value(a.angle,b.angle), scale: value(a.scale,b.scale), distance: value(a.distance,b.distance) };
}

export type ButterflyPose = { point: Point; tip: Point; angle: number; scale: number };
type ButterflyArea = { left: number; top: number; width: number; height: number; source: Point; shellSize: number };
const butterflyControls = [[.08,.35],[.16,.08],[.65,.08],[.94,.32],[.77,.88],[.48,.59],[.14,.93],[.08,.58],[.40,.32],[.75,.13],[.93,.72],[.49,.94]];

/** A periodic cubic B-spline: continuous position, velocity and curvature at every join. */
function butterflySpline(points: Point[], position: number) {
  const index = Math.floor(position) % points.length, t = position - Math.floor(position), inverse = 1 - t;
  const weights = [inverse ** 3 / 6, (3*t**3-6*t*t+4)/6, (-3*t**3+3*t*t+3*t+1)/6, t**3/6];
  const slopes = [-inverse*inverse/2, (9*t*t-12*t)/6, (-9*t*t+6*t+3)/6, t*t/2];
  const point = {x:0,y:0}, tangent = {x:0,y:0};
  for (let n=0;n<4;n++) {
    const p=points[(index+n)%points.length];
    point.x+=p.x*weights[n];point.y+=p.y*weights[n];
    tangent.x+=p.x*slopes[n];tangent.y+=p.y*slopes[n];
  }
  return {point,tangent};
}

export function butterflyFlight(area: ButterflyArea) {
  const controls=butterflyControls.map(([x,y])=>({x:area.left+x*area.width,y:area.top+y*area.height}));
  const samples=[0];let length=0,previous=butterflySpline(controls,0).point;
  for(let i=1;i<=controls.length*64;i++) {
    const point=butterflySpline(controls,i/64).point;
    length+=Math.hypot(point.x-previous.x,point.y-previous.y);samples.push(length);previous=point;
  }
  return {...area,controls,samples,length};
}

export function butterflyPose(flight: ReturnType<typeof butterflyFlight>, time: number): ButterflyPose {
  const elapsed=Math.max(0,time), distance=((elapsed%24000)/24000)*flight.length;
  let low=0,high=flight.samples.length-1;
  while(high-low>1){const middle=(low+high)>>1;if(flight.samples[middle]<distance)low=middle;else high=middle;}
  const position=(low+(distance-flight.samples[low])/(flight.samples[high]-flight.samples[low]||1))/64;
  const {point,tangent}=butterflySpline(flight.controls,position), blend=smootherStep(elapsed/3400);
  return butterflyTip({
    point:{x:flight.source.x+(point.x-flight.source.x)*blend,y:flight.source.y+(point.y-flight.source.y)*blend},
    angle:(10*tangent.x/(Math.hypot(tangent.x,tangent.y)||1)+1.5*Math.sin(elapsed/1100))*blend,
    scale:38/flight.shellSize+(1+.012*Math.sin(elapsed/700)-38/flight.shellSize)*blend,
  },flight.shellSize);
}

export function landButterflyPose(pose: ButterflyPose,target: Point,scale: number,shellSize: number,progress: number): ButterflyPose {
  const blend=smootherStep(progress);
  return butterflyTip({
    point:blend===1?target:{x:pose.point.x+(target.x-pose.point.x)*blend,y:pose.point.y+(target.y-pose.point.y)*blend},
    angle:blend===1?0:pose.angle*(1-blend),scale:blend===1?scale:pose.scale+(scale-pose.scale)*blend,
  },shellSize);
}

function butterflyTip(pose: Omit<ButterflyPose,"tip">,shellSize: number): ButterflyPose {
  const offset=shellSize*.36*pose.scale,radians=pose.angle*Math.PI/180;
  return {...pose,tip:{x:pose.point.x+offset*(Math.cos(radians)+Math.sin(radians)),y:pose.point.y+offset*(Math.sin(radians)-Math.cos(radians))}};
}

export const MAGIC_DUST_CAPACITY = 96;
// The longer fade still fits in the same 96-slot render pool.
const MAGIC_DUST_INTERVAL_MS = 24;
type DustParticle = { id: number; born: number; origin: Point; life: number };
export function createMagicDust() {
  return {
    particles: [] as DustParticle[],
    previous: null as { origin: Point; time: number } | null,
    nextEmission: 0,
    sequence: 0,
  };
}

/** Emit on the flight clock, interpolate births at the supplied origin, and reuse a bounded pool. */
export function stepMagicDust(state: ReturnType<typeof createMagicDust>, origin: Point, time: number, emit = true) {
  const previous = state.previous ?? { origin, time };
  // A late frame never creates an unbounded backlog of invisible particles.
  const skipped = Math.max(0, Math.floor((time - state.nextEmission) / MAGIC_DUST_INTERVAL_MS) + 1 - MAGIC_DUST_CAPACITY);
  state.nextEmission += skipped * MAGIC_DUST_INTERVAL_MS;
  state.sequence += skipped;
  while (state.nextEmission <= time) {
    const born = state.nextEmission, id = state.sequence++;
    const mix = Math.max(0, Math.min(1, (born - previous.time) / (time - previous.time || 1)));
    if (emit) state.particles.push({
      id, born, life: 1800 + (id % 6) * 80,
      origin: { x: previous.origin.x + (origin.x - previous.origin.x) * mix, y: previous.origin.y + (origin.y - previous.origin.y) * mix },
    });
    state.nextEmission += MAGIC_DUST_INTERVAL_MS;
  }
  state.previous = { origin, time };
  state.particles = state.particles.filter(p => time - p.born < p.life);
  return state.particles.map(p => {
    const age = time - p.born, progress = age / p.life;
    return {
      id: p.id,
      point: {
        x: p.origin.x + Math.sin(p.id * 2.399) * (14 + p.id % 7 * 5) * Math.sqrt(progress),
        y: p.origin.y + (12 + p.id % 7 * 2) * progress * progress + Math.sin(p.id * 1.7) * Math.sqrt(progress) * 26,
      },
      opacity: smootherStep(age / 16) * (1 - progress) ** 2 * (.72 + .28 * Math.sin(age / 130 + p.id * .7) ** 2),
      scale: (.65 + p.id % 5 * .16) * (1 - progress * .5),
      angle: p.id * 137.5 % 180 + age * .025,
    };
  });
}

/** Resizing blends the same trajectory without moving its origin abruptly. */
export function blendButterflyPoses(a: ButterflyPose,b: ButterflyPose,shellSize: number,blend: number): ButterflyPose {
  return butterflyTip({point:{x:a.point.x+(b.point.x-a.point.x)*blend,y:a.point.y+(b.point.y-a.point.y)*blend},angle:a.angle+(b.angle-a.angle)*blend,scale:a.scale+(b.scale-a.scale)*blend},shellSize);
}
