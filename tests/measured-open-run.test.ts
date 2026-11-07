import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { plane, bounds, length, type Position } from "../src/geo";
import { imageCrossSections } from "../scripts/infer-image-borders";
import { measuredImageBorders } from "../scripts/measured-image-borders";
import { borderMeasurementInputSchema } from "../schemas/border-refinement";
import { validateLayout, validateTrack, type Layout } from "../schemas/data";
import { prepareModel } from "../src/model-preparation";
import { buildRoad, simulateLap, sampleLap } from "../src/lap-simulation";
const hash = "b".repeat(64);
function recipe(trace: Position[], imageSha256 = hash) {
  const f = imageCrossSections(trace, true),
    last = f.count - 1;
  return borderMeasurementInputSchema.parse({
    method: "cross-section-image-anchors-v1",
    routeKind: "run",
    imageSha256,
    note: "Synthetic measured open-road fixture.",
    patches: (["inner", "outer"] as const).map((edge, side) => ({
      edge,
      anchors: [
        ...Array.from({ length: Math.ceil(last / 10) }, (_, i) => i * 10),
        last,
      ].map((station) => {
        const p = f.smooth[station],
          n = f.normals[station],
          offset = side ? -4 : 4;
        return {
          station,
          kind: "image-measured",
          coordinate: f.projection.from([
            p[0] + n[0] * offset,
            p[1] + n[1] * offset,
          ]),
        };
      }),
    })),
  });
}
function fixture() {
  const p = plane([0, 0]),
    trace = Array.from({ length: 81 }, (_, i) =>
      p.from([i * 3, 20 * Math.sin(i / 15)]),
    );
  return { trace, input: recipe(trace) };
}
test("measured open runs replay distinct endpoints with ordered left/right edges and no closing segment", () => {
  const { trace, input } = fixture(),
    before = structuredClone(input),
    f = imageCrossSections(trace, true);
  const a = measuredImageBorders(trace, input, hash),
    b = measuredImageBorders(trace, input, hash);
  assert.deepEqual(a, b);
  assert.deepEqual(input, before);
  assert.equal(a.result.inner.length, f.count);
  assert.equal(a.result.outer.length, f.count);
  for (const patch of input.patches) {
    assert.notDeepEqual(a.result[patch.edge][0], a.result[patch.edge].at(-1));
    for (const anchor of patch.anchors)
      assert.deepEqual(a.result[patch.edge][anchor.station], anchor.coordinate);
  }
  assert.equal(a.measurement.routeKind, "run");
  assert.equal("evidence" in a, false);
});
test("open measurements reject wrong semantics, reversed edges, missing endpoints and unsupported paired runs", () => {
  const { trace, input } = fixture();
  assert.throws(
    () => measuredImageBorders(trace, { ...input, routeKind: undefined }, hash),
    /closed/,
  );
  assert.throws(
    () => measuredImageBorders([...trace, trace[0]], input, hash),
    /distinct/,
  );
  for (const change of [
    (x: typeof input) => x.patches[0].anchors.shift(),
    (x: typeof input) => x.patches[1].anchors.pop(),
    (x: typeof input) => x.patches.forEach((p) => p.anchors.splice(1, 5)),
    (x: typeof input) => {
      [x.patches[0].edge, x.patches[1].edge] = [
        x.patches[1].edge,
        x.patches[0].edge,
      ];
    },
    (x: typeof input) => {
      x.patches[0].anchors.at(-1)!.coordinate =
        x.patches[0].anchors[0].coordinate;
    },
  ]) {
    const x = structuredClone(input);
    change(x);
    assert.throws(() => measuredImageBorders(trace, x, hash));
  }
  const displaced = structuredClone(input),
    frames = imageCrossSections(trace, true);
  for (const patch of displaced.patches)
    for (const anchor of patch.anchors) {
      const p = frames.projection.to(anchor.coordinate),
        n = frames.normals[anchor.station];
      anchor.coordinate = frames.projection.from([
        p[0] + n[0] * 20,
        p[1] + n[1] * 20,
      ]);
    }
  assert.throws(
    () => measuredImageBorders(trace, displaced, hash),
    /more than 10 metres/,
  );
  assert.throws(
    () =>
      measuredImageBorders(
        trace,
        {
          ...input,
          method: "paired-image-edge-anchors-v1",
          interpolation: "edge-linear-v1",
        },
        hash,
      ),
    /Open measurements/,
  );
});
test("open measurements retain pinned-image coverage checks at their separate finish", () => {
  const { trace, input } = fixture(),
    image = {
      width: 512,
      height: 512,
      extent: [-100, -256, 412, 256] as [number, number, number, number],
      data: new Uint8Array(512 * 512 * 4).fill(255),
    };
  assert.doesNotThrow(() => measuredImageBorders(trace, input, hash, image));
  // Remove only the finish anchor's four raster neighbours.
  const finish = input.patches[0].anchors.at(-1)!.coordinate,
    x = Math.floor((6378137 * finish[0] * Math.PI) / 180 + 100 - 0.5),
    y = Math.floor(
      256 - 6378137 * Math.asinh(Math.tan((finish[1] * Math.PI) / 180)) - 0.5,
    );
  for (const dx of [0, 1])
    for (const dy of [0, 1])
      image.data[((y + dy) * image.width + x + dx) * 4 + 3] = 0;
  assert.throws(
    () => measuredImageBorders(trace, input, hash, image),
    /coverage/,
  );
});
test("measured open metadata validates and prepares a standing-start run on the retained terrain", () => {
  const root = "data/united-states/us-apex-motor-b7ddcfd3/",
    track = validateTrack(
      JSON.parse(readFileSync(root + "track.json", "utf8")),
    ),
    d: Layout = JSON.parse(
      readFileSync(root + "layouts/apex-i-straight.geojson", "utf8"),
    );
  const terrain = d.metadata.model3d!.terrain,
    p = plane([
      (terrain.bounds[0] + terrain.bounds[2]) / 2,
      (terrain.bounds[1] + terrain.bounds[3]) / 2,
    ]),
    trace = Array.from({ length: 81 }, (_, i) => p.from([-200 + i * 5, 0])),
    original = structuredClone(trace);
  d.features.find((f) => f.properties.role === "trace")!.geometry = {
    type: "LineString",
    coordinates: trace,
  };
  d.metadata.closed = false;
  d.metadata.lengthM = length(trace);
  d.metadata.borderInference!.edgeConvention = "left-right-along-trace";
  const input = recipe(trace, d.metadata.borderInference!.imagery.sha256),
    built = measuredImageBorders(trace, input, input.imageSha256);
  for (const edge of ["inner", "outer"] as const)
    d.features.find((f) => f.properties.role === edge)!.geometry = {
      type: "LineString",
      coordinates: built.result[edge],
    };
  d.bbox = bounds(
    d.features.flatMap((f) => f.geometry.coordinates as Position[]),
  );
  d.metadata.borderInference!.method = "image-measured-cross-sections-v1";
  d.metadata.borderInference!.measurement = built.measurement;
  delete d.metadata.borderInference!.evidence;
  delete d.metadata.model3d;
  d.metadata.model3d = prepareModel(d, terrain, "a".repeat(64));
  validateLayout(d, track, d.metadata.layoutId);
  assert.deepEqual(
    d.features.find((f) => f.properties.role === "trace")!.geometry.coordinates,
    original,
  );
  assert.deepEqual(d.metadata.model3d.terrain, terrain);
  assert.equal(d.metadata.model3d.kind, "run");
  const road = buildRoad(d),
    lap = simulateLap(road);
  assert.equal(road.interpolatedSections, 0);
  assert.equal(lap.speed[0], 0);
  assert.equal(road.points.at(-1)!.ds, 0);
  assert.ok(lap.speed.at(-1)! > 0);
  assert.equal(sampleLap(lap, lap.duration + 100).distance, road.length);
  assert.notEqual(
    d.metadata.model3d.elevation[0][1],
    d.metadata.model3d.elevation.at(-1)![1],
  );
});
