import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { plane, type Position } from "../src/geo";
import { nearestBorderCorridor } from "../scripts/ideal-nearest-corridor";
import { insideRing } from "../src/boundary-path";
import type { Layout } from "../schemas/data";
test("nearest-edge correspondence constructs an on-road corridor independent of ring storage direction", () => {
  const d = JSON.parse(
      readFileSync(
        "data/belgium/spa-francorchamps/layouts/grand-prix.geojson",
        "utf8",
      ),
    ) as Layout,
    origin: Position = [5, 50],
    projection = plane(origin);
  const ring = (radius: number, n: number) =>
    Array.from({ length: n + 1 }, (_, i) =>
      projection.from([
        radius * Math.cos((i / n) * 2 * Math.PI),
        radius * Math.sin((i / n) * 2 * Math.PI),
      ]),
    );
  d.features = d.features.filter((f) =>
    ["trace", "inner", "outer"].includes(f.properties.role),
  );
  for (const f of d.features)
    f.geometry = {
      type: "LineString",
      coordinates:
        f.properties.role === "trace"
          ? ring(55, 90)
          : f.properties.role === "inner"
            ? ring(50, 120)
            : ring(60, 150).reverse(),
    };
  const result = nearestBorderCorridor(d);
  assert.ok(result.stations.length > 50);
  for (const p of result.stations) {
    const q: Position = [p.x, -p.z];
    assert.equal(insideRing(q, result.rings[0]), false);
    assert.equal(insideRing(q, result.rings[1]), true);
    assert.ok(p.halfWidth > 4.8);
    assert.ok(p.halfWidth < 5.1);
  }
});

test("raw self-touching border vertices remain unchanged and constrain nearest-edge candidates", () => {
  const d = JSON.parse(readFileSync(
    "data/belgium/spa-francorchamps/layouts/grand-prix.geojson", "utf8",
  )) as Layout;
  const project = plane([5, 50]);
  const inner: Position[] = [[-50,-50],[50,-50],[50,50],[0,50],[3,53],[-3,53],[0,50],[-50,50],[-50,-50]];
  const square = (r: number): Position[] => [[-r,-r],[r,-r],[r,r],[-r,r],[-r,-r]];
  d.features = d.features.filter((f) => ["trace", "inner", "outer"].includes(f.properties.role));
  for (const f of d.features) f.geometry = {
    type: "LineString",
    coordinates: (f.properties.role === "trace" ? square(55) : f.properties.role === "inner" ? inner : square(60)).map(project.from),
  };
  const original = structuredClone(d);
  const corridor = nearestBorderCorridor(d);
  assert.ok(corridor.stations.length > 100);
  for (const p of corridor.stations) {
    assert.equal(insideRing([p.x,-p.z],corridor.rings[0]),false);
    assert.equal(insideRing([p.x,-p.z],corridor.rings[1]),true);
  }
  assert.deepEqual(d,original);
});
