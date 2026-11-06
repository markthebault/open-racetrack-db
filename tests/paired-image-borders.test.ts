import { test } from "node:test";
import assert from "node:assert/strict";
import { measuredImageBorders } from "../scripts/measured-image-borders";
import {
  imageCrossSections,
  type Raster,
} from "../scripts/infer-image-borders";
import { projectSharedImageMeasurements } from "../scripts/project-border-refinement";
import { borderMeasurementInputSchema } from "../schemas/border-refinement";
import { borderInferenceSchema } from "../schemas/border-inference";
import { plane, type Position } from "../src/geo";
const hash = "a".repeat(64);
function fixture(radius = 100, width = 12, shift = 4) {
  const projection = plane([0, 0]),
    trace = Array.from({ length: 61 }, (_, i) =>
      projection.from([
        radius * Math.cos((i * Math.PI) / 30),
        radius * Math.sin((i * Math.PI) / 30),
      ]),
    );
  trace[60] = trace[0];
  const frames = imageCrossSections(trace),
    cadence = Math.max(1, Math.floor(frames.count / 25)),
    stations = [
      ...Array.from(
        { length: Math.ceil(frames.count / cadence) },
        (_, i) => i * cadence,
      ),
      frames.count,
    ];
  const input = borderMeasurementInputSchema.parse({
    method: "paired-image-edge-anchors-v1",
    interpolation: "edge-linear-v1",
    imageSha256: hash,
    note: "Independent paired image measurements; intervening segments remain estimates.",
    patches: (["inner", "outer"] as const).map((edge, side) => {
      const r = radius + (side ? width / 2 : -width / 2);
      const anchors = stations.map((station) => ({
        station,
        kind: "image-measured",
        coordinate: projection.from([
          shift + r * Math.cos((station * Math.PI * 2) / frames.count),
          r * Math.sin((station * Math.PI * 2) / frames.count),
        ]),
      }));
      anchors.at(-1)!.coordinate = anchors[0].coordinate;
      return { edge, anchors };
    }),
  });
  const image: Raster = {
    width: 512,
    height: 512,
    extent: [-256, -256, 256, 256],
    data: new Uint8Array(512 * 512 * 4).fill(255),
  };
  return { trace, input, image, frames, projection };
}

test("independent image pairs preserve physical coordinates beyond old source normals without changing the trace", () => {
  const { trace, input, image } = fixture(),
    beforeTrace = structuredClone(trace),
    beforeInput = structuredClone(input);
  assert.throws(
    () =>
      measuredImageBorders(
        trace,
        { ...input, method: "cross-section-image-anchors-v1" },
        hash,
        image,
      ),
    /cross-section/,
  );
  const built = measuredImageBorders(trace, input, hash, image);
  assert.deepEqual(built, measuredImageBorders(trace, input, hash));
  assert.deepEqual(trace, beforeTrace);
  assert.deepEqual(input, beforeInput);
  for (const patch of input.patches)
    for (const anchor of patch.anchors)
      assert.ok(
        Math.hypot(
          ...plane(anchor.coordinate).to(
            built.result[patch.edge][anchor.station],
          ),
        ) < 0.03,
      );
  assert.equal("evidence" in built, false);
});

test("independent pairs require matched complete stations, explicit interpolation and a supported source displacement", () => {
  const { trace, input } = fixture();
  for (const change of [
    (x: typeof input) => {
      x.interpolation = undefined;
    },
    (x: typeof input) => {
      x.patches[1].anchors.splice(1, 1);
    },
    (x: typeof input) => {
      x.patches.forEach((p) => p.anchors.shift());
    },
  ]) {
    const x = structuredClone(input);
    change(x);
    assert.throws(() => measuredImageBorders(trace, x, hash));
  }
  const displaced = fixture(100, 12, 16);
  assert.throws(
    () => measuredImageBorders(displaced.trace, displaced.input, hash),
    /10 metres/,
  );
});

test("independent image pairs retain source driving order even where the reverse road lies within the displacement bound", () => {
  const { trace, input } = fixture(4, 4.2, 0);
  measuredImageBorders(trace, input, hash);
  const reversed = structuredClone(input);
  for (const patch of reversed.patches) {
    const coordinates = patch.anchors.map((a) => a.coordinate).toReversed();
    patch.anchors.forEach((a, i) => {
      a.coordinate = coordinates[i];
    });
  }
  assert.throws(
    () => measuredImageBorders(trace, reversed, hash),
    /driving order/,
  );
});

test("independent pairs reject rungs along the road instead of across it", () => {
  const { trace, input, projection, frames } = fixture(),
    x = structuredClone(input),
    i = 6;
  const theta = (x.patches[0].anchors[i].station * Math.PI * 2) / frames.count;
  x.patches.forEach((p, side) => {
    const a = projection.to(p.anchors[i].coordinate),
      d = side ? -13 : 13;
    p.anchors[i].coordinate = projection.from([
      a[0] - d * Math.sin(theta),
      a[1] + d * Math.cos(theta),
    ]);
  });
  assert.throws(
    () => measuredImageBorders(trace, x, hash),
    /cross their measured road/,
  );
});

test("paired edges still require actual pinned-image coverage and reject changed imagery", () => {
  const { trace, input, image, projection } = fixture();
  assert.throws(
    () => measuredImageBorders(trace, input, "b".repeat(64), image),
    /hash/,
  );
  const q = projection.to(input.patches[0].anchors[0].coordinate),
    x = Math.round(q[0] + 255.5),
    y = Math.round(255.5 - q[1]);
  image.data[(y * 512 + x) * 4 + 3] = 0;
  assert.throws(
    () => measuredImageBorders(trace, input, hash, image),
    /missing pinned-image/,
  );
});

test("shared independent image pairs retain exact image coordinates and require explicit reverse reuse", () => {
  const { trace, input } = fixture(),
    built = measuredImageBorders(trace, input, hash);
  const same = projectSharedImageMeasurements(
    { trace, input: built.measurement },
    { trace, imageSha256: hash },
  );
  assert.deepEqual(same.patches, input.patches);
  assert.equal(same.rejected.length, 0);
  const reverse = trace.toReversed();
  assert.equal(
    projectSharedImageMeasurements(
      { trace, input: built.measurement },
      { trace: reverse, imageSha256: hash },
    ).mappings.length,
    0,
  );
  const reused = projectSharedImageMeasurements(
    { trace, input: built.measurement },
    { trace: reverse, imageSha256: hash, direction: "reverse" },
  );
  assert.equal(reused.rejected.length, 0);
  const result = measuredImageBorders(
    reverse,
    { ...input, patches: reused.patches },
    hash,
  );
  for (const edge of ["inner", "outer"] as const) {
    for (let i = 0; i < result.result[edge].length; i++)
      assert.ok(
        Math.hypot(
          ...plane(result.result[edge][i]).to(built.result[edge].at(-1 - i)!),
        ) < 0.02,
      );
    for (const a of reused.patches.find((p) => p.edge === edge)!.anchors)
      assert.ok(
        input.patches
          .find((p) => p.edge === edge)!
          .anchors.some(
            (b) =>
              JSON.stringify(a.coordinate) === JSON.stringify(b.coordinate),
          ),
      );
  }
});

test("paired metadata cannot claim the cross-section method or an automatic detector", () => {
  const { trace, input } = fixture(),
    built = measuredImageBorders(trace, input, hash);
  const value = {
    schemaVersion: 1,
    method: "image-measured-paired-edges-v1",
    status: "estimated",
    reviewedAt: null,
    traceSha256: hash,
    measurement: built.measurement,
    imagery: {
      sourceId: "test",
      url: "https://example.org/image",
      reuseEvidenceUrl: "https://example.org/rights",
      license: "public-domain",
      attribution: "Test image",
      retrievedAt: "2026-11-06T00:00:00.000Z",
      sha256: hash,
      width: 512,
      height: 512,
      extent3857: [-256, -256, 256, 256],
      groundPixelSizeM: 1,
    },
    note: "Sparse independent image pairs remain estimates.",
  };
  assert.ok(borderInferenceSchema.safeParse(value).success);
  assert.ok(
    !borderInferenceSchema.safeParse({
      ...value,
      method: "image-measured-cross-sections-v1",
    }).success,
  );
  assert.ok(
    !borderInferenceSchema.safeParse({
      ...value,
      method: "rgb-road-local-appearance-v4",
    }).success,
  );
});

test("physical pair reuse follows a different target seam and leaves its unmeasured closure explicit", () => {
  const { trace, input } = fixture(),
    built = measuredImageBorders(trace, input, hash),
    open = trace.slice(0, -1);
  const target = [...open.slice(15), ...open.slice(0, 15), open[15]];
  const reused = projectSharedImageMeasurements(
    { trace, input: built.measurement },
    { trace: target, imageSha256: hash },
  );
  assert.ok(reused.mappings.length > 40);
  for (const patch of reused.patches) {
    assert.ok(
      patch.anchors.every(
        (a, i) => i === 0 || a.station > patch.anchors[i - 1].station,
      ),
    );
    for (const a of patch.anchors)
      assert.ok(
        input.patches
          .find((p) => p.edge === patch.edge)!
          .anchors.some(
            (b) =>
              JSON.stringify(a.coordinate) === JSON.stringify(b.coordinate),
          ),
      );
  }
  assert.throws(
    () =>
      measuredImageBorders(target, { ...input, patches: reused.patches }, hash),
    /complete station range/,
  );
});

test("dense paired observations colliding at a target station retain one supported pair and report the others", () => {
  const source = fixture(100.4, 12, 0),
    target = fixture(100, 12, 0);
  source.input.patches.forEach((p, side) => {
    const r = 100.4 + (side ? 6 : -6);
    p.anchors = Array.from(
      { length: source.frames.count + 1 },
      (_, station) => ({
        station,
        kind: "image-measured",
        coordinate: source.projection.from([
          r * Math.cos((station * Math.PI * 2) / source.frames.count),
          r * Math.sin((station * Math.PI * 2) / source.frames.count),
        ]),
      }),
    );
    p.anchors.at(-1)!.coordinate = p.anchors[0].coordinate;
  });
  const built = measuredImageBorders(source.trace, source.input, hash);
  const reused = projectSharedImageMeasurements(
    { trace: source.trace, input: built.measurement },
    { trace: target.trace, imageSha256: hash },
  );
  assert.ok(reused.rejected.some((r) => r.reason.includes("collide")));
  assert.deepEqual(
    reused.patches[0].anchors.map((a) => a.station),
    reused.patches[1].anchors.map((a) => a.station),
  );
  measuredImageBorders(
    target.trace,
    { ...source.input, patches: reused.patches },
    hash,
  );
});

test("close-hairpin playback uses measured pairs without borrowing neighbouring sections or repairing widths", async () => {
  const { readFile } = await import("node:fs/promises"),
    { buildRoad } = await import("../src/lap-simulation"),
    { distance } = await import("../src/geo");
  for (const id of ["a", "b", "c"]) {
    const layout = JSON.parse(
      await readFile(
        `data/canada/ca-cameron-speedway-kart-circuit-f7997f0a/layouts/historical-southern-course-${id}.geojson`,
        "utf8",
      ),
    );
    const road = buildRoad(layout),
      inner = layout.features.find((f: any) => f.properties.role === "inner")
        .geometry.coordinates,
      outer = layout.features.find((f: any) => f.properties.role === "outer")
        .geometry.coordinates,
      maximumMeasuredWidth = Math.max(
        ...inner.map((p: Position, i: number) => distance(p, outer[i])),
      );
    assert.equal(road.interpolatedSections, 0);
    assert.ok(road.points.every((p) => p.leftEdge && p.rightEdge));
    assert.ok(
      road.points.every((p) => p.left + p.right <= maximumMeasuredWidth + 0.02),
    );
    for (let i = 0; i < road.points.length; i++) {
      const p = road.points[i],
        a = road.points[(i - 1 + road.points.length) % road.points.length],
        b = road.points[(i + 1) % road.points.length];
      assert.ok((b.z - a.z) * p.nx - (b.x - a.x) * p.nz > 0);
    }
  }
});

test("image-paired playback keeps driver-left and driver-right correct when the complete route is reversed", async () => {
  const { readFile } = await import("node:fs/promises"),
    { buildRoad } = await import("../src/lap-simulation");
  const layout = JSON.parse(
    await readFile(
      "data/canada/ca-cameron-speedway-kart-circuit-f7997f0a/layouts/historical-southern-course-a.geojson",
      "utf8",
    ),
  );
  // A controlled geometry reversal tests runtime orientation; it is not published source evidence.
  for (const feature of layout.features)
    if (["trace", "inner", "outer"].includes(feature.properties.role))
      feature.geometry.coordinates.reverse();
  const road = buildRoad(layout);
  assert.equal(road.interpolatedSections, 0);
  for (let i = 0; i < road.points.length; i++) {
    const p = road.points[i],
      a = road.points[(i - 1 + road.points.length) % road.points.length],
      b = road.points[(i + 1) % road.points.length];
    assert.ok((b.z - a.z) * p.nx - (b.x - a.x) * p.nz > 0);
  }
});

test("image-paired station correspondence does not replace terrain heights with seed road levels", async () => {
  const { readFile } = await import("node:fs/promises"),
    { buildRoad } = await import("../src/lap-simulation"),
    { terrainProfile } = await import("../src/model-preparation");
  const layout = JSON.parse(
    await readFile(
      "data/canada/ca-cameron-speedway-kart-circuit-f7997f0a/layouts/historical-southern-course-a.geojson",
      "utf8",
    ),
  );
  layout.metadata.model3d.elevation = [
    [0, 0],
    [layout.metadata.model3d.referenceLengthM, 0],
  ];
  const road = buildRoad(layout),
    profile = terrainProfile(road, layout.metadata.model3d.terrain);
  assert.ok(profile.every((p) => p[1] >= 225 && p[1] <= 226));
  assert.ok(
    terrainProfile(road, layout.metadata.model3d.terrain, true).every(
      (p) => p[1] === 0,
    ),
  );
});
