import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateLayout, validateTrack, type Layout } from "../schemas/data";
import { plane, bounds, length, type Position } from "../src/geo";
import { prepareModel } from "../src/model-preparation";
import {
  buildRoad,
  simulateLap,
  sampleLap,
  roadHeight,
} from "../src/lap-simulation";
import { CameraCourse } from "../src/lap-camera";
import { roadStrip } from "../src/road-geometry";

test("an open run starts at rest, climbs to its own finish and never creates a return segment", () => {
  const root = "data/united-states/us-apex-motor-b7ddcfd3/",
    track = validateTrack(
      JSON.parse(readFileSync(root + "track.json", "utf8")),
    ),
    d: Layout = JSON.parse(
      readFileSync(root + "layouts/apex-i-straight.geojson", "utf8"),
    );
  const terrain = d.metadata.model3d!.terrain,
    origin: Position = [
      (terrain.bounds[0] + terrain.bounds[2]) / 2,
      (terrain.bounds[1] + terrain.bounds[3]) / 2,
    ],
    p = plane(origin);
  for (const f of d.features) {
    const offset =
      f.properties.role === "inner"
        ? 6
        : f.properties.role === "outer"
          ? -6
          : 0;
    f.geometry = {
      type: "LineString",
      coordinates: [p.from([-250, offset]), p.from([250, offset])],
    };
  }
  d.bbox = bounds(
    d.features.flatMap((f) => f.geometry.coordinates as Position[]),
  );
  d.metadata.lengthM = length(d.features[0].geometry.coordinates as Position[]);
  d.metadata.closed = false;
  d.metadata.borderInference!.edgeConvention = "left-right-along-trace";
  delete d.metadata.model3d;
  d.metadata.model3d = prepareModel(d, terrain, "a".repeat(64));
  validateLayout(d, track, d.metadata.layoutId);
  assert.equal(d.metadata.model3d.kind, "run");
  const model = d.metadata.model3d;
  assert.equal(model.elevationMethod, "monotone-cubic");
  assert.notEqual(model.elevation[0][1], model.elevation.at(-1)![1]);
  const road = buildRoad(d),
    lap = simulateLap(road),
    start = sampleLap(lap, 0),
    finish = sampleLap(lap, lap.duration);
  assert.equal(lap.speed[0], 0);
  assert.ok(lap.speed.at(-1)! > 0);
  assert.ok(Number.isFinite(lap.duration) && lap.duration > 0);
  assert.equal(lap.time.length, road.points.length);
  assert.equal(road.points.at(-1)!.ds, 0);
  assert.ok(Math.abs(finish.x - start.x - 500) < 0.1);
  assert.ok(Math.abs(finish.distance - road.length) < 1e-7);
  assert.equal(sampleLap(lap, lap.duration + 100).x, finish.x);
  assert.ok(lap.time.every((t, i) => !i || t > lap.time[i - 1]));
  const camera = new CameraCourse(road);
  assert.ok(
    camera.point(road.length + 100).distanceTo(camera.point(road.length)) <
      1e-8,
  );
  const pose = camera.desired(road.length, "driver");
  assert.ok(pose.target.distanceTo(pose.position) > 1);
  // A smoothed driving normal must not move the saved road boundaries.
  road.points[0].nx = 0.8;
  road.points[0].nz = -0.6;
  const geometry = roadStrip(road, (q) => [-q.right, q.left], 0.02);
  const vertices = geometry.getAttribute("position"),
    edge = road.points[0].rightEdge!;
  assert.ok(Math.abs(vertices.getX(0) - edge[0]) < 0.001);
  assert.ok(Math.abs(vertices.getZ(0) - edge[1]) < 0.001);
  assert.equal(
    geometry.getAttribute("position").count,
    (road.points.length - 1) * 6,
  );
  geometry.dispose();
});

test("open elevation clamps to distinct endpoints without wrapping", () => {
  const anchors: [number, number][] = [
    [0, 10],
    [50, 40],
    [100, 55],
  ];
  assert.equal(roadHeight(anchors, -10, false), 10);
  assert.equal(roadHeight(anchors, 100, false), 55);
  assert.equal(roadHeight(anchors, 200, false), 55);
  for (let s = 0; s <= 100; s++)
    assert.ok(
      roadHeight(anchors, s, false) >= 10 &&
        roadHeight(anchors, s, false) <= 55,
    );
});

test("saved open runs respect lateral grip and combined braking demand on their real slopes", () => {
  const index = JSON.parse(readFileSync("data/index.json", "utf8")),
    files: string[] = [];
  for (const entry of index.tracks) {
    const track = JSON.parse(readFileSync(join("data", entry.file), "utf8"));
    for (const item of track.layouts)
      if (item.file) files.push(join("data", dirname(entry.file), item.file));
  }
  let checked = 0;
  for (const file of files) {
    const layout = JSON.parse(readFileSync(file, "utf8"));
    if (layout.metadata.model3d?.kind !== "run") continue;
    checked++;
    const road = buildRoad(layout),
      lap = simulateLap(road),
      g = 9.80665;
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i],
        b = road.points[i + 1],
        v = Math.max(lap.speed[i], lap.speed[i + 1]);
      const lateral =
        (v * v * Math.max(Math.abs(a.curvature), Math.abs(b.curvature))) /
        (lap.car.lateralG * g);
      const acceleration =
          (lap.speed[i + 1] ** 2 - lap.speed[i] ** 2) / (2 * a.ds),
        grade = (b.y - a.y) / a.ds;
      const braking =
        Math.max(0, -acceleration - g * grade) / (lap.car.brakingG * g);
      assert.ok(lateral <= 1.00001, file);
      if (acceleration < 0)
        assert.ok(braking * braking + lateral * lateral <= 1.00002, file);
    }
  }
  assert.ok(checked > 0);
});
