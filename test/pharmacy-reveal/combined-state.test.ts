import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const model = () => import("../../lib/pharmacy-presentation.ts");

test("PHARM-COMBINE-01 pending pharmacy reveal stays on its canonical page", () => {
  const route = readFileSync(
    "app/[locale]/retail/[pharmacy]/[step]/page.tsx",
    "utf8",
  );
  assert.doesNotMatch(
    route,
    /if \(!result\) redirect\(pharmacyPath\(locale, slug, "progress"/,
  );
  assert.match(route, /PharmacyCombined/);
});

test("PHARM-COMBINE-02 real readiness preempts every decorative phase without an added wait", async () => {
  const { pharmacyPresentationPhase } = await model();
  for (const phase of [
    "inputs",
    "rain",
    "clarity",
    "selected",
    "matching",
  ] as const)
    assert.equal(
      pharmacyPresentationPhase({
        phase,
        formulaReady: true,
        ready: true,
        failed: false,
      }),
      "ready",
    );
});

test("PHARM-COMBINE-03 timers cannot reveal invented ingredients or products", async () => {
  const { pharmacyPresentationPhase } = await model();
  assert.equal(
    pharmacyPresentationPhase({
      phase: "selected",
      formulaReady: false,
      ready: false,
      failed: false,
    }),
    "clarity",
  );
  assert.equal(
    pharmacyPresentationPhase({
      phase: "matching",
      formulaReady: true,
      ready: false,
      failed: false,
    }),
    "matching",
  );
  assert.equal(
    pharmacyPresentationPhase({
      phase: "ready",
      formulaReady: false,
      ready: false,
      failed: false,
    }),
    "clarity",
  );
  assert.equal(
    pharmacyPresentationPhase({
      phase: "rain",
      formulaReady: false,
      ready: false,
      failed: true,
    }),
    "failed",
  );
});

test("PHARM-COMBINE-04 completed empty formulas are real results rather than perpetual waiting", async () => {
  const { pharmacyPresentationPhase } = await model();
  assert.equal(
    pharmacyPresentationPhase({
      phase: "inputs",
      formulaReady: true,
      ready: true,
      failed: false,
    }),
    "ready",
  );
});

test("PHARM-COMBINE-05 rain follows the attachment's exact bounded distribution", async () => {
  const { pharmacyRainStyle } = await model();
  assert.deepEqual(pharmacyRainStyle(0), {
    x: 3,
    delay: 0,
    duration: 2.8,
    drift: -8,
  });
  const seventh = pharmacyRainStyle(7);
  assert.deepEqual(
    { x: seventh.x, drift: seventh.drift },
    { x: 26, drift: 20 },
  );
  assert.ok(
    Math.abs(seventh.delay - 0.91) < 1e-12 &&
      Math.abs(seventh.duration - 2.95) < 1e-12,
  );
  assert.equal(pharmacyRainStyle(17).delay, 0);
});

test("PHARM-COMBINE-06 supplied leaf flight retains all ten stages and exact easing", async () => {
  const { clarityStages, smootherStep } = await model();
  assert.deepEqual(
    clarityStages.map((s) => s.duration),
    [220, 650, 230, 510, 230, 510, 230, 420, 610, 500],
  );
  assert.equal(
    clarityStages.reduce((n, s) => n + s.duration, 0),
    4110,
  );
  assert.equal(smootherStep(0), 0);
  assert.equal(smootherStep(0.5), 0.5);
  assert.equal(smootherStep(1), 1);
  assert.equal(smootherStep(0.25), 0.103515625);
});

test("PHARM-COMBINE-07 exact spline ends at the three question tips and final core", async () => {
  const { clarityFlight, cubicPoint } = await model();
  const flight = clarityFlight({
    width: 650,
    height: 360,
    source: { x: 20, y: -100 },
    questions: [
      { x: 156, y: 122.4 },
      { x: 494, y: 136.8 },
      { x: 195, y: 273.6 },
    ],
    core: { x: 325, y: 213 },
    shellSize: 92,
  });
  assert.equal(flight.segments.length, 5);
  assert.deepEqual(flight.segments[0].c1, { x: 46, y: 8 });
  assert.ok(Math.abs(flight.segments[0].c2.x - 31.88) < 1e-12);
  assert.ok(Math.abs(flight.segments[0].c2.y - 87.12) < 1e-12);
  assert.deepEqual(cubicPoint(flight.segments[4], 1), { x: 291.88, y: 246.12 });
  assert.deepEqual(flight.tapPoints, [
    { x: 156, y: 122.4 },
    { x: 494, y: 136.8 },
    { x: 195, y: 273.6 },
    { x: 325, y: 213 },
  ]);
});

test("PHARM-COMBINE-08 saved formula appears immediately while product matching continues", async () => {
  const { pharmacyPresentationPhase } = await model();
  assert.equal(
    pharmacyPresentationPhase({
      phase: "inputs",
      formulaReady: true,
      ready: false,
      failed: false,
    }),
    "matching",
  );
});
