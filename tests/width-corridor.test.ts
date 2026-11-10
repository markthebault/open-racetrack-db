import { test } from "node:test";
import assert from "node:assert/strict";
import { widthCorridor } from "../src/width-corridor";
import type { Position } from "../src/geo";
test("the car envelope is checked against both actual edges, including yaw", () => {
  const c = Array.from({ length: 101 }, (_, x) => ({ x, z: 0 })),
    left = c.map((p) => [p.x, -5] as Position),
    right = c.map((p) => [p.x, 5] as Position),
    road = widthCorridor(left, right, c, false, 1, 10);
  assert.equal(road.clearance(50, 0, 50), 5);
  assert.equal(road.clearance(50, 6, 50), -1);
  assert.ok(
    road.feasible(
      50,
      { x: 50, z: 3.8, y: 0 },
      { x: 49, z: 3.8, y: 0 },
      { x: 51, z: 3.8, y: 0 },
    ),
  );
  assert.ok(
    !road.feasible(
      50,
      { x: 50, z: 3.95, y: 0 },
      { x: 49, z: 3.95, y: 0 },
      { x: 51, z: 3.95, y: 0 },
    ),
  );
  assert.ok(
    !road.feasible(
      50,
      { x: 50, z: 2.9, y: 0 },
      { x: 49, z: 2.32265, y: 0 },
      { x: 51, z: 3.47735, y: 0 },
    ),
  );
});
test("a bridge crossing cannot borrow road space from its other source visit", () => {
  const horizontal = Array.from({ length: 101 }, (_, i) => ({
    x: i - 50,
    z: 0,
    nx: 0,
    nz: 1,
  }));
  const join = Array.from({ length: 60 }, (_, i) => ({
    x: 50 - ((i + 1) * 50) / 60,
    z: (-(i + 1) * 50) / 60,
    nx: 1,
    nz: 0,
  }));
  const vertical = Array.from({ length: 101 }, (_, i) => ({
    x: 0,
    z: i - 50,
    nx: 1,
    nz: 0,
  }));
  const centres = [...horizontal, ...join, ...vertical],
    left = centres.map((p) => [p.x + p.nx * 5, p.z + p.nz * 5] as Position),
    right = centres.map((p) => [p.x - p.nx * 5, p.z - p.nz * 5] as Position);
  const road = widthCorridor(left, right, centres, false, 1, 10);
  assert.ok(road.clearance(0, 7, 50) < 0);
  assert.ok(road.clearance(0, 7, 211) > 4.9);
});
