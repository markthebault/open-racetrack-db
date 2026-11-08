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
import { elevationSchema, sampleElevation } from "../src/elevation";

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

test("ICGC profiles retain their native crop and datum without accepting GSI or rendered-image metadata", () => {
  const { recipe, pair } = fixture();
  const { anchors, note, sampling, toleranceM } = recipe.elevation;
  const icgc = {
    ...recipe,
    elevation: {
      anchors,
      note,
      sampling,
      toleranceM,
      source: "ICGC MET 50cm 2021-2023",
      url: "https://catalegs.ide.cat/geonetwork/geonetwork/api/records/model-elevacions-terreny-lidar-catalunya-50cm-2021-2023?language=all",
      attribution:
        "Institut Cartogràfic i Geològic de Catalunya (ICGC), CC BY 4.0",
      reuseEvidenceUrl:
        "https://datacloud.ide.cat/especificacions/model-elevacions-terreny-territorial-v1r0-20260902.pdf",
      crossingInterpolation: "both-road-approaches-v1",
      raster: {
        url: "https://datacloud.icgc.cat/datacloud/model-elevacions-terreny/tif_unzip/model-elevacions-terreny-lidar-catalunya-50cm-2021-2023.tif",
        crs: "EPSG:25831",
        verticalDatum: "EGM08D595 orthometric metres",
        pixelSizeM: 0.5,
        sourceWindow: [262736, 287153, 1845, 1807],
        sha256: "c".repeat(64),
      },
    },
  };
  const parsed = gradeSeparationSchema.parse(JSON.parse(JSON.stringify(icgc)));
  assert.deepEqual(parsed, icgc);
  assert.doesNotThrow(() => assertGradeRibbon(pair, parsed));
  assert.equal(
    gradeProfileHeight(parsed, 140),
    gradeProfileHeight(recipe, 140),
  );
  for (const elevation of [
    { ...icgc.elevation, source: "GSI DEM5A" },
    {
      ...icgc.elevation,
      tiles: [{ zoom: 15, x: 1, y: 2, sha256: "d".repeat(64) }],
    },
    { ...icgc.elevation, crossingInterpolation: undefined },
    {
      ...icgc.elevation,
      raster: {
        ...icgc.elevation.raster,
        url: "https://geoserveis.icgc.cat/servei/catalunya/elevacions-territorial/wms",
      },
    },
    {
      ...icgc.elevation,
      raster: { ...icgc.elevation.raster, verticalDatum: "ellipsoid" },
    },
    { ...icgc.elevation, raster: { ...icgc.elevation.raster, pixelSizeM: 5 } },
    ...[
      [-1, 0, 2, 2],
      [0.5, 0, 2, 2],
      [538000, 0, 1, 1],
      [0, 523999, 2, 2],
      [0, 0, 0, 2],
    ].map((sourceWindow) => ({
      ...icgc.elevation,
      raster: { ...icgc.elevation.raster, sourceWindow },
    })),
    {
      ...icgc.elevation,
      anchors: anchors.filter(([station]) => station !== 50),
    },
    {
      ...icgc.elevation,
      anchors: [...anchors.slice(0, 2), [60, 40], ...anchors.slice(2)],
    },
  ]) {
    assert.equal(
      gradeSeparationSchema.safeParse({ ...icgc, elevation }).success,
      false,
    );
  }
  // Source-specific provenance cannot relax the shared road-level clearance guard.
  const flat = structuredClone(parsed);
  flat.elevation.anchors.forEach((p) => (p[1] = 40));
  assert.throws(() => assertGradeRibbon(pair, flat), /separation/);
});

test("prepared Parcmotor model retains ICGC ground provenance and reconstructs its source-backed bridge", async () => {
  const layout = JSON.parse(
    await readFile(
      "data/spain/parcmotor-castelloli-31877576/layouts/main.geojson",
      "utf8",
    ),
  ) as Layout;
  const grade = layout.metadata.borderInference!.gradeSeparation!;
  assert.equal(grade.elevation.source, "ICGC MET 50cm 2021-2023");
  await verifyGradeSource(layout, grade);
  const { prepareModel } = await import("../src/model-preparation");
  const { modelInputHash } = await import("../scripts/model-input");
  const terrain = layout.metadata.model3d!.terrain;
  const model = prepareModel(layout, terrain, modelInputHash(layout, terrain));
  assert.deepEqual(model, layout.metadata.model3d);
  assert.equal(model.sources.elevation, grade.elevation.url);
  assert.match(model.sources.notes, /ICGC MET 50cm 2021-2023 ground raster/);
  assert.doesNotMatch(model.sources.notes, /DEM5A/);
  assert.equal(buildRoad(layout).interpolatedSections, 0);
});

test("NLS profiles pin native Finnish raster geometry and require the dataset delivery credit", () => {
  const { recipe, pair } = fixture();
  const { anchors, note, sampling, toleranceM } = recipe.elevation;
  const elevation = {
    anchors,
    note,
    sampling,
    toleranceM,
    source: "NLS Elevation model 2 m",
    url: "https://www.maanmittauslaitos.fi/en/maps-and-spatial-data/datasets-and-interfaces/product-descriptions/elevation-model-2-m",
    attribution:
      "National Land Survey of Finland, Elevation model 2 m, delivered 2026-11-07, CC BY 4.0",
    deliveredAt: "2026-11-07",
    reuseEvidenceUrl:
      "https://www.maanmittauslaitos.fi/en/maps-and-spatial-data/datasets-and-interfaces/product-descriptions/elevation-model-2-m",
    crossingInterpolation: "both-road-approaches-v1",
    rasters: [
      {
        url: "https://www.nic.funet.fi/index/geodata/mml/dem2m/2008_latest/M4/M41/M4131A.tif",
        itemUrl:
          "https://paituli.csc.fi/geoserver/ogc/stac/v1/collections/nls_digital_elevation_model_2m_at_paituli/items/nls_digital_elevation_model_2m_at_paituli_m4131a_2021",
        sourceDatetime: "2021-09-07T05:17:39.000+00:00",
        crs: "EPSG:3067",
        verticalDatum: "N2000 (EPSG:3900) orthometric metres",
        pixelSizeM: 2,
        origin: [356000, 6768000],
        width: 3000,
        height: 3000,
        sha256: "e".repeat(64),
      },
    ],
  };
  const parsed = gradeSeparationSchema.parse({ ...recipe, elevation });
  assert.deepEqual(parsed.elevation, elevation);
  assert.doesNotThrow(() => assertGradeRibbon(pair, parsed));
  assert.equal(
    gradeProfileHeight(parsed, 140),
    gradeProfileHeight(recipe, 140),
  );
  const terrain = {
    schemaVersion: 1,
    trackId: "synthetic-fixture",
    bounds: [0, 0, 1, 1],
    columns: 2,
    rows: 2,
    heights: [100, 200, 300, 400],
    source: {
      name: elevation.source,
      url: elevation.url,
      sampledAt: "2026-11-07T00:00:00Z",
      sampleSpacingM: 80,
      attribution: [elevation.attribution],
      deliveredAt: elevation.deliveredAt,
      sampling: elevation.sampling,
      rasters: elevation.rasters,
    },
  };
  const ground = elevationSchema.parse(terrain);
  assert.deepEqual(ground, terrain);
  assert.equal(sampleElevation(ground, [0, 1]), 100);
  assert.equal(sampleElevation(ground, [1, 0]), 400);
  assert.equal(sampleElevation(ground, [0.5, 0.5]), 250);
  assert.equal(
    sampleElevation({ ...ground, heights: [100, null, 300, 400] }, [0.5, 0.5]),
    null,
  );
  for (const source of [
    { ...terrain.source, name: "Mapzen Terrain Tiles" },
    { ...terrain.source, zoom: 12 },
    { ...terrain.source, deliveredAt: "2026-11-08" },
    { ...terrain.source, attribution: [] },
    {
      ...terrain.source,
      rasters: [...elevation.rasters, ...elevation.rasters],
    },
    {
      ...terrain.source,
      rasters: [{ ...elevation.rasters[0], verticalDatum: "ellipsoid" }],
    },
  ])
    assert.equal(
      elevationSchema.safeParse({ ...terrain, source }).success,
      false,
    );
  for (const invalid of [
    { ...elevation, source: "ICGC MET 50cm 2021-2023" },
    { ...elevation, attribution: "National Land Survey of Finland" },
    { ...elevation, deliveredAt: "2026-11-08" },
    { ...elevation, deliveredAt: "2026-13-40" },
    { ...elevation, crossingInterpolation: undefined },
    { ...elevation, rasters: [...elevation.rasters, ...elevation.rasters] },
    ...[
      { pixelSizeM: 10 },
      { crs: "EPSG:3857" },
      { verticalDatum: "ellipsoid" },
      { origin: [356001, 6768000] },
      { width: 12000 },
      { url: "https://example.com/not-the-native-source.tif" },
      { url: elevation.rasters[0].url + "?render=rgb" },
      { itemUrl: "https://paituli.csc.fi/not-a-dataset-item" },
    ].map((change) => ({
      ...elevation,
      rasters: [{ ...elevation.rasters[0], ...change }],
    })),
    { ...elevation, anchors: anchors.filter(([station]) => station !== 50) },
  ])
    assert.equal(
      gradeSeparationSchema.safeParse({ ...recipe, elevation: invalid })
        .success,
      false,
    );
});

test("Ahvenisto rebuilds road and surrounding ground in the same NLS height datum", async () => {
  const layout = JSON.parse(
    await readFile(
      "data/finland/ahveniston-moottorirata-20303307/layouts/main.geojson",
      "utf8",
    ),
  ) as Layout;
  const grade = layout.metadata.borderInference!.gradeSeparation!;
  const terrain = elevationSchema.parse(layout.metadata.model3d!.terrain);
  assert.ok(grade.elevation.source === "NLS Elevation model 2 m");
  assert.ok(terrain.source.name === "NLS Elevation model 2 m");
  assert.deepEqual(terrain.source.rasters, grade.elevation.rasters);
  await verifyGradeSource(layout, grade);
  const { prepareModel } = await import("../src/model-preparation");
  const { modelInputHash } = await import("../scripts/model-input");
  const model = prepareModel(layout, terrain, modelInputHash(layout, terrain));
  assert.deepEqual(model, layout.metadata.model3d);
  assert.match(model.sources.notes, /NLS Elevation model 2 m ground raster/);
  assert.doesNotMatch(model.sources.notes, /DEM5A/);
  const road = buildRoad(layout);
  assert.equal(road.interpolatedSections, 0);
  assert.ok(Number.isFinite(sampleElevation(terrain, road.origin)));
});

test("RER ground profiles pin the covered native crop and reject mixed editions, datums and resampling", () => {
  const { recipe, pair } = fixture();
  const { anchors, note, sampling, toleranceM } = recipe.elevation;
  const raster = {
    serviceUrl:
      "https://servizigis.regione.emilia-romagna.it/wcs/dtmrer2023_24",
    coverageId: "1",
    crs: "EPSG:7791",
    verticalDatum: "Genova 1942 orthometric metres, ITALGEO2005 geoid",
    pixelSizeM: 0.5,
    bounds: [647202.5, 4932518.5, 648023.5, 4933334.5],
    width: 1642,
    height: 1632,
    sha256: "a".repeat(64),
    footprintSha256: "b".repeat(64),
    footprints: [
      { objectId: 24661, sheet: "32_64704932", acquiredDates: ["2024-03-21"] },
    ],
  };
  const elevation = {
    anchors,
    note,
    sampling,
    toleranceM,
    source: "RER DTM 0.5m 2023-24",
    url: "https://geoportale.regione.emilia-romagna.it/catalogo/dati-cartografici/altimetria/layer-60",
    attribution: "Regione Emilia-Romagna, DTM 0.5m RER 2023-24, CC BY 4.0",
    reuseEvidenceUrl:
      "https://geoportale.regione.emilia-romagna.it/catalogo/dati-cartografici/altimetria/layer-60",
    crossingInterpolation: "both-road-approaches-v1",
    raster,
  };
  const parsed = gradeSeparationSchema.parse({ ...recipe, elevation });
  assert.deepEqual(parsed.elevation, elevation);
  assert.doesNotThrow(() => assertGradeRibbon(pair, parsed));
  const terrain = {
    schemaVersion: 1,
    trackId: "synthetic-fixture",
    bounds: [0, 0, 1, 1],
    columns: 2,
    rows: 2,
    heights: [100, 200, 300, 400],
    source: {
      name: elevation.source,
      url: elevation.url,
      sampledAt: "2026-11-07T00:00:00Z",
      sampleSpacingM: 80,
      attribution: [elevation.attribution],
      sampling,
      raster,
    },
  };
  assert.equal(
    sampleElevation(elevationSchema.parse(terrain), [0.5, 0.5]),
    250,
  );
  for (const change of [
    {
      serviceUrl:
        "https://servizigis.regione.emilia-romagna.it/wcs/dtmrer2025_26",
    },
    { coverageId: "2" },
    { crs: "EPSG:3067" },
    { verticalDatum: "ellipsoid" },
    { pixelSizeM: 5 },
    { width: 1641 },
    { bounds: [647202.6, 4932518.5, 648023.6, 4933334.5] },
    { bounds: [648023.5, 4932518.5, 647202.5, 4933334.5] },
    { bounds: [0, 0, 821, 816] },
    { footprints: [] },
    { footprints: [...raster.footprints, ...raster.footprints] },
    {
      footprints: [{ ...raster.footprints[0], acquiredDates: ["2024-99-99"] }],
    },
    { footprintSha256: "" },
  ]) {
    const bad = { ...raster, ...change };
    assert.equal(
      gradeSeparationSchema.safeParse({
        ...recipe,
        elevation: { ...elevation, raster: bad },
      }).success,
      false,
    );
    assert.equal(
      elevationSchema.safeParse({
        ...terrain,
        source: { ...terrain.source, raster: bad },
      }).success,
      false,
    );
  }
  assert.equal(
    gradeSeparationSchema.safeParse({
      ...recipe,
      elevation: { ...elevation, source: "GSI DEM5A" },
    }).success,
    false,
  );
  assert.equal(
    gradeSeparationSchema.safeParse({
      ...recipe,
      elevation: { ...elevation, anchors: anchors.filter(([s]) => s !== 50) },
    }).success,
    false,
  );
});

test("Fiorano reconstructs its overpass and ground from the same covered RER crop", async () => {
  const layout = JSON.parse(
    await readFile("data/italy/fiorano-circuit-35073932/layouts/main.geojson", "utf8"),
  ) as Layout;
  const grade = layout.metadata.borderInference!.gradeSeparation!;
  const terrain = elevationSchema.parse(layout.metadata.model3d!.terrain);
  assert.ok(grade.elevation.source === "RER DTM 0.5m 2023-24");
  assert.ok(terrain.source.name === "RER DTM 0.5m 2023-24");
  assert.deepEqual(terrain.source.raster, grade.elevation.raster);
  await verifyGradeSource(layout, grade);
  const { prepareModel } = await import("../src/model-preparation");
  const { modelInputHash } = await import("../scripts/model-input");
  const model = prepareModel(layout, terrain, modelInputHash(layout, terrain));
  assert.deepEqual(model, layout.metadata.model3d);
  assert.match(model.sources.notes, /RER DTM 0.5m 2023-24 ground raster/);
  assert.doesNotMatch(model.sources.notes, /DEM5A|NLS Elevation/);
  assert.equal(buildRoad(layout).interpolatedSections, 0);
});
