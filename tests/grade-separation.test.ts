import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  gradeSeparationSchema,
  type GradeSeparation,
} from "../schemas/grade-separation";
import {
  assertGradeRibbon,
  gradeProfileHeight,
  onBridge,
} from "../src/grade-separation";
import {
  bilinearGsiHeight,
  decodeGsiHeight,
  interpolateCrossingApproaches,
} from "../scripts/bridge-elevation";
import { plane, length, type Position } from "../src/geo";
import { buildRoad, simulateLap } from "../src/lap-simulation";
import { roadGroundHeight, carveRoadGround } from "../src/road-ground";
import { PlaneGeometry } from "three";
import { TerrainDrape } from "../src/terrain-drape";
import { verifyGradeSource } from "../scripts/verify-grade-source";
import type { Layout } from "../schemas/data";

function fixture() {
  const n = 160,
    projection = plane([136, 35]),
    inner: Position[] = [],
    outer: Position[] = [],
    trace: Position[] = [];
  for (let i = 0; i < n; i++) {
    const t = 2 * Math.PI * (i / n + 0.125),
      x = 100 * Math.sin(t),
      y = 70 * Math.sin(2 * t),
      dx = 100 * Math.cos(t),
      dy = 140 * Math.cos(2 * t),
      length = Math.hypot(dx, dy);
    trace.push(projection.from([x, y]));
    inner.push(projection.from([x - (dy / length) * 6, y + (dx / length) * 6]));
    outer.push(projection.from([x + (dy / length) * 6, y - (dx / length) * 6]));
  }
  for (const path of [inner, outer, trace]) path.push(path[0]);
  const recipe: GradeSeparation = gradeSeparationSchema.parse({
    schemaVersion: 1,
    method: "source-bridge-ground-approaches-v1",
    stationCount: n,
    crossings: [
      {
        upper: [130, 150],
        lower: [50, 70],
        source: {
          wayId: 42,
          wayVersion: 7,
          snapshotSha256: "a".repeat(64),
          bridge: "yes",
          layer: "1",
        },
        note: "Synthetic test fixture; not real source evidence.",
      },
    ],
    elevation: {
      source: "GSI DEM5A",
      url: "https://maps.gsi.go.jp/development/ichiran.html#dem",
      attribution: "Geospatial Information Authority of Japan (GSI)",
      reuseEvidenceUrl:
        "https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html",
      sampling: "bilinear-pixel-centres",
      toleranceM: 0.25,
      tiles: [{ zoom: 15, x: 1, y: 2, sha256: "b".repeat(64) }],
      anchors: [
        [0, 40],
        [50, 40],
        [70, 40],
        [130, 46.5],
        [150, 46.7],
        [160, 40],
      ],
      note: "Synthetic test elevations only.",
    },
  });
  return { pair: { inner, outer }, recipe, trace };
}

test("only declared crossings with the source upper road above the lower road form a bridge ribbon", () => {
  const { pair, recipe } = fixture();
  assert.doesNotThrow(() => assertGradeRibbon(pair, recipe));
  assert.equal(gradeProfileHeight(recipe, 140), 46.6);
  assert.equal(gradeProfileHeight(recipe, 160), 40);
  assert.equal(onBridge(recipe, 140), true);
  assert.equal(onBridge(recipe, 60), false);
  const flat = structuredClone(recipe);
  flat.elevation.anchors.forEach((p) => (p[1] = 40));
  assert.throws(() => assertGradeRibbon(pair, flat), /separation/);
  const reversed = structuredClone(recipe);
  reversed.crossings[0].upper = [50, 70];
  reversed.crossings[0].lower = [130, 150];
  assert.throws(() => assertGradeRibbon(pair, reversed), /separation/);
  const misplaced = structuredClone(recipe);
  misplaced.crossings[0].lower = [20, 30];
  assert.throws(() => assertGradeRibbon(pair, misplaced), /Unexplained/);
  assert.throws(
    () => assertGradeRibbon({ inner: pair.outer, outer: pair.inner }, recipe),
    /left\/right/,
  );
  assert.throws(
    () => assertGradeRibbon({ ...pair, outer: pair.outer.slice(1) }, recipe),
    /station grid/,
  );
});

test("grade schema rejects overlaps, missing approach anchors and terrain inserted under a deck", () => {
  const { recipe } = fixture();
  for (const mutate of [
    (r: GradeSeparation) => {
      r.crossings[0].lower = [140, 155];
    },
    (r: GradeSeparation) => {
      r.elevation.anchors = r.elevation.anchors.filter((p) => p[0] !== 130);
    },
    (r: GradeSeparation) => {
      r.elevation.anchors.splice(4, 0, [140, 40]);
    },
    (r: GradeSeparation) => {
      r.elevation.anchors.at(-1)![1] = 42;
    },
  ]) {
    const invalid = structuredClone(recipe);
    mutate(invalid);
    assert.equal(gradeSeparationSchema.safeParse(invalid).success, false);
  }
});

test("GSI decoding and bilinear sampling preserve signs, pixel centres, tile seams and missing data", async () => {
  assert.equal(decodeGsiHeight(0, 1, 244), 5);
  assert.equal(decodeGsiHeight(255, 255, 156), -1);
  assert.equal(decodeGsiHeight(128, 0, 0), null);
  assert.equal(decodeGsiHeight(0, 0, 0, 0), null);
  const positions: number[][] = [],
    pixel = async (x: number, y: number) => {
      positions.push([x, y]);
      return x + 2 * y;
    };
  assert.equal(await bilinearGsiHeight(255.5, 40.5, pixel), 335);
  assert.deepEqual(positions, [[255, 40]]);
  positions.length = 0;
  assert.equal(await bilinearGsiHeight(256, 41, pixel), 336.5);
  assert.deepEqual(positions, [
    [255, 40],
    [256, 40],
    [255, 41],
    [256, 41],
  ]);
  await assert.rejects(
    bilinearGsiHeight(256, 41, async () => null),
    /missing coverage/,
  );
});

test("paired runtime stations cross at different heights without choosing the other branch", async () => {
  const { pair, recipe, trace } = fixture(),
    layout = JSON.parse(
      await readFile(
        "data/belgium/spa-francorchamps/layouts/grand-prix.geojson",
        "utf8",
      ),
    ) as Layout;
  layout.features = ["trace", "inner", "outer"].map((role) => ({
    type: "Feature",
    id: role,
    properties: { role, sourceIds: ["osm-snapshot"] },
    geometry: {
      type: "LineString",
      coordinates: role === "trace" ? trace : pair[role as "inner" | "outer"],
    },
  })) as Layout["features"];
  delete layout.metadata.timing;
  layout.metadata.model3d = {
    ...layout.metadata.model3d!,
    pathMethod: "paired-border-midpoints",
    startOffsetM: 0,
    referenceLengthM: length(trace),
    elevation: [
      [0, 40],
      [length(trace) / 2, 40],
      [length(trace), 40],
    ],
    curbs: [],
  } as NonNullable<Layout["metadata"]["model3d"]>;
  layout.metadata.borderInference = { gradeSeparation: recipe } as NonNullable<
    Layout["metadata"]["borderInference"]
  >;
  const road = buildRoad(layout),
    lower = road.points.reduce((a, b) =>
      Math.abs(a.sourceStation! - 60) < Math.abs(b.sourceStation! - 60) ? a : b,
    ),
    upper = road.points.reduce((a, b) =>
      Math.abs(a.sourceStation! - 140) < Math.abs(b.sourceStation! - 140)
        ? a
        : b,
    );
  assert.equal(road.interpolatedSections, 0);
  const measured = structuredClone(layout);
  measured.metadata.borderInference!.method = "image-measured-paired-edges-v1";
  assert.deepEqual(buildRoad(measured).points, road.points);
  const flatMeasured = structuredClone(measured);
  flatMeasured.metadata.borderInference!.gradeSeparation!.elevation.anchors.forEach(
    (p) => (p[1] = 40),
  );
  assert.throws(() => buildRoad(flatMeasured), /separation/);
  const shifted = structuredClone(measured),
    offset = 20;
  const shiftedGrade = shifted.metadata.borderInference!.gradeSeparation!;
  shiftedGrade.sourceStationOffset = offset;
  for (const crossing of shiftedGrade.crossings)
    for (const key of ["upper", "lower"] as const)
      crossing[key] = crossing[key].map((s) => s - offset) as [number, number];
  shiftedGrade.elevation.anchors = [
    [0, 40],
    [30, 40],
    [50, 40],
    [110, 46.5],
    [130, 46.7],
    [140, 40],
    [160, 40],
  ];
  for (const feature of shifted.features.filter(
    (f) => f.properties.role !== "trace",
  )) {
    const points = feature.geometry.coordinates as Position[];
    feature.geometry.coordinates = [
      ...points.slice(offset, -1),
      ...points.slice(0, offset),
      points[offset],
    ];
  }
  const shiftedRoad = buildRoad(shifted);
  assert.deepEqual(
    shiftedRoad.origin,
    trace[0],
    "source-grid shift preserves the fallback start location",
  );
  assert.ok(
    Math.hypot(
      shiftedRoad.points[0].x - road.points[0].x,
      shiftedRoad.points[0].z - road.points[0].z,
    ) < 2,
  );
  const reordered = structuredClone(layout);
  reordered.features.reverse();
  assert.deepEqual(buildRoad(reordered).points, road.points);
  const unpaired = structuredClone(layout);
  if (unpaired.metadata.model3d?.kind !== "surface")
    delete unpaired.metadata.model3d!.pathMethod;
  assert.throws(() => buildRoad(unpaired), /matching paired station grid/);
  assert.ok(
    road.points.every(
      (p) =>
        p.leftEdge &&
        p.rightEdge &&
        p.left + p.right > 11.5 &&
        p.left + p.right < 12.02,
    ),
  );
  assert.ok(Math.hypot(lower.x - upper.x, lower.z - upper.z) < 4);
  assert.ok(upper.y - lower.y > 6);
  assert.equal(upper.elevated, true);
  assert.equal(lower.elevated, false);
  const ground = roadGroundHeight({
    points: [lower, { ...upper, x: lower.x, z: lower.z }],
  });
  assert.ok(Math.abs(ground(lower.x, lower.z, 47) - (lower.y - 0.1)) < 1e-9);
  assert.equal(ground(10000, 10000, 47), 47);
  const lap = simulateLap(road);
  assert.ok(Number.isFinite(lap.duration) && lap.duration > 0);
  const terrain = new PlaneGeometry(400, 400, 20, 20);
  terrain.rotateX(-Math.PI / 2);
  const positions = terrain.getAttribute("position");
  for (let i = 0; i < positions.count; i++) positions.setY(i, 50);
  carveRoadGround(terrain, road, { columns: 20, rows: 20 });
  const drape = new TerrainDrape(terrain);
  for (const p of road.points)
    for (const fraction of [-1, 0, 1]) {
      const x = p.x + p.nx * p.left * fraction,
        z = p.z + p.nz * p.left * fraction,
        ground = drape.heightAt(x, z);
      assert.ok(
        ground !== null && ground < p.y - 0.39,
        JSON.stringify({
          x,
          z,
          ground,
          y: p.y,
          station: p.sourceStation,
          fraction,
        }),
      );
    }
  terrain.dispose();
});

test("both saved Suzuka recipes pin their bridge source and preserve separate runtime road levels", async () => {
  for (const id of ["main", "suzuka"]) {
    const layout = JSON.parse(
        await readFile(
          `data/japan/suzuka-circuit-175231434/layouts/${id}.geojson`,
          "utf8",
        ),
      ) as Layout,
      grade = layout.metadata.borderInference!.gradeSeparation!;
    await verifyGradeSource(layout, grade);
    assertGradeRibbon(
      {
        inner: layout.features.find((f) => f.properties.role === "inner")!
          .geometry.coordinates as Position[],
        outer: layout.features.find((f) => f.properties.role === "outer")!
          .geometry.coordinates as Position[],
      },
      grade,
    );
    const wrong = structuredClone(grade);
    wrong.crossings[0].source.wayVersion++;
    await assert.rejects(verifyGradeSource(layout, wrong), /source bridge/);
    const road = buildRoad(layout);
    assert.equal(road.interpolatedSections, 0);
    assert.ok(road.points.some((p) => p.elevated));
    assert.ok(grade.elevation.anchors.length < 100);
    assert.ok(
      road.points.every(
        (p) =>
          Math.abs(p.y - gradeProfileHeight(grade, p.sourceStation!)) < 1e-9,
      ),
    );
  }
});

test("separate underpass approaches exclude deck pixels without inventing missing ground samples", () => {
  const crossing = {
    upper: [2, 4],
    lower: [6, 8],
  } as GradeSeparation["crossings"][number];
  const samples: [number, number][] = Array.from({ length: 11 }, (_, i) => [
    i,
    i >= 2 && i <= 4 ? 46 : 40,
  ]);
  samples[3][1] = NaN;
  samples[7][1] = 46;
  const legacy = interpolateCrossingApproaches(samples, [crossing]);
  assert.equal(legacy.samples[7][1], 46);
  const edited = interpolateCrossingApproaches(samples, [crossing], true);
  assert.equal(edited.samples[3][1], 46);
  assert.equal(edited.samples[7][1], 40);
  assert.deepEqual(edited.endpoints, [2, 4, 6, 8]);
  assert.ok(Number.isNaN(samples[3][1]));
  const missing = structuredClone(samples);
  missing[6][1] = NaN;
  assert.throws(
    () => interpolateCrossingApproaches(missing, [crossing], true),
    /approach elevation/,
  );
  missing[6][1] = 40;
  missing[1][1] = NaN;
  assert.throws(
    () => interpolateCrossingApproaches(missing, [crossing], true),
    /outside an identified/,
  );
  const { recipe } = fixture();
  recipe.elevation.crossingInterpolation = "both-road-approaches-v1";
  assert.doesNotThrow(() => gradeSeparationSchema.parse(recipe));
  recipe.elevation.anchors.splice(2, 0, [60, 46]);
  assert.throws(() => gradeSeparationSchema.parse(recipe), /only between/);
});

test("source verification maps a shifted paired origin back to the exact retained source bridge", async () => {
  const layout = JSON.parse(
    await readFile(
      "data/japan/suzuka-circuit-175231434/layouts/main.geojson",
      "utf8",
    ),
  ) as Layout;
  const original = layout.metadata.borderInference!.gradeSeparation!,
    grade = structuredClone(original),
    offset = 17,
    n = grade.stationCount,
    wrap = (s: number) => (s - offset + n) % n,
    seam = gradeProfileHeight(original, offset);
  grade.sourceStationOffset = offset;
  for (const crossing of grade.crossings)
    for (const key of ["upper", "lower"] as const)
      crossing[key] = crossing[key].map(wrap) as [number, number];
  grade.elevation.anchors = [
    [0, seam],
    ...original.elevation.anchors
      .slice(0, -1)
      .map(([s, h]): [number, number] => [wrap(s), h])
      .filter(([s]) => s !== 0)
      .sort((a, b) => a[0] - b[0]),
    [n, seam],
  ];
  await verifyGradeSource(layout, grade);
  const wrong = structuredClone(grade);
  wrong.sourceStationOffset = Math.floor(n / 2);
  await assert.rejects(verifyGradeSource(layout, wrong), /source bridge/);
  wrong.sourceStationOffset = n;
  await assert.rejects(
    verifyGradeSource(layout, wrong),
    /inside the closed source grid/,
  );
  wrong.sourceStationOffset = offset;
  wrong.crossings[0].source.wayVersion++;
  await assert.rejects(verifyGradeSource(layout, wrong), /source bridge/);
  assert.equal(original.sourceStationOffset, undefined);
});
