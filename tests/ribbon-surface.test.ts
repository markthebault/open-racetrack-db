import { test } from "node:test";
import assert from "node:assert/strict";
import { ribbonFootprint, footprintArea, groundFootprintFromRings, groundClearanceM, groundSegmentClearanceM, triangulateGroundFootprint } from "../src/ribbon-surface";
import type { Position } from "../src/geo";

function crossing() {
  // A two-metre corridor, including a closed upper lobe and two open ends.
  const left: Position[] = [[-5, 1], [4, 1], [4, 4], [1, 4], [1, -5]],
    right: Position[] = [[-5, -1], [6, -1], [6, 6], [-1, 6], [-1, -5]];
  return { left, right };
}

test("a shared corridor becomes one non-overlapping surface and keeps its grass-island hole", () => {
  const { left, right } = crossing(), before = structuredClone({ left, right }),
    footprint = ribbonFootprint(left, right, false);
  assert.equal(footprint.length, 1);
  assert.equal(footprint[0].length, 2);
  // The strips sum to 60 m²; their crossing shares 4 m² of physical pavement.
  assert.equal(footprintArea(footprint), 56);
  assert.deepEqual({ left, right }, before);
});

test("triangulation covers the union once with one world-coordinate height field", () => {
  const { left, right } = crossing(), footprint = ribbonFootprint(left, right, false),
    height = ([x, z]: Position) => 30 + 0.02 * x + 0.03 * z,
    surface = triangulateGroundFootprint(footprint, height, 0.08),
    p = surface.geometry.getAttribute("position"), normals = surface.geometry.getAttribute("normal"),
    indices = surface.geometry.getIndex()!;
  let sum = 0;
  for (let i = 0; i < indices.count; i += 3) {
    const [a, b, c] = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
    sum += Math.abs((p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a)) -
      (p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a))) / 2;
  }
  assert.equal(sum, 56);
  for (let i = 0; i < p.count; i++) {
    assert.ok(Math.abs(p.getY(i) - height([p.getX(i), p.getZ(i)]) - 0.08) < 1e-5);
    assert.ok(normals.getY(i) > 0.99);
  }
  surface.geometry.dispose();
});

test("repeating the physical loop does not duplicate its surface or change its holes", () => {
  const left: Position[] = [[-4, -4], [4, -4], [4, 4], [-4, 4], [-4, -4]],
    right: Position[] = [[-6, -6], [6, -6], [6, 6], [-6, 6], [-6, -6]],
    first = ribbonFootprint(left, right, true),
    repeated = ribbonFootprint([...left.slice(0, -1), ...left], [...right.slice(0, -1), ...right], true);
  assert.equal(footprintArea(first), 80);
  assert.deepEqual(repeated, first);
});

test("saved touching area rings resolve into physical grass holes without re-pairing their vertices", () => {
  const outer: Position[][] = [[[-6, -6], [6, -6], [6, 6], [-6, 6], [-6, -6]]],
    inner: Position[][] = [[[0, 0], [-4, 0], [-4, 4], [0, 4], [0, 0], [4, 0], [4, -4], [0, -4], [0, 0]]],
    before = structuredClone({ outer, inner }), footprint = groundFootprintFromRings(outer, inner),
    surface = triangulateGroundFootprint(footprint, () => 40);
  assert.equal(footprintArea(footprint), 112);
  assert.deepEqual({ outer, inner }, before);
  assert.ok(surface.triangles > 0);
  surface.geometry.dispose();
  assert.throws(() => groundFootprintFromRings([], inner), /finite closed rings/);
  assert.throws(() => groundFootprintFromRings(outer, outer), /no paved area/);
});

test("physical clearance distinguishes road centre containment from car-body safety and grass holes", () => {
  const footprint = groundFootprintFromRings(
    [[[-5, -5], [5, -5], [5, 5], [-5, 5], [-5, -5]]],
    [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]],
  );
  assert.equal(groundClearanceM(footprint, [0, 0]), -1);
  assert.equal(groundClearanceM(footprint, [3, 0]), 2);
  assert.equal(groundClearanceM(footprint, [7, 0]), -2);
  assert.equal(Math.abs(groundClearanceM(footprint, [5, 0])), 0);
  const nearGrass = groundClearanceM(footprint, [1.2, 0]);
  assert.ok(nearGrass > 0 && nearGrass < 0.9, "A contained centre can leave a 1.8 m car straddling grass");
  assert.equal(groundSegmentClearanceM(footprint, [3, -2], [3, 2]), 2);
  assert.equal(groundSegmentClearanceM(footprint, [-3, 0], [3, 0]), 0,
    "Paved endpoints cannot hide a grass shortcut between them");
  assert.equal(groundSegmentClearanceM(footprint, [3, 0], [7, 0]), -2);
});

test("large shared surfaces retain interior terrain and subdivide adjoining faces without cracks", () => {
  const footprint = ribbonFootprint([[0, 0], [80, 0]], [[0, 80], [80, 80]], false),
    height = ([x, z]: Position) => 5 * Math.sin(Math.PI * x / 80) * Math.sin(Math.PI * z / 80),
    surface = triangulateGroundFootprint(footprint, height),
    p = surface.geometry.getAttribute("position"), indices = surface.geometry.getIndex()!,
    edges = new Map<string, { a: number; b: number; count: number }>();
  let area = 0, highest = 0;
  for (let i = 0; i < p.count; i++) {
    assert.ok(Math.abs(p.getY(i) - height([p.getX(i), p.getZ(i)])) < 1e-5);
    highest = Math.max(highest, p.getY(i));
  }
  assert.equal(highest, 5);
  for (let i = 0; i < indices.count; i += 3) {
    const face = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
    const [a, b, c] = face;
    area += Math.abs((p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a)) -
      (p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a))) / 2;
    for (let k = 0; k < 3; k++) {
      const a = face[k], b = face[(k + 1) % 3], key = a < b ? `${a}:${b}` : `${b}:${a}`;
      assert.ok(Math.hypot(p.getX(a) - p.getX(b), p.getZ(a) - p.getZ(b)) <= 20 + 1e-6);
      const edge = edges.get(key) ?? { a, b, count: 0 };
      edge.count++;
      edges.set(key, edge);
    }
  }
  assert.equal(area, 6400);
  for (const { a, b, count } of edges.values()) {
    assert.ok(count === 1 || count === 2);
    if (count === 1) assert.ok(
      (p.getX(a) === p.getX(b) && [0, 80].includes(p.getX(a))) ||
      (p.getZ(a) === p.getZ(b) && [0, 80].includes(p.getZ(a))),
      "Only exterior edges may belong to a single face",
    );
  }
  surface.geometry.dispose();
});

test("invalid station order, missing terrain and mismatched edges fail instead of inventing geometry", () => {
  const { left, right } = crossing();
  assert.throws(() => ribbonFootprint(left, right.slice(1), false), /matching finite/);
  const folded = structuredClone(right);
  folded[1] = [4, 2];
  assert.throws(() => ribbonFootprint(left, folded, false), /folded or degenerate/);
  const footprint = ribbonFootprint(left, right, false);
  assert.throws(() => triangulateGroundFootprint(footprint, () => NaN), /height is unavailable/);
  assert.throws(() => triangulateGroundFootprint(footprint, () => 0, 0, 0), /empty or invalid/);
});
