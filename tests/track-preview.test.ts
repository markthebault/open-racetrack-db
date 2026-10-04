import { test } from "node:test";
import assert from "node:assert/strict";
import { planarCourse, previewPath } from "../src/track-preview";
import type { Position } from "../src/geo";

test("course views preserve metre proportions at high latitude rather than stretching longitude", () => {
  const paths: Position[][] = [
    [
      [10, 60],
      [10.002, 60],
      [10.002, 60.001],
      [10, 60.001],
      [10, 60],
    ],
  ];
  const result = planarCourse(paths);
  assert.ok(Math.abs(result.width / result.height - 1) < 0.001);
  assert.ok(Math.abs(result.origin[0] - 10.001) < 1e-10);
  assert.ok(Math.abs(result.origin[1] - 60.0005) < 1e-10);
  assert.ok(result.paths[0][0][1] < result.paths[0][2][1]);
});

test("thumbnail simplification keeps separate paths and open endpoints without joining gaps", () => {
  const paths: Position[][] = [
    [
      [0, 0],
      [0.001, 0],
      [0.002, 0],
    ],
    [
      [0.004, 0],
      [0.005, 0],
      [0.006, 0],
    ],
  ];
  const preview = previewPath(paths);
  assert.equal((preview.match(/M/g) ?? []).length, 2);
  assert.equal((preview.match(/L/g) ?? []).length, 2);
  assert.equal(preview, "M6.0,32.0L23.3,32.0M40.7,32.0L58.0,32.0");
  assert.deepEqual(paths[0], [
    [0, 0],
    [0.001, 0],
    [0.002, 0],
  ]);
});
