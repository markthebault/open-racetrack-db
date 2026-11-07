import { test } from "node:test";
import assert from "node:assert/strict";
import { measuredImageBorders } from "../scripts/measured-image-borders";
import {
  imageCrossSections,
  type Raster,
} from "../scripts/infer-image-borders";
import { plane } from "../src/geo";
import { borderMeasurementInputSchema } from "../schemas/border-refinement";
const hash = "b".repeat(64);
function fixture() {
  const p = plane([0, 0]),
    trace = Array.from({ length: 181 }, (_, i) =>
      p.from([
        100 * Math.cos((i * Math.PI) / 90),
        100 * Math.sin((i * Math.PI) / 90),
      ]),
    );
  trace[180] = trace[0];
  const f = imageCrossSections(trace),
    image: Raster = {
      width: 512,
      height: 512,
      extent: [-256, -256, 256, 256],
      data: new Uint8Array(512 * 512 * 4).fill(255),
    };
  const input = borderMeasurementInputSchema.parse({
    method: "cross-section-image-anchors-v1",
    imageSha256: hash,
    note: "Sparse image measurements; intervals remain estimates.",
    patches: (["inner", "outer"] as const).map((edge, side) => ({
      edge,
      anchors: [
        ...Array.from({ length: Math.ceil(f.count / 10) }, (_, i) => i * 10),
        f.count,
      ].map((station) => {
        const k = f.index(station),
          n = f.normals[k],
          q = f.smooth[k],
          d = side === 0 ? 6 : -6;
        return {
          station,
          kind: "image-measured",
          coordinate: f.projection.from([q[0] + n[0] * d, q[1] + n[1] * d]),
        };
      }),
    })),
  });
  return { trace, image, input, f };
}

test("local straight interpolation changes only the selected edge interval and replays exactly", () => {
  const { trace, image, input } = fixture();
  const recipe = { ...input, linearIntervals: [{ edge: "outer" as const, startStation: 10, endStation: 20 }] };
  const before = structuredClone(recipe);
  const baseline = measuredImageBorders(trace, input, hash, image);
  const local = measuredImageBorders(trace, recipe, hash, image);
  const linear = measuredImageBorders(trace, { ...input, interpolation: "edge-linear-v1" }, hash, image);
  assert.deepEqual(local.result.inner, baseline.result.inner);
  assert.deepEqual(local.result.outer.slice(0, 11), baseline.result.outer.slice(0, 11));
  assert.deepEqual(local.result.outer.slice(20), baseline.result.outer.slice(20));
  assert.deepEqual(local.result.outer[15], linear.result.outer[15]);
  assert.notDeepEqual(local.result.outer[15], baseline.result.outer[15]);
  assert.deepEqual(recipe, before);
  const { resultSha256, ...embedded } = local.measurement;
  const replay = measuredImageBorders(trace, embedded, hash, image);
  assert.equal(replay.measurement.resultSha256, resultSha256);
  assert.deepEqual(replay, local);
});

test("local straight intervals reject ambiguous modes, unordered ranges and unanchored endpoints", () => {
  const { trace, input } = fixture();
  const range = { edge: "outer" as const, startStation: 10, endStation: 20 };
  for (const ranges of [
    [{ ...range, startStation: 11 }],
    [{ ...range, endStation: 10 }],
    [range, { ...range, startStation: 10, endStation: 30 }],
  ]) assert.throws(() => measuredImageBorders(trace, { ...input, linearIntervals: ranges }, hash), /existing edge anchors/);
  assert.throws(() => measuredImageBorders(trace, {
    ...input, interpolation: "edge-linear-v1", linearIntervals: [range],
  }, hash), /without global interpolation/);
  assert.throws(() => measuredImageBorders(trace, {
    ...input, method: "paired-image-edge-anchors-v1", interpolation: "edge-linear-v1", linearIntervals: [range],
  }, hash), /Local linear intervals/);
});

test("the stricter 50 metre gap applies inside local straight intervals only", () => {
  const { trace, input } = fixture(), sparse = structuredClone(input);
  const outer = sparse.patches.find((p) => p.edge === "outer")!;
  outer.anchors = outer.anchors.filter((a) => ![10, 20].includes(a.station));
  measuredImageBorders(trace, sparse, hash);
  assert.throws(() => measuredImageBorders(trace, {
    ...sparse, linearIntervals: [{ edge: "outer", startStation: 0, endStation: 30 }],
  }, hash), /gap exceeds 50/);
  measuredImageBorders(trace, {
    ...sparse, linearIntervals: [{ edge: "outer", startStation: 30, endStation: 40 }],
  }, hash);
});

test("local straight reconstruction still checks pixels between its observed anchors", () => {
  const { trace, input, image } = fixture();
  const recipe = { ...input, linearIntervals: [{ edge: "outer" as const, startStation: 10, endStation: 20 }] };
  const built = measuredImageBorders(trace, recipe, hash, image);
  const point = built.result.outer[15];
  const x = Math.floor(((6378137 * point[0] * Math.PI / 180 - image.extent[0]) / (image.extent[2] - image.extent[0])) * image.width - .5);
  const y = Math.floor(((image.extent[3] - 6378137 * Math.asinh(Math.tan(point[1] * Math.PI / 180))) / (image.extent[3] - image.extent[1])) * image.height - .5);
  if (!image.data) throw new Error("Expected dense fixture raster");
  image.data[(y * image.width + x) * 4 + 3] = 0;
  assert.throws(() => measuredImageBorders(trace, recipe, hash, image), /missing pinned-image coverage/);
});
test("complete image measurements replay without an automatic seed or invented confidence scores", () => {
  const { trace, image, input } = fixture(),
    before = structuredClone(input),
    a = measuredImageBorders(trace, input, hash, image),
    b = measuredImageBorders(trace, input, hash);
  assert.deepEqual(a, b);
  assert.deepEqual(input, before);
  assert.equal(a.result.inner.length, a.result.outer.length);
  assert.equal(a.result.inner.length > 200, true);
  assert.equal("evidence" in a, false);
});

test("explicit linear edges interpolate measured coordinates rather than retaining trace curvature", () => {
  const { trace, image, input, f } = fixture();
  const linear = measuredImageBorders(
    trace,
    { ...input, interpolation: "edge-linear-v1" },
    hash,
    image,
  );
  const legacy = measuredImageBorders(trace, input, hash, image);
  assert.equal(linear.measurement.interpolation, "edge-linear-v1");
  for (const patch of input.patches) {
    const a = f.projection.to(patch.anchors[0].coordinate);
    const b = f.projection.to(patch.anchors[1].coordinate);
    const midpoint = f.projection.to(linear.result[patch.edge][5]);
    assert.ok(
      Math.hypot(
        midpoint[0] - (a[0] + b[0]) / 2,
        midpoint[1] - (a[1] + b[1]) / 2,
      ) < 0.02,
    );
    assert.notDeepEqual(
      linear.result[patch.edge][5],
      legacy.result[patch.edge][5],
    );
  }
  const { resultSha256, ...replayInput } = linear.measurement;
  assert.equal(resultSha256.length, 64);
  assert.deepEqual(measuredImageBorders(trace, replayInput, hash), linear);
  const gap = structuredClone(input);
  gap.patches[0].anchors.splice(1, 1);
  assert.throws(
    () =>
      measuredImageBorders(
        trace,
        { ...gap, interpolation: "edge-linear-v1" },
        hash,
      ),
    /50 metres/,
  );
  const point = plane([0, 0]).to(linear.result.inner[5]);
  const ix = Math.round(point[0] + 255.5),
    iy = Math.round(255.5 - point[1]);
  image.data[(iy * 512 + ix) * 4 + 3] = 0;
  assert.throws(
    () =>
      measuredImageBorders(
        trace,
        { ...input, interpolation: "edge-linear-v1" },
        hash,
        image,
      ),
    /missing/,
  );
});

test("linear measurement projection verifies its interpolation-specific reconstruction hash", async () => {
  const { projectSharedImageMeasurements } = await import(
    "../scripts/project-border-refinement"
  );
  const { trace, input } = fixture();
  const original = measuredImageBorders(
    trace,
    { ...input, interpolation: "edge-linear-v1" },
    hash,
  );
  const projected = projectSharedImageMeasurements(
    { trace, input: original.measurement },
    { trace, imageSha256: hash },
  );
  assert.deepEqual(projected.patches, input.patches);
  assert.equal(projected.rejected.length, 0);
  assert.throws(
    () =>
      projectSharedImageMeasurements(
        { trace, input: { ...original.measurement, interpolation: undefined } },
        { trace, imageSha256: hash },
      ),
    /reconstruction hash/,
  );
});
test("complete measurements reject wrong images, open routes, incomplete ranges, seed joins and long unmeasured gaps", () => {
  const { trace, image, input } = fixture();
  assert.throws(
    () => measuredImageBorders(trace, input, "c".repeat(64), image),
    /hash/,
  );
  assert.throws(
    () => measuredImageBorders(trace.slice(0, -1), input, hash, image),
    /closed/,
  );
  for (const change of [
    (x: typeof input) => x.patches.pop(),
    (x: typeof input) => x.patches[0].anchors.shift(),
    (x: typeof input) => x.patches[0].anchors.pop(),
    (x: typeof input) => {
      x.patches[0].anchors[2].kind = "preserved-seed";
    },
    (x: typeof input) => {
      x.patches[0].anchors.splice(1, 6);
    },
  ]) {
    const x = structuredClone(input);
    change(x);
    assert.throws(() => measuredImageBorders(trace, x, hash, image));
  }
});
test("measurements reject displaced anchors, invalid widths, reversed nesting and closure changes", () => {
  const { trace, image, input, f } = fixture();
  for (const change of [
    (x: typeof input) => {
      x.patches[0].anchors[3].coordinate = plane(
        x.patches[0].anchors[3].coordinate,
      ).from([10, 10]);
    },
    (x: typeof input) => {
      x.patches[0].anchors.at(-1)!.coordinate = [0, 0];
    },
    (x: typeof input) => {
      x.patches.forEach((p) =>
        p.anchors.forEach(
          (a) =>
            (a.coordinate = f.projection.from(f.smooth[f.index(a.station)])),
        ),
      );
    },
    (x: typeof input) => {
      x.patches.forEach(
        (p) => (p.edge = p.edge === "inner" ? "outer" : "inner"),
      );
    },
  ]) {
    const x = structuredClone(input);
    change(x);
    assert.throws(() => measuredImageBorders(trace, x, hash, image));
  }
});
test("missing edge pixels reject measured borders while isolated interior holes stay unchanged", () => {
  const { trace, image, input, f } = fixture(),
    original = measuredImageBorders(trace, input, hash, image);
  assert.ok(image.data);
  const q = plane([0, 0]).to(original.result.inner[4]),
    x = Math.round(q[0] + 255.5),
    y = Math.round(255.5 - q[1]);
  image.data[(y * 512 + x) * 4 + 3] = 0;
  assert.throws(
    () => measuredImageBorders(trace, input, hash, image),
    /missing/,
  );
  image.data[(y * 512 + x) * 4 + 3] = 255;
  const point = plane([0, 0]).to(f.projection.from(f.smooth[20])),
    ix = Math.round(point[0] + 255.5),
    iy = Math.round(255.5 - point[1]);
  image.data[(iy * 512 + ix) * 4 + 3] = 0;
  assert.deepEqual(measuredImageBorders(trace, input, hash, image), original);
  assert.equal(image.data[(iy * 512 + ix) * 4 + 3], 0);
});
test("measurement coordinates outside the pinned raster cannot become valid borders", () => {
  const { trace, image, input } = fixture();
  image.extent = [0, 0, 1, 1];
  assert.throws(
    () => measuredImageBorders(trace, input, hash, image),
    /outside/,
  );
});

test("shared image measurements reuse only supported stations and report unmatched branches", async () => {
  const { projectSharedImageMeasurements } = await import(
    "../scripts/project-border-refinement"
  );
  const { trace, input } = fixture(),
    source = measuredImageBorders(trace, input, hash);
  const same = projectSharedImageMeasurements(
    { trace, input: source.measurement },
    { trace, imageSha256: hash },
  );
  assert.deepEqual(same.patches, input.patches);
  assert.equal(same.rejected.length, 0);
  assert.equal(
    same.mappings.length,
    input.patches.reduce((s, p) => s + p.anchors.length, 0),
  );
  const displaced = trace.map(([x, y]) => [x + 0.01, y] as [number, number]);
  const held = projectSharedImageMeasurements(
    { trace, input: source.measurement },
    { trace: displaced, imageSha256: hash },
  );
  assert.equal(held.mappings.length, 0);
  assert.ok(held.rejected.length > 0);
  assert.throws(() =>
    measuredImageBorders(displaced, { ...input, patches: held.patches }, hash),
  );
  assert.throws(
    () =>
      projectSharedImageMeasurements(
        { trace, input: source.measurement },
        { trace, imageSha256: "c".repeat(64) },
      ),
    /same pinned/,
  );
  assert.throws(
    () =>
      projectSharedImageMeasurements(
        {
          trace,
          input: { ...source.measurement, resultSha256: "c".repeat(64) },
        },
        { trace, imageSha256: hash },
      ),
    /reconstruction hash/,
  );
});

test("measured metadata cannot claim automatic proposal scores or omit its complete recipe", async () => {
  const { borderInferenceSchema } = await import("../schemas/border-inference"),
    { trace, input } = fixture(),
    built = measuredImageBorders(trace, input, hash);
  const data = {
    schemaVersion: 1,
    method: "image-measured-cross-sections-v1",
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
    note: "Sparse measurements remain estimates.",
  };
  assert.ok(borderInferenceSchema.safeParse(data).success);
  assert.ok(
    !borderInferenceSchema.safeParse({ ...data, measurement: undefined })
      .success,
  );
  assert.ok(
    !borderInferenceSchema.safeParse({
      ...data,
      evidence: {
        strongEdgeFraction: [1, 1],
        medianInteriorDifference: [0, 0],
        samplingStepM: 3,
        searchRangeM: [2, 25],
      },
    }).success,
  );
  assert.ok(
    !borderInferenceSchema.safeParse({
      ...data,
      method: "rgb-road-local-appearance-v4",
    }).success,
  );
});

test("reverse-direction reuse is explicit and preserves physical inner/outer identity", async () => {
  const { projectSharedImageMeasurements } = await import(
      "../scripts/project-border-refinement"
    ),
    { trace, input } = fixture(),
    reverse = trace.toReversed();
  const refused = projectSharedImageMeasurements(
    { trace, input },
    { trace: reverse, imageSha256: hash },
  );
  assert.equal(refused.mappings.length, 0);
  const projected = projectSharedImageMeasurements(
    { trace, input },
    { trace: reverse, imageSha256: hash, direction: "reverse" },
  );
  assert.equal(projected.rejected.length, 0);
  const built = measuredImageBorders(
      reverse,
      { ...input, patches: projected.patches },
      hash,
    ),
    original = measuredImageBorders(trace, input, hash);
  assert.equal(built.result.inner.length, original.result.inner.length);
  for (const edge of ["inner", "outer"] as const)
    for (let i = 0; i < built.result[edge].length; i++) {
      const a = built.result[edge][i],
        b = original.result[edge].at(-1 - i)!;
      assert.ok(Math.hypot(...plane(a).to(b)) < 0.03);
    }
});
