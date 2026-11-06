import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Layout } from "../schemas/data";
import { plane, bounds, type Position } from "../src/geo";
import { pairedBorderMidline } from "../src/border-midline";
import { prepareTrackModel } from "../src/model-preparation";
import { buildRoad, simulateLap } from "../src/lap-simulation";

test("a border-derived driving path preserves an offset source trace and stays inside paired edges", () => {
  const d: Layout = JSON.parse(
    readFileSync(
      "data/united-states/us-apex-motor-b7ddcfd3/layouts/apex-i-straight.geojson",
      "utf8",
    ),
  );
  const terrain = d.metadata.model3d!.terrain,
    origin: Position = [
      (terrain.bounds[0] + terrain.bounds[2]) / 2,
      (terrain.bounds[1] + terrain.bounds[3]) / 2,
    ],
    p = plane(origin);
  const ring = (r: number): Position[] =>
    Array.from({ length: 201 }, (_, i) =>
      p.from([
        r * Math.cos((i / 200) * Math.PI * 2),
        r * Math.sin((i / 200) * Math.PI * 2),
      ]),
    );
  for (const f of d.features)
    f.geometry = {
      type: "LineString",
      coordinates: ring(
        f.properties.role === "trace"
          ? 130
          : f.properties.role === "inner"
            ? 94
            : 106,
      ),
    };
  d.bbox = bounds(
    d.features.flatMap((f) => f.geometry.coordinates as Position[]),
  );
  d.metadata.borderInference!.method = "rgb-road-appearance-v3";
  delete d.metadata.model3d;
  const original = JSON.stringify(d.features[0]);
  const mid = pairedBorderMidline(d);
  assert.ok(mid.every((g) => Math.abs(Math.hypot(...p.to(g)) - 100) < 0.03));
  d.metadata.model3d = prepareTrackModel(d, terrain, "a".repeat(64));
  assert.equal(d.metadata.model3d.pathMethod, "paired-border-midpoints");
  const road = buildRoad(d),
    lap = simulateLap(road);
  assert.equal(road.interpolatedSections, 0);
  assert.ok(Math.abs(road.length - 2 * Math.PI * 100) < 5);
  assert.ok(Number.isFinite(lap.duration) && lap.duration > 0);
  assert.equal(JSON.stringify(d.features[0]), original);
  const bad = structuredClone(d);
  bad.features[1].geometry.coordinates.pop();
  assert.throws(() => pairedBorderMidline(bad), /matching/);
});
