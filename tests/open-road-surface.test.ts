import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Layout } from "../schemas/data";
import { plane, bounds, length, type Position } from "../src/geo";
import {
  borderRoadGeometry,
  boundarySamples,
  boundaryCurbGeometry,
} from "../src/border-surface";
import { prepareSurfaceModel } from "../src/model-preparation";
import { borderLabels } from "../src/track-borders";

test("an open road rebuilds a bounded ribbon with distinct ends and left/right semantics", () => {
  const layout: Layout = JSON.parse(
    readFileSync(
      "data/united-states/us-apex-motor-b7ddcfd3/layouts/apex-i-straight.geojson",
      "utf8",
    ),
  );
  const terrain = layout.metadata.model3d!.terrain;
  const origin: Position = [
      (terrain.bounds[0] + terrain.bounds[2]) / 2,
      (terrain.bounds[1] + terrain.bounds[3]) / 2,
    ],
    p = plane(origin);
  const trace = [p.from([0, 0]), p.from([100, 0])],
    left = [p.from([0, 6]), p.from([100, 6])],
    right = [p.from([0, -6]), p.from([100, -6])];
  for (const f of layout.features) {
    f.geometry = {
      type: "LineString",
      coordinates:
        f.properties.role === "trace"
          ? trace
          : f.properties.role === "inner"
            ? left
            : right,
    };
  }
  layout.bbox = bounds([...trace, ...left, ...right]);
  layout.metadata.closed = false;
  layout.metadata.lengthM = length(trace);
  layout.metadata.borderInference!.edgeConvention = "left-right-along-trace";
  delete layout.metadata.model3d;
  const surface = borderRoadGeometry(layout, terrain),
    positions = surface.geometry.getAttribute("position");
  assert.equal(surface.triangles, 2);
  assert.equal(surface.missingVertices, 0);
  let area = 0;
  const indices = surface.geometry.getIndex()!;
  for (let i = 0; i < indices.count; i += 3) {
    const a = indices.getX(i),
      b = indices.getX(i + 1),
      c = indices.getX(i + 2);
    area +=
      Math.abs(
        (positions.getX(b) - positions.getX(a)) *
          (positions.getZ(c) - positions.getZ(a)) -
          (positions.getZ(b) - positions.getZ(a)) *
            (positions.getX(c) - positions.getX(a)),
      ) / 2;
  }
  assert.ok(Math.abs(area - 1200) < 1);
  const samples = boundarySamples(left, origin);
  assert.equal(samples.closed, false);
  assert.ok(Math.abs(samples.samples.at(-1)!.x - 100) < 0.01);
  assert.deepEqual(borderLabels(layout), { inner: "Left", outer: "Right" });
  const model = prepareSurfaceModel(
    layout,
    terrain,
    "a".repeat(64),
    "route-not-closed",
  );
  assert.equal(model.kind, "surface");
  const curbs = boundaryCurbGeometry(layout, model);
  assert.ok(
    Array.from(curbs.geometry.getAttribute("position").array).every(
      Number.isFinite,
    ),
  );
  surface.geometry.dispose();
  curbs.geometry.dispose();
});
