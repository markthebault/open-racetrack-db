import { test } from "node:test";
import assert from "node:assert/strict";
import { pathCrossings } from "../src/path-crossings";
import type { Position } from "../src/geo";

test("a closed figure eight identifies both route stations without assuming road levels", () => {
  const hits = pathCrossings(
    [
      [-10, -10],
      [10, 10],
      [-10, 10],
      [10, -10],
    ],
    true,
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, "crossing");
  assert.deepEqual(hits[0].segments, [0, 2]);
  assert.deepEqual(hits[0].fractions, [0.5, 0.5]);
  assert.deepEqual(hits[0].point, [0, 0]);
  assert.ok(Math.abs(hits[0].stations[0] - Math.sqrt(200)) < 1e-9);
  assert.ok(hits[0].stations[1] > hits[0].stations[0] + 40);
});

test("an ordinary closed seam, repeated consecutive coordinates and an open hairpin are harmless", () => {
  const ring: Position[] = [
    [0, 0],
    [10, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];
  assert.deepEqual(pathCrossings(ring, true), []);
  assert.deepEqual(pathCrossings(ring.slice(0, -1), true), []);
  assert.deepEqual(
    pathCrossings([
      [0, 0],
      [10, 0],
      [10, 0.01],
      [0, 0.01],
    ]),
    [],
  );
});

test("a crossing at a shared source vertex is deduplicated, including the closed seam", () => {
  const path: Position[] = [
    [-10, -10],
    [0, 0],
    [10, 10],
    [-10, 10],
    [0, 0],
    [10, -10],
  ];
  const hits = pathCrossings(path, true);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, "touch");
  assert.deepEqual(hits[0].point, [0, 0]);
  const rotated = [...path.slice(1), path[0]];
  const seamHits = pathCrossings(rotated, true);
  assert.equal(seamHits.length, 1);
  assert.equal(seamHits[0].stations[0], 0);
  assert.deepEqual(seamHits[0].point, [0, 0]);
});

test("an open route endpoint touching an earlier branch remains a topology conflict", () => {
  const path: Position[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 0],
  ];
  assert.equal(pathCrossings(path).length, 1);
  assert.deepEqual(pathCrossings(path, true), []);
});

test("collinear retraced sections are reported, including an adjacent reversal", () => {
  const hits = pathCrossings([
    [0, 0],
    [10, 0],
    [5, 0],
  ]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, "overlap");
  assert.deepEqual(hits[0].point, [7.5, 0]);
  const other = pathCrossings([
    [0, 0],
    [20, 0],
    [20, 20],
    [15, 0],
    [5, 0],
  ]);
  assert.ok(other.some((hit) => hit.kind === "overlap"));
});

test("spatial cell boundaries and scale do not hide a crossing", () => {
  const hits = pathCrossings([
    [100, 100],
    [300, 300],
    [100, 300],
    [300, 100],
  ]);
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0].point, [200, 200]);
  assert.deepEqual(pathCrossings([]), []);
  assert.throws(
    () =>
      pathCrossings([
        [0, NaN],
        [1, 1],
      ]),
    /finite/,
  );
});
