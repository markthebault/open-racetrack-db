import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { validateLayout, validateTrack } from "../schemas/data";
import { trackModelSchema } from "../schemas/track-model";
import { popularModels } from "../scripts/popular-models";
import {
  compressElevation,
  imageryForLayout,
  prepareModel,
  PREPARATION_VERSION,
} from "../src/model-preparation";
import { modelInputHash } from "../scripts/model-input";
import {
  buildRoad,
  simulateLap,
  roadHeight,
  type ElevationAnchor,
} from "../src/lap-simulation";
import { indexBorders, borderSection } from "../src/border-sections";
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const index = read("data/index.json");

test("explicit display imagery survives regeneration and participates in the source hash", () => {
  const files = [
    "data/japan/osm-438021322/layouts/main.geojson",
    "data/japan/osm-438021322/layouts/tsukuba.geojson",
    ...read("sources/research/imagery-service-repairs.json").records.map((r: { file: string }) => r.file),
  ];
  for (const file of files) {
    const data = read(file);
    const { layout } = load(data.metadata.trackId, data.metadata.layoutId);
    const old = layout.metadata.model3d!;
    assert.ok(old.preparation?.preserveImageryReference);
    const boundary = old.kind !== "surface" && old.pathMethod === "boundary-normal-midpoints-v1";
    const hash = modelInputHash(layout, old.terrain, boundary);
    assert.equal(hash, old.preparation.inputSha256);
    const regenerated = prepareModel(layout, old.terrain, hash, boundary);
    // Older source descriptions can predate the current generator wording.
    regenerated.sources.notes = old.sources.notes;
    assert.deepEqual(regenerated, old);
    layout.metadata.model3d!.imagery.attribution += " updated";
    assert.notEqual(modelInputHash(layout, old.terrain, boundary), hash);
  }
});
function load(trackId: string, layoutId: string) {
  const entry = index.tracks.find((t: { id: string }) => t.id === trackId),
    track = validateTrack(read("data/" + entry.file)),
    item = track.layouts.find((l) => l.id === layoutId)!;
  const path = "data/" + entry.file.replace(/track.json$/, "") + item.file;
  return { layout: validateLayout(read(path), track, layoutId), path };
}

test("all 20 popular circuits have a self-contained validated model and a finite drivable loop", () => {
  assert.equal(popularModels.length, 20);
  assert.equal(new Set(popularModels.map((p) => p.trackId)).size, 20);
  assert.ok(
    !popularModels.some(
      (p) => (p.trackId as string) === "be-spa-francorchamps",
    ),
  );
  for (const selection of popularModels) {
    const { layout } = load(selection.trackId, selection.layoutId),
      model = layout.metadata.model3d!;
    assert.ok(model.kind !== "surface");
    const pairedBorders = layout.metadata.borderInference?.measurement || layout.metadata.borderInference?.supersedes?.imageReview;
    assert.equal(model.quality.elevation, "terrain-raster");
    assert.equal(model.quality.curbs, "geometry-estimated");
    assert.equal(model.quality.stationing, pairedBorders ? "border-midline" : "mapped-trace");
    if (pairedBorders) assert.equal(model.pathMethod, "paired-border-midpoints");
    assert.equal(model.terrain.trackId, selection.trackId);
    assert.ok(model.curbs.length > 0);
    assert.ok(model.sources.notes.includes("not extracted from imagery"));
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          version: PREPARATION_VERSION,
          features: layout.features.filter(f=>f.properties.role!=="ideal"),
          timing: layout.metadata.timing,
          lengthM: layout.metadata.lengthM,
          terrain: model.terrain,
          ...(layout.metadata.borderInference
            ? { borderInference: layout.metadata.borderInference }
            : {}),
        }),
      )
      .digest("hex");
    assert.equal(model.preparation!.inputSha256, hash, "stale generated model");
    const road = buildRoad(layout),
      lap = simulateLap(road);
    assert.ok(road.interpolatedSections / road.points.length <= 0.08);
    assert.ok(
      road.points.every((p) => Number.isFinite(p.y) && p.left + p.right >= 3),
    );
    assert.ok(lap.duration > 60 && lap.duration < 400);
    assert.ok(Math.max(...lap.speed) <= 260 / 3.6 + 1e-6);
  }
});

test("terrain compression preserves sample heights within the stated tolerance and keeps loop closure", () => {
  const samples: ElevationAnchor[] = Array.from({ length: 201 }, (_, i) => [
    i * 25,
    300 +
      30 * Math.sin((i / 200) * 2 * Math.PI) +
      4 * Math.sin((i / 200) * 12 * Math.PI),
  ]);
  samples.at(-1)![1] = samples[0][1];
  const anchors = compressElevation(samples, 0.5);
  assert.ok(anchors.length < samples.length / 2);
  assert.deepEqual(anchors[0], samples[0]);
  assert.deepEqual(anchors.at(-1), samples.at(-1));
  for (const [s, h] of samples)
    assert.ok(Math.abs(roadHeight(anchors, s) - h) <= 0.500001);
  const flat = compressElevation(
    [
      [0, 42],
      [100, 42],
      [200, 42],
      [300, 42],
    ],
    0.5,
  );
  assert.equal(flat.length, 3);
});

test("border indexing pairs separate source edges even when the centreline is outside the road", () => {
  const paths: [number, number][][] = [
    [
      [5, -100],
      [5, 100],
    ],
    [
      [17, -100],
      [17, 100],
    ],
  ];
  assert.deepEqual(borderSection(indexBorders(paths), 0, 0, 1, 0), [17, -5]);
  assert.equal(
    borderSection(
      indexBorders([
        [
          [5, -10],
          [5, 10],
        ],
        [
          [5.1, -10],
          [5.1, 10],
        ],
      ]),
      0,
      0,
      1,
      0,
    ),
    undefined,
  );
  for (const cellSize of [16, 32, 64, 128])
    for (let z = -90; z < 90; z += 7)
      assert.deepEqual(
        borderSection(indexBorders(paths, cellSize), 0, z, 1, 0),
        [17, -5],
      );
});

test("imagery georeferencing is derived from the selected course, without provider bytes in the model", () => {
  const { layout } = load("it-monza", "grand-prix"),
    image = imageryForLayout(layout),
    url = new URL(image.url);
  assert.equal(url.searchParams.get("bboxSR"), "3857");
  assert.equal(url.searchParams.get("bbox"), image.extent3857.join(","));
  const [w, h] = url.searchParams.get("size")!.split(",").map(Number),
    [west, south, east, north] = image.extent3857;
  assert.ok(Math.abs((east - west) / (north - south) - w / h) < 1e-6);
  assert.ok(image.attribution.includes("Esri"));
  assert.ok(!JSON.stringify(image).includes("base64"));
});

test("ArcGIS map and image exports retain the measured extent and image response", () => {
  const { layout } = load("us-waterford-hills-796357203", "main");
  delete layout.metadata.model3d;
  const source = layout.metadata.borderInference!.imagery;
  for (const endpoint of ["MapServer/export", "ImageServer/exportImage"]) {
    source.url = `https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO/${endpoint}?f=pjson&bbox=0,0,1,1&size=1,1&bboxSR=3857&imageSR=3857&layers=show:0&format=png24`;
    const display = imageryForLayout(layout), url = new URL(display.url);
    assert.equal(url.pathname.endsWith(endpoint), true);
    assert.equal(url.searchParams.get("f"), "image");
    assert.equal(url.searchParams.get("bbox"), source.extent3857.join(","));
    assert.equal(url.searchParams.get("size"), `${source.width},${source.height}`);
    assert.equal(url.searchParams.get("imageSR"), "3857");
    assert.equal(url.searchParams.get("layers"), "show:0");
    assert.equal(url.searchParams.get("format"), "png24");
    assert.deepEqual(display.extent3857, source.extent3857);
    assert.equal(display.attribution, source.attribution);
    assert.equal(display.termsUrl, source.reuseEvidenceUrl);
  }
});

test("dated NAIP playback retains the exact RGB render and rejects mismatched georeferencing", () => {
  const { layout } = load("us-waterford-hills-796357203", "main");
  const source = layout.metadata.borderInference!.imagery;
  const display = imageryForLayout(layout);
  assert.equal(display.url, source.url);
  assert.deepEqual(display.extent3857, source.extent3857);
  assert.equal(display.attribution, source.attribution);
  assert.equal(display.termsUrl, source.reuseEvidenceUrl);
  for (const change of [
    (u: URL) => u.searchParams.set("dst_crs", "EPSG:4326"),
    (u: URL) => u.searchParams.delete("bidx"),
    (u: URL) => { u.pathname = u.pathname.replace(/\d+x\d+\.png$/, "100x100.png"); },
    (u: URL) => { u.pathname = u.pathname.replace("/bbox/", "/bbox/1,"); },
  ]) {
    const copy = structuredClone(layout), url = new URL(source.url);
    change(url); copy.metadata.borderInference!.imagery.url = url.href;
    assert.notEqual(imageryForLayout(copy).url, url.href);
  }
});

test("previous downloaded Spa model fields remain readable without changing its source profile", () => {
  const { layout } = load("be-spa-francorchamps", "grand-prix"),
    model = layout.metadata.model3d!;
  assert.ok(model.kind !== "surface");
  const { referenceLengthM, quality, ...rest } = model;
  assert.equal(quality.elevation, "venue-anchors");
  const legacy = trackModelSchema.parse({
    ...rest,
    officialLengthM: referenceLengthM,
  });
  assert.ok(legacy.kind !== "surface");
  assert.equal(legacy.referenceLengthM, referenceLengthM);
  assert.deepEqual(legacy.elevation, model.elevation);
  assert.equal(legacy.quality.curbs, "imagery-reviewed");
});
