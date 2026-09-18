export type PharmacyPhase =
  | "inputs"
  | "rain"
  | "clarity"
  | "selected"
  | "matching"
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
  if (["selected", "matching", "ready"].includes(input.phase))
    return input.formulaReady
      ? input.phase === "selected"
        ? "selected"
        : "matching"
      : "clarity";
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
  const magic = [
    source,
    ...questions,
    { x: approach.x + tipOffset, y: approach.y - tipOffset },
    corePoint,
  ];
  const magicSegments: Curve[] = [
    {
      p0: magic[0],
      c1: segments[0].c1,
      c2: { x: magic[1].x - width * 0.14, y: magic[1].y - height * 0.19 },
      p1: magic[1],
    },
    {
      p0: magic[1],
      c1: { x: magic[1].x + width * 0.24, y: magic[1].y - height * 0.17 },
      c2: { x: magic[2].x - width * 0.23, y: magic[2].y - height * 0.16 },
      p1: magic[2],
    },
    {
      p0: magic[2],
      c1: { x: magic[2].x + width * 0.04, y: magic[2].y + height * 0.27 },
      c2: { x: magic[3].x + width * 0.21, y: magic[3].y - height * 0.08 },
      p1: magic[3],
    },
    {
      p0: magic[3],
      c1: { x: magic[3].x + width * 0.18, y: magic[3].y + height * 0.12 },
      c2: { x: magic[4].x - width * 0.1, y: magic[4].y + height * 0.12 },
      p1: magic[4],
    },
    {
      p0: magic[4],
      c1: {
        x: corePoint.x + shellSize * 1.75,
        y: corePoint.y - shellSize * 1.45,
      },
      c2: {
        x: corePoint.x - shellSize * 0.5,
        y: corePoint.y - shellSize * 1.05,
      },
      p1: magic[5],
    },
  ];
  const path = magicSegments
    .map(
      (s, i) =>
        `${i === 0 ? `M ${s.p0.x.toFixed(1)} ${s.p0.y.toFixed(1)} ` : ""}C ${s.c1.x.toFixed(1)} ${s.c1.y.toFixed(1)} ${s.c2.x.toFixed(1)} ${s.c2.y.toFixed(1)} ${s.p1.x.toFixed(1)} ${s.p1.y.toFixed(1)}`,
    )
    .join(" ");
  return { points, segments, tapPoints: [...questions, corePoint], path };
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
