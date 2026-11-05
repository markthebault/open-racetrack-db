import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Vector3, MathUtils } from "three";
import { buildRoad, sampleLap, simulateLap } from "../src/lap-simulation";
import { CameraCourse, LapCameraRig, dampVector } from "../src/lap-camera";
const road = buildRoad(
  JSON.parse(
    readFileSync(
      "data/belgium/spa-francorchamps/layouts/grand-prix.geojson",
      "utf8",
    ),
  ),
);
const lap = simulateLap(road);
const percentile = (values: number[], q: number) =>
  values.slice().sort((a, b) => a - b)[Math.floor((values.length - 1) * q)];

test("camera lookahead is continuous through every source vertex and the lap seam", () => {
  const course = new CameraCourse(road);
  for (const p of road.points) {
    const a = course.desired(p.s - 1e-4, "chase"),
      b = course.desired(p.s + 1e-4, "chase");
    assert.ok(a.target.distanceTo(b.target) < 0.005, `target step at ${p.s}`);
    assert.ok(
      a.position.distanceTo(b.position) < 0.005,
      `mount step at ${p.s}`,
    );
  }
});

test("damping uses seconds, stays finite while paused, and has no fixed-target overshoot", () => {
  const a = new Vector3(),
    v = new Vector3(),
    target = new Vector3(10, 20, -30);
  dampVector(a, v, target, 0, 0.2);
  assert.deepEqual(a.toArray(), [0, 0, 0]);
  let previous = a.distanceTo(target);
  for (let i = 0; i < 120; i++) {
    dampVector(a, v, target, 1 / 120, 0.2);
    const error = a.distanceTo(target);
    assert.ok(error <= previous);
    previous = error;
  }
  assert.ok(previous < 0.03);
  const b = new Vector3(),
    w = new Vector3();
  for (let i = 0; i < 30; i++) dampVector(b, w, target, 1 / 30, 0.2);
  assert.ok(a.distanceTo(b) < 1e-10);
});

function cameraSamples(hz: number) {
  const rig = new LapCameraRig(road),
    samples = [];
  for (let i = 0; i <= Math.floor(lap.duration * hz); i++) {
    const t = i / hz,
      s = sampleLap(lap, t),
      pose = rig.update(s.distance, t, "chase");
    samples.push(pose);
  }
  return samples;
}

test("a full Spa lap has smooth angular motion while retaining real corner turns", () => {
  const samples = cameraSamples(60),
    yaw: number[] = [],
    pitch: number[] = [];
  for (const pose of samples) {
    const forward = pose.target.clone().sub(pose.position).normalize();
    let angle = Math.atan2(forward.x, forward.z);
    if (yaw.length) {
      const previous = yaw.at(-1)!;
      angle =
        previous +
        MathUtils.euclideanModulo(angle - previous + Math.PI, 2 * Math.PI) -
        Math.PI;
    }
    yaw.push(angle);
    pitch.push(Math.asin(forward.y));
  }
  const acceleration = (values: number[]) =>
    values
      .slice(2)
      .map(
        (x, i) =>
          (Math.abs(x - 2 * values[i + 1] + values[i]) * 3600 * 180) / Math.PI,
      );
  assert.ok(
    percentile(acceleration(yaw), 0.95) < 100,
    "high-frequency yaw acceleration",
  );
  assert.ok(percentile(acceleration(pitch), 0.95) < 5, "horizon pitching");
  const steps = yaw
    .slice(1)
    .map((x, i) => (Math.abs(x - yaw[i]) * 180) / Math.PI);
  assert.ok(Math.max(...steps) < 1.1, "single-frame camera snap");
  assert.ok(
    Math.max(...yaw) - Math.min(...yaw) > 5,
    "the camera still follows the circuit turns",
  );
});

test("30 and 120 fps playback converge to the same camera trajectory", () => {
  const slow = cameraSamples(30),
    fast = cameraSamples(120);
  for (let i = 0; i < slow.length; i++) {
    assert.ok(
      slow[i].position.distanceTo(fast[i * 4].position) < 0.01,
      `frame-rate drift ${i}`,
    );
    assert.ok(
      slow[i].target.distanceTo(fast[i * 4].target) < 0.01,
      `target frame-rate drift ${i}`,
    );
  }
});

test("seeks and camera changes reset immediately, without a fly-through or stale damping", () => {
  const rig = new LapCameraRig(road),
    course = new CameraCourse(road);
  for (let i = 0; i < 60; i++) {
    const s = sampleLap(lap, i / 60);
    rig.update(s.distance, i / 60, "chase");
  }
  const seek = sampleLap(lap, 100),
    pose = rig.update(seek.distance, 100, "chase", true),
    desired = course.desired(seek.distance, "chase");
  assert.ok(pose.position.distanceTo(desired.position) < 1e-10);
  assert.ok(pose.target.distanceTo(desired.target) < 1e-10);
  const driver = rig.update(seek.distance, 100, "driver");
  assert.ok(
    driver.position.distanceTo(
      course.desired(seek.distance, "driver").position,
    ) < 1e-10,
  );
  const repeated = rig.update(seek.distance, 100, "driver");
  assert.ok(repeated.position.distanceTo(driver.position) < 1e-10);
});
