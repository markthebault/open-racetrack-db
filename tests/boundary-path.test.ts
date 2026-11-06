import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Layout } from "../schemas/data";
import { bounds, plane, type Position } from "../src/geo";
import { boundaryNormalMidline } from "../src/boundary-path";
import { prepareTrackModel } from "../src/model-preparation";
import { buildRoad, simulateLap } from "../src/lap-simulation";

function fixture() {
  const d: Layout = JSON.parse(
    readFileSync(
      "data/united-states/us-apex-motor-b7ddcfd3/layouts/apex-i-straight.geojson",
      "utf8",
    ),
  );
  const project = plane(
    d.features[0].geometry.type === "LineString"
      ? d.features[0].geometry.coordinates[0]
      : [0, 0],
  );
  const ring = (radius: number, count: number, phase = 0): Position[] => {
    const points = Array.from({ length: count }, (_, i) =>
      project.from([
        radius * Math.cos((i / count) * Math.PI * 2 + phase),
        radius * Math.sin((i / count) * Math.PI * 2 + phase),
      ]),
    );
    points.push(points[0]);
    return points;
  };
  for (const f of d.features)
    f.geometry = {
      type: "LineString",
      coordinates:
        f.properties.role === "trace"
          ? ring(135, 100)
          : f.properties.role === "inner"
            ? ring(94, 180, 0.4).reverse()
            : ring(106, 251, 1.2),
    };
  delete d.metadata.borderInference;
  d.bbox = bounds(
    d.features.flatMap((f) => f.geometry.coordinates as Position[]),
  );
  return { d, project };
}

test("unequally sampled and reversed boundaries reconstruct a contained path without changing the source trace", () => {
  const { d, project } = fixture(),
    original = JSON.stringify(d.features);
  const mid = boundaryNormalMidline(d);
  assert.ok(
    mid.every((p) => Math.abs(Math.hypot(...project.to(p)) - 100) < 0.1),
  );
  // The source trace travels counterclockwise although the inner ring was reversed.
  const a = project.to(mid[0]),
    b = project.to(mid[1]);
  assert.ok(a[0] * b[1] - a[1] * b[0] > 0);
  d.metadata.model3d = prepareTrackModel(
    d,
    d.metadata.model3d!.terrain,
    "a".repeat(64),
    true,
  );
  assert.equal(d.metadata.model3d.pathMethod, "boundary-normal-midpoints-v1");
  const road = buildRoad(d),
    lap = simulateLap(road);
  assert.equal(road.interpolatedSections, 0);
  assert.ok(Math.abs(road.length - Math.PI * 200) < 2);
  assert.ok(lap.duration > 0 && Number.isFinite(lap.duration));
  assert.equal(JSON.stringify(d.features), original);
});

test("crossing or touching rings, unmatched widths and branch networks cannot become a boundary driving path", () => {
  const { d, project } = fixture();
  const broken = structuredClone(d),
    outer = broken.features.find((f) => f.properties.role === "outer")!;
  outer.geometry = {
    type: "LineString",
    coordinates: [
      [-120, -120],
      [120, 120],
      [-120, 120],
      [120, -120],
      [-120, -120],
    ].map((p) => project.from(p as Position)),
  };
  assert.throws(() => boundaryNormalMidline(broken), /cross|nested/);
  const wide = structuredClone(d);
  wide.features.find((f) => f.properties.role === "outer")!.geometry = {
    type: "LineString",
    coordinates: Array.from({ length: 201 }, (_, i) =>
      project.from([
        200 * Math.cos(((i % 200) / 200) * Math.PI * 2),
        200 * Math.sin(((i % 200) / 200) * Math.PI * 2),
      ]),
    ),
  };
  assert.throws(() => boundaryNormalMidline(wide), /width/);
  d.metadata.geometryKind = "network";
  assert.throws(() => boundaryNormalMidline(d), /single closed route/);
});

test("screened boundary layouts reconstruct every cross-section while preserving original features", () => {
  for (const file of [
    "data/japan/osm-226496291/layouts/main.geojson",
    "data/canada/circuit-icar-1043569622/layouts/icar-mirabel.geojson",
  ]) {
    const d: Layout = JSON.parse(readFileSync(file, "utf8")),
      original = JSON.stringify(d.features),
      previous = d.metadata.model3d!;
    if (previous.kind === "surface")
      throw new Error(`${file} should have a playable boundary recipe`);
    const terrain = previous.terrain,
      imagery = previous.imagery,
      evidence = previous.preparation?.boundaryPathEvidence;
    d.metadata.model3d = prepareTrackModel(d, terrain, "a".repeat(64), true);
    assert.deepEqual(d.metadata.model3d.imagery, imagery);
    assert.deepEqual(
      d.metadata.model3d.preparation?.boundaryPathEvidence,
      evidence,
    );
    const road = buildRoad(d),
      lap = simulateLap(road);
    assert.equal(road.interpolatedSections, 0, file);
    assert.ok(
      road.points.every((p) => p.left > 0 && p.right > 0),
      file,
    );
    assert.ok(lap.speed.every(Number.isFinite), file);
    assert.equal(JSON.stringify(d.features), original, file);
  }
});

test("a boundary route with unresolved corner sections is rejected rather than given interpolated widths", () => {
  const d: Layout = JSON.parse(
    readFileSync(
      "data/argentina/autodromo-oscar-y-juan-galvez-48743061/layouts/buenos-aires-h.geojson",
      "utf8",
    ),
  );
  assert.throws(
    () =>
      prepareTrackModel(d, d.metadata.model3d!.terrain, "a".repeat(64), true),
    /measured cross-sections/,
  );
});
