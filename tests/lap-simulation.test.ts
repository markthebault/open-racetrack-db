import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildRoad,
  DEFAULT_CAR,
  GRAVITY,
  driveAcceleration,
  roadHeight,
  sampleLap,
  simulateLap,
  type Road,
} from "../src/lap-simulation";
import { type Layout } from "../schemas/data";
import { distance } from "../src/geo";
const layout = JSON.parse(
  readFileSync(
    "data/belgium/spa-francorchamps/layouts/grand-prix.geojson",
    "utf8",
  ),
) as Layout;
const recipe = buildRoad(layout).recipe;
const road = buildRoad(layout),
  lap = simulateLap(road);

test("Spa reconstructs a closed metre-scale road with source widths and exact venue elevations", () => {
  assert.ok(road.length > 6980 && road.length < 7020);
  assert.ok(
    road.points.every(
      (p) =>
        Number.isFinite(p.left) &&
        Number.isFinite(p.right) &&
        p.left > 0 &&
        p.right > 0,
    ),
  );
  assert.ok(
    Math.max(...road.points.map((p) => p.left + p.right)) -
      Math.min(...road.points.map((p) => p.left + p.right)) >
      2,
  );
  for (const [s, h] of recipe.elevation)
    assert.ok(
      Math.abs(roadHeight(recipe.elevation, s) - h) < 1e-8,
      `anchor ${s}`,
    );
  for (let s = 0; s <= 7004; s++)
    assert.ok(
      roadHeight(recipe.elevation, s) >= 373 &&
        roadHeight(recipe.elevation, s) <= 470,
    );
  const before = roadHeight(recipe.elevation, 7004 - 0.001),
    after = roadHeight(recipe.elevation, 0.001);
  assert.ok(Math.abs(before - after) < 0.001);
  const a = road.points[0],
    b = road.points.at(-1)!;
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 4);
});

test("planned lap respects speed, lateral grip, power, braking and combined grip on every segment", () => {
  assert.ok(lap.duration > 150 && lap.duration < 240);
  for (let i = 0; i < road.points.length; i++) {
    const j = (i + 1) % road.points.length,
      a = road.points[i],
      b = road.points[j];
    const v = lap.speed[i],
      next = lap.speed[j];
    assert.ok(v <= DEFAULT_CAR.topSpeedKph / 3.6 + 1e-6);
    const k = Math.max(Math.abs(a.curvature), Math.abs(b.curvature));
    const lat = (Math.max(v, next) ** 2 * k) / (DEFAULT_CAR.lateralG * GRAVITY);
    const accel = (next * next - v * v) / (2 * a.ds),
      grade = (b.y - a.y) / a.ds;
    assert.ok(
      v * v * Math.abs(a.curvature) <= DEFAULT_CAR.lateralG * GRAVITY + 1e-5,
    );
    if (accel < 0) {
      const tyre =
        Math.max(0, -accel - GRAVITY * grade) /
        (DEFAULT_CAR.brakingG * GRAVITY);
      assert.ok(
        tyre * tyre + lat * lat <= 1.0001,
        `combined braking ${i}: ${tyre},${lat}`,
      );
    } else {
      const resist =
        (0.5 * 1.225 * DEFAULT_CAR.dragArea * Math.max(v, next) ** 2) /
          DEFAULT_CAR.massKg +
        DEFAULT_CAR.rollingResistance * GRAVITY;
      const drive = accel + resist + GRAVITY * grade;
      assert.ok(
        drive <=
          (DEFAULT_CAR.powerHp * 745.699872 * DEFAULT_CAR.efficiency) /
            (DEFAULT_CAR.massKg * Math.max(v, next, 8)) +
            1e-5,
      );
      const tyre = Math.max(0, drive) / (0.55 * GRAVITY);
      assert.ok(tyre * tyre + lat * lat <= 1.0001, `combined drive ${i}`);
    }
  }
});

test("continuous playback is time-based and crosses finish without a spatial jump", () => {
  assert.equal(sampleLap(lap, 0).time, 0);
  assert.equal(sampleLap(lap, lap.duration).distance, road.length);
  const start = sampleLap(lap, 0),
    finish = sampleLap(lap, lap.duration);
  assert.ok(Math.hypot(start.x - finish.x, start.z - finish.z) < 1e-6);
  for (let t = 0.1; t < lap.duration; t += 0.5) {
    const a = sampleLap(lap, t - 0.001),
      b = sampleLap(lap, t + 0.001);
    assert.ok(
      Math.abs((b.distance - a.distance) / 0.002 - sampleLap(lap, t).speed) <
        0.1,
    );
  }
});

test("slope affects power-limited acceleration and more power reduces lap time", () => {
  const slow = simulateLap(road, { ...DEFAULT_CAR, powerHp: 150 });
  assert.ok(slow.duration > lap.duration + 5);
  const flat: Road = {
    ...road,
    points: road.points.map((p) => ({ ...p, y: 400, grade: 0 })),
  };
  const flatLap = simulateLap(flat);
  assert.ok(Math.abs(flatLap.duration - lap.duration) > 0.1);
  assert.ok(
    driveAcceleration(40, 0.1, 0, DEFAULT_CAR) <
      driveAcceleration(40, -0.1, 0, DEFAULT_CAR),
  );
  assert.throws(() => simulateLap(road, { ...DEFAULT_CAR, massKg: 0 }));
});

test("constant-radius circuit matches the analytic lateral speed limit", () => {
  const n = 400,
    r = 100,
    step = (2 * Math.PI * r) / n;
  const circle: Road = {
    ...road,
    length: step * n,
    step,
    points: Array.from({ length: n }, (_, i) => ({
      x: r * Math.cos((i / n) * 2 * Math.PI),
      z: r * Math.sin((i / n) * 2 * Math.PI),
      y: 0,
      s: i * step,
      ds: step,
      left: 6,
      right: 6,
      nx: 0,
      nz: 1,
      grade: 0,
      curvature: 1 / r,
    })),
  };
  const result = simulateLap(circle);
  const limit = Math.sqrt(DEFAULT_CAR.lateralG * GRAVITY * r);
  assert.ok(Math.max(...result.speed) <= limit + 1e-6);
  assert.ok(Math.min(...result.speed) > limit * 0.95);
});


for (const [name, file] of [
  ["Oschersleben tight first corner", "data/germany/motorsport-arena-oschersleben-89251023/layouts/main.geojson"],
  ["Bahrain extended junctions", "data/bahrain/bahrain-international-circuit-4818385/layouts/main.geojson"],
])
test(`${name} retains paired sections without distant-edge width jumps`, () => {
  const data = JSON.parse(readFileSync(
    file, "utf8",
  )) as Layout;
  const inner = data.features.find((f) => f.properties.role === "inner")!;
  const outer = data.features.find((f) => f.properties.role === "outer")!;
  assert.equal(inner.geometry.type, "LineString");
  assert.equal(outer.geometry.type, "LineString");
  if (inner.geometry.type !== "LineString" || outer.geometry.type !== "LineString") return;
  assert.equal(inner.geometry.coordinates.length, outer.geometry.coordinates.length);
  const innerPoints = inner.geometry.coordinates, outerPoints = outer.geometry.coordinates;
  const maximumMeasuredWidth = Math.max(...innerPoints.map(
    (p, i) => distance(p, outerPoints[i]),
  ));
  const reconstructed = buildRoad(data);
  assert.equal(reconstructed.interpolatedSections, 0);
  for (const point of reconstructed.points) {
    assert.ok(point.leftEdge && point.rightEdge && Number.isFinite(point.sourceStation));
    assert.ok(point.left + point.right >= 3.5);
    assert.ok(point.left + point.right <= maximumMeasuredWidth + 0.05,
      "A cross-section must not reach a different part of the opposite border at the tight turn");
  }
});
