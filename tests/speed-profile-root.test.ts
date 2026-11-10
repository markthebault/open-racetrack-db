import { test } from "node:test";
import assert from "node:assert/strict";
import { speedProfile } from "../scripts/ideal-line-solver";
import { IDEAL_CAR } from "../src/ideal-line-model";
test("safeguarded Newton retains the precise bisection speed solution on grades and mixed corners", () => {
  const points = Array.from({ length: 800 }, (_, i) => ({
    x: i * 1.5,
    z: 30 * Math.sin((i * 1.5) / 45),
    y: 7 * Math.sin((i * 1.5) / 120),
  }));
  for (const closed of [false, true])
    for (const car of [
      IDEAL_CAR,
      { ...IDEAL_CAR, powerKw: 180, mechanicalG: 1.1, aeroGAt200: 0.1 },
    ]) {
      const a = speedProfile(points, closed, car, true, 100, 3),
        b = speedProfile(points, closed, car, true, 100, 3, "newton");
      assert.ok(Math.abs(a.duration - b.duration) < 0.0001);
      for (let i = 0; i < points.length; i++)
        assert.ok(Math.abs(a.speed[i] - b.speed[i]) < 0.0001);
    }
});

test("a local time window preserves its fixed entry and exit speeds", () => {
  const points = Array.from({ length: 601 }, (_, i) => ({
    x: i * 1.5,
    z: 5 * Math.sin(i / 80),
    y: 0,
  }));
  const a = speedProfile(points, false, IDEAL_CAR, true, 100, 3, "bisect", {
    exitSpeedKph: 80,
  });
  const b = speedProfile(points, false, IDEAL_CAR, true, 100, 3, "newton", {
    exitSpeedKph: 80,
  });
  assert.equal(b.speed[0], 100 / 3.6);
  assert.equal(b.speed.at(-1), 80 / 3.6);
  assert.ok(Math.abs(a.duration - b.duration) < 0.0001);
});
