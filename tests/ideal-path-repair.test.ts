import { test } from "node:test";
import assert from "node:assert/strict";
import { repairIdealPath } from "../scripts/ideal-path-repair";
import { edgeChecker } from "../scripts/ideal-clearance";
import { insideRing } from "../src/boundary-path";
import type { Position } from "../src/geo";
const square = (r: number): Position[] => [
  [-r, -r],
  [r, -r],
  [r, r],
  [-r, r],
  [-r, -r],
];
test("short corner cut is repaired inside the unchanged source footprint", () => {
  const rings = [square(3), square(10)],
    clearance = edgeChecker(rings),
    points = [
      { x: -5, z: 0, y: 0 },
      { x: 0, z: -5, y: 1 },
    ],
    before = structuredClone(points);
  const result = repairIdealPath(points, false, rings, clearance, 0.5);
  assert.ok(result.length > 2);
  assert.deepEqual(points, before);
  assert.deepEqual(result[0], points[0]);
  assert.deepEqual(result.at(-1), points.at(-1));
  for (let i = 1; i < result.length; i++) {
    const a = result[i - 1],
      b = result[i],
      n = Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.1);
    for (let j = 0; j <= n; j++) {
      const t = j / n,
        p: Position = [a.x * (1 - t) + b.x * t, -a.z * (1 - t) - b.z * t];
      assert.ok(clearance(p) >= 0.5 - 1e-8);
      assert.notEqual(insideRing(p, rings[0]), insideRing(p, rings[1]));
    }
  }
});
test("a corridor that cannot accommodate the envelope is rejected rather than widened", () => {
  const rings = [square(3.9), square(4)],
    clearance = edgeChecker(rings);
  assert.throws(
    () =>
      repairIdealPath(
        [
          { x: -3.95, z: 0, y: 0 },
          { x: 0, z: -3.95, y: 0 },
        ],
        false,
        rings,
        clearance,
        0.2,
      ),
    /endpoints/,
  );
});

test("a local backtracking loop is removed while retaining the circuit around the source island", async () => {
  const { removeIdealLoops } = await import("../scripts/ideal-path-topology");
  const { assertSeparateSimpleRings } = await import("../src/boundary-path");
  const p = [
    [-5, -5],
    [5, -5],
    [5, 5],
    [0, 5],
    [1, 7],
    [-1, 7],
    [0, 5],
    [-5, 5],
  ].map(([x, z]) => ({ x, z, y: 0 }));
  const result = removeIdealLoops(p, [0, 0]);
  assert.ok(result.length < p.length);
  const ring = result.map((q) => [q.x, q.z] as Position);
  ring.push(ring[0]);
  assert.equal(insideRing([0, 0], ring), true);
  assertSeparateSimpleRings([ring]);
});
