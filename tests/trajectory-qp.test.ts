import { test } from "node:test";
import assert from "node:assert/strict";
import { optimizeTrajectory } from "../src/trajectory-qp";
import { IDEAL_CAR, G, lateralLimit } from "../src/ideal-line-model";
import type { Station } from "../scripts/ideal-line-solver";
const circle = (radius: number, width: number): Station[] => {
  const n = Math.ceil((2 * Math.PI * radius) / 1.5);
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return {
      x: radius * Math.cos(a),
      z: radius * Math.sin(a),
      nx: -Math.cos(a),
      nz: -Math.sin(a),
      y: 0,
      halfWidth: width / 2,
    };
  });
};
test("coupled QP reaches the analytic outside-radius solution on a closed circle, including its periodic seam", () => {
  const stations = circle(60, 12),
    before = structuredClone(stations);
  const out = optimizeTrajectory(stations, true, IDEAL_CAR, {
    timeRefinement: false,
  });
  assert.deepEqual(stations, before);
  assert.ok(out.diagnostics.qpConverged);
  assert.ok(out.diagnostics.converged);
  assert.ok(
    out.diagnostics.minimumCurvatureCost < out.diagnostics.centerCost * 0.9,
  );
  const target = 60 + 6 - IDEAL_CAR.widthM / 2 - 0.12;
  for (const p of out.points)
    assert.ok(Math.abs(Math.hypot(p.x, p.z) - target) < 0.02);
  assert.ok(
    Math.abs(out.profile.curvature[0] - out.profile.curvature.at(-1)!) < 1e-6,
  );
});
const chicane = (): Station[] =>
  Array.from({ length: 601 }, (_, i) => {
    const x = i * 1.5,
      z = 28 * Math.sin(x / 65),
      dz = (28 / 65) * Math.cos(x / 65),
      length = Math.hypot(1, dz);
    return { x, z, y: 0, nx: -dz / length, nz: 1 / length, halfWidth: 6 };
  });
test("refinement convergence uses a newly solved 3 m control grid, not subdivided chords", () => {
  const stations = chicane();
  const a = optimizeTrajectory(stations, false, IDEAL_CAR, {
    controlStepM: 6,
    timeRefinement: false,
  });
  const b = optimizeTrajectory(stations, false, IDEAL_CAR, {
    controlStepM: 3,
    timeRefinement: false,
  });
  assert.ok(a.diagnostics.converged && b.diagnostics.converged);
  const rms = Math.sqrt(
    a.points.reduce(
      (s, p, i) => s + (p.x - b.points[i].x) ** 2 + (p.z - b.points[i].z) ** 2,
      0,
    ) / stations.length,
  );
  assert.ok(rms < 0.3, `Grid-refinement RMS movement ${rms} m`);
  assert.ok(Math.abs(a.profile.duration / b.profile.duration - 1) < 0.02);
  for (const result of [a, b]) {
    assert.deepEqual(result.points[0], {
      x: stations[0].x,
      y: 0,
      z: stations[0].z,
    });
    assert.deepEqual(result.points.at(-1), {
      x: stations.at(-1)!.x,
      y: 0,
      z: stations.at(-1)!.z,
    });
  }
});
test("time refinement respects the fixed car model, improves its precise time and responds to power/grip changes", () => {
  const stations = chicane();
  const a = optimizeTrajectory(stations, false, IDEAL_CAR);
  const b = optimizeTrajectory(stations, false, {
    ...IDEAL_CAR,
    powerKw: 180,
    mechanicalG: 1.1,
    aeroGAt200: 0.1,
  });
  assert.ok(a.diagnostics.timeAccepted > 0);
  assert.ok(a.profile.duration < a.diagnostics.minimumCurvatureDurationS);
  assert.ok(b.profile.duration > a.profile.duration);
  assert.ok(
    a.points.some(
      (p, i) => Math.hypot(p.x - b.points[i].x, p.z - b.points[i].z) > 0.02,
    ),
  );
  for (const [out, car] of [
    [a, IDEAL_CAR],
    [b, { ...IDEAL_CAR, powerKw: 180, mechanicalG: 1.1, aeroGAt200: 0.1 }],
  ] as const)
    out.profile.speed.forEach((v, i) => {
      assert.ok(v <= car.topSpeedKph / 3.6 + 1e-7);
      assert.ok(
        (v * v * Math.abs(out.profile.curvature[i])) / G <=
          lateralLimit(v, car) + 1e-5,
      );
    });
});

test('minimum-time refinement does not confuse the minimum-curvature outer circle with the fastest circle',()=>{
 const stations=circle(60,12);
 const out=optimizeTrajectory(stations,true,IDEAL_CAR);
 const average=out.points.reduce((s,p)=>s+Math.hypot(p.x,p.z),0)/out.points.length;
 assert.ok(average<58,`time optimization must choose a shorter radius, got ${average}`);
 assert.ok(out.profile.duration<out.diagnostics.minimumCurvatureDurationS);
});
