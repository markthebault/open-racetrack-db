import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  elevationSchema,
  sampleElevation,
  courseElevation,
  type ElevationGrid,
} from "../src/elevation";
import type { Layout } from "../schemas/data";

const grid: ElevationGrid = {
  schemaVersion: 1,
  trackId: "fixture",
  bounds: [0, 0, 1, 1],
  columns: 2,
  rows: 2,
  heights: [100, 200, 300, 400],
  source: {
    name: "Mapzen Terrain Tiles",
    url: "https://registry.opendata.aws/terrain-tiles/",
    zoom: 12,
    sampledAt: "2026-10-04T00:00:00Z",
    sampleSpacingM: 80,
    attribution: ["Mapzen Terrain Tiles"],
  },
};
const spa: Layout = JSON.parse(
  readFileSync(
    "data/belgium/spa-francorchamps/layouts/grand-prix.geojson",
    "utf8",
  ),
);

test("geographic interpolation keeps north-first rows, east-west orientation and exact edge samples", () => {
  assert.equal(sampleElevation(grid, [0, 1]), 100);
  assert.equal(sampleElevation(grid, [1, 1]), 200);
  assert.equal(sampleElevation(grid, [0, 0]), 300);
  assert.equal(sampleElevation(grid, [1, 0]), 400);
  assert.equal(sampleElevation(grid, [0.5, 0.5]), 250);
  assert.equal(sampleElevation(grid, [0.25, 0.75]), 175);
  assert.equal(sampleElevation(grid, [0.5, 0]), 350);
});

test("missing terrain and invalid rasters cannot turn into invented flat elevations", () => {
  assert.equal(sampleElevation(grid, [1.001, 0.5]), null);
  assert.equal(
    sampleElevation({ ...grid, heights: [100, null, 300, 400] }, [0.5, 0.5]),
    null,
  );
  assert.throws(
    () => elevationSchema.parse({ ...grid, heights: [100] }),
    /dimensions/,
  );
  assert.throws(
    () => elevationSchema.parse({ ...grid, bounds: [1, 0, 0, 1] }),
    /bounds/,
  );
  assert.throws(() =>
    elevationSchema.parse({ ...grid, heights: [100, NaN, 300, 400] }),
  );
});

test("elevation profiles keep disconnected branches separate and leave public coordinates untouched", () => {
  const layout: Layout = {
    ...spa,
    metadata: {
      ...spa.metadata,
      schemaVersion: 2,
      geometryKind: "network",
      closed: false,
    },
    features: [
      {
        type: "Feature",
        id: "trace",
        properties: { role: "trace", sourceIds: ["fixture"] },
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [
              [0, 1],
              [1, 1],
            ],
            [
              [0, 0],
              [1, 0],
            ],
          ],
        },
      },
    ],
  };
  const original = structuredClone(layout);
  const profile = courseElevation(layout, grid)!;
  assert.equal(profile.paths.length, 2);
  assert.deepEqual(
    profile.paths.map((path) => path.map((p) => p.elevation)),
    [
      [100, 200],
      [300, 400],
    ],
  );
  assert.deepEqual(
    profile.paths.map((path) => path[0].distance),
    [0, 0],
  );
  assert.equal(profile.min, 100);
  assert.equal(profile.max, 400);
  assert.deepEqual(layout, original);
  assert.equal(
    courseElevation(layout, { ...grid, heights: [100, null, 300, 400] }),
    null,
  );
});

test("pinned terrain gives finite elevations for a circuit and the open Pikes Peak climb", () => {
  const spaGrid = elevationSchema.parse(
    JSON.parse(
      readFileSync("data/elevation/be-spa-francorchamps.json", "utf8"),
    ),
  );
  const spaProfile = courseElevation(spa, spaGrid)!;
  assert.ok(spaProfile.min > 300 && spaProfile.max < 550);
  assert.ok(spaProfile.max - spaProfile.min > 80);
  const peak: Layout = JSON.parse(
    readFileSync(
      "data/united-states/us-pikes-peak-hillclimb-ab97c20e/layouts/pikes-peak-hillclimb.geojson",
      "utf8",
    ),
  );
  const peakGrid = elevationSchema.parse(
    JSON.parse(
      readFileSync(
        "data/elevation/us-pikes-peak-hillclimb-ab97c20e.json",
        "utf8",
      ),
    ),
  );
  const peakProfile = courseElevation(peak, peakGrid)!;
  assert.ok(peakProfile.min > 2500 && peakProfile.max > 4200);
  assert.ok(peakProfile.max - peakProfile.min > 1300);
  assert.ok(
    Math.abs(
      peakProfile.paths[0].at(-1)!.elevation! -
        peakProfile.paths[0][0].elevation!,
    ) > 1300,
  );
});
