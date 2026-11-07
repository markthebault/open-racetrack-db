import { test } from "node:test";
import assert from "node:assert/strict";
import { imageCrossSections } from "../scripts/infer-image-borders";
import { measuredImageBorders } from "../scripts/measured-image-borders";
import { borderMeasurementInputSchema } from "../schemas/border-refinement";
import { gradeSeparationSchema } from "../schemas/grade-separation";
import { auditGradeCrossings } from "../scripts/audit-grade-crossings";
import { plane, type Position } from "../src/geo";
import { compactPairedImageMeasurements } from "../scripts/compact-image-measurements";
function fixture() {
  const projection = plane([0, 0]),
    trace = Array.from({ length: 161 }, (_, i) => {
      const t = 2 * Math.PI * (i / 160 + 0.125);
      return projection.from([100 * Math.sin(t), 70 * Math.sin(2 * t)]);
    });
  trace[160] = trace[0];
  const frames = imageCrossSections(trace),
    hit = auditGradeCrossings(trace, true)[0],
    span = (s: number): [number, number] => [
      Math.floor(s / frames.step) - 7,
      Math.ceil(s / frames.step) + 7,
    ],
    lower = span(hit.stationsM[0]),
    upper = span(hit.stationsM[1]);
  const grade = gradeSeparationSchema.parse({
    schemaVersion: 1,
    method: "source-bridge-ground-approaches-v1",
    stationCount: frames.count,
    crossings: [
      {
        upper,
        lower,
        source: {
          wayId: 42,
          wayVersion: 7,
          snapshotSha256: "a".repeat(64),
          bridge: "yes",
          layer: "1",
        },
        note: "Synthetic fixture only, not a real bridge claim.",
      },
    ],
    elevation: {
      source: "GSI DEM5A",
      url: "https://maps.gsi.go.jp/development/ichiran.html#dem",
      attribution: "Geospatial Information Authority of Japan (GSI)",
      reuseEvidenceUrl:
        "https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html",
      sampling: "bilinear-pixel-centres",
      crossingInterpolation: "both-road-approaches-v1",
      toleranceM: 0.25,
      tiles: [{ zoom: 15, x: 1, y: 2, sha256: "b".repeat(64) }],
      anchors: [
        [0, 40],
        [lower[0], 40],
        [lower[1], 40],
        [upper[0], 46],
        [upper[1], 46],
        [frames.count, 40],
      ],
      note: "Synthetic heights only.",
    },
  });
  const input = borderMeasurementInputSchema.parse({
    method: "paired-image-edge-anchors-v1",
    interpolation: "edge-linear-v1",
    imageSha256: "c".repeat(64),
    note: "Synthetic controls only.",
    patches: (["inner", "outer"] as const).map((edge, side) => ({
      edge,
      anchors: Array.from({ length: frames.count + 1 }, (_, station) => {
        const i = station % frames.count,
          p = frames.smooth[i],
          n = frames.normals[i],
          d = side ? -6 : 6;
        return {
          station,
          kind: "image-measured",
          coordinate: frames.projection.from([
            p[0] + n[0] * d,
            p[1] + n[1] * d,
          ]),
        };
      }),
    })),
  });
  const image = {
    width: 512,
    height: 512,
    extent: [-256, -256, 256, 256] as [number, number, number, number],
    data: new Uint8Array(512 * 512 * 4).fill(255),
  };
  return { trace: trace as Position[], grade, input, image };
}
test("complete measured bridge edges retain level separation, source direction and deterministic replay", () => {
  const { trace, grade, input, image } = fixture();
  assert.throws(
    () => measuredImageBorders(trace, input, input.imageSha256, image),
    /crosses itself|cross/,
  );
  const built = measuredImageBorders(
    trace,
    input,
    input.imageSha256,
    image,
    grade,
  );
  const { resultSha256, ...saved } = built.measurement;
  assert.equal(
    measuredImageBorders(trace, saved, input.imageSha256, image, grade)
      .measurement.resultSha256,
    resultSha256,
  );
  const flat = structuredClone(grade);
  flat.elevation.anchors.forEach((p) => (p[1] = 40));
  assert.throws(
    () => measuredImageBorders(trace, input, input.imageSha256, image, flat),
    /separation/,
  );
  const reversed = structuredClone(input);
  reversed.patches.forEach(
    (p) => (p.edge = p.edge === "inner" ? "outer" : "inner"),
  );
  assert.throws(
    () =>
      measuredImageBorders(trace, reversed, input.imageSha256, image, grade),
    /left\/right/,
  );
  const wrong = structuredClone(grade);
  wrong.stationCount++;
  wrong.elevation.anchors.at(-1)![0]++;
  assert.throws(
    () => measuredImageBorders(trace, input, input.imageSha256, image, wrong),
    /matching source stations/,
  );
  const missing = { ...image, data: new Uint8Array(image.data.length) };
  assert.throws(
    () => measuredImageBorders(trace, input, input.imageSha256, missing, grade),
    /coverage/,
  );
  const compacted = compactPairedImageMeasurements(trace, input, image, {
    maximumErrorM: 0.1,
    gradeSeparation: grade,
    preserveStations: grade.crossings.flatMap((c) => [...c.upper, ...c.lower]),
  });
  assert.ok(compacted.afterPairs < compacted.beforePairs);
  assert.ok(compacted.maximumErrorM <= 0.1);
});

test("saved measured bridge recipes require closed paired semantics without automatic evidence", async () => {
  const { borderInferenceSchema } = await import("../schemas/border-inference");
  const { trace, input, grade, image } = fixture();
  const built = measuredImageBorders(
    trace,
    input,
    input.imageSha256,
    image,
    grade,
  );
  const data = {
    schemaVersion: 1,
    method: "image-measured-paired-edges-v1",
    status: "estimated",
    reviewedAt: null,
    traceSha256: "a".repeat(64),
    measurement: built.measurement,
    gradeSeparation: grade,
    edgeConvention: "left-right-along-trace",
    imagery: {
      sourceId: "test",
      url: "https://example.org/image",
      reuseEvidenceUrl: "https://example.org/rights",
      license: "public-domain",
      attribution: "Synthetic test image",
      retrievedAt: "2026-11-07T00:00:00.000Z",
      sha256: input.imageSha256,
      width: 512,
      height: 512,
      extent3857: [-256, -256, 256, 256],
      groundPixelSizeM: 1,
    },
    note: "Synthetic complete paired bridge metadata only.",
  };
  assert.ok(borderInferenceSchema.safeParse(data).success);
  for (const bad of [
    { ...data, edgeConvention: undefined },
    { ...data, measurement: undefined },
    { ...data, measurement: { ...built.measurement, routeKind: "run" } },
    {
      ...data,
      method: "image-measured-cross-sections-v1",
      measurement: {
        ...built.measurement,
        method: "cross-section-image-anchors-v1",
      },
    },
    {
      ...data,
      evidence: {
        strongEdgeFraction: [1, 1],
        medianInteriorDifference: [0, 0],
        samplingStepM: 3,
        searchRangeM: [2, 25],
      },
    },
  ])
    assert.equal(borderInferenceSchema.safeParse(bad).success, false);
});

test("a shifted source grid replays a closed bridge without moving or reversing the retained trace", async () => {
  const { gradeProfileHeight } = await import("../src/grade-separation");
  const { trace, grade, input, image } = fixture(),
    original = structuredClone(trace),
    frames = imageCrossSections(trace),
    offset = 5;
  const shiftedFrames = imageCrossSections(trace, false, offset);
  assert.deepEqual(shiftedFrames.smooth, [
    ...frames.smooth.slice(offset),
    ...frames.smooth.slice(0, offset),
  ]);
  assert.deepEqual(shiftedFrames.normals, [
    ...frames.normals.slice(offset),
    ...frames.normals.slice(0, offset),
  ]);
  assert.equal(shiftedFrames.step, frames.step);
  const n = grade.stationCount,
    wrap = (s: number) => (s - offset + n) % n,
    seam = gradeProfileHeight(grade, offset),
    rotated = structuredClone(grade);
  rotated.sourceStationOffset = offset;
  for (const crossing of rotated.crossings)
    for (const key of ["upper", "lower"] as const)
      crossing[key] = crossing[key].map(wrap) as [number, number];
  rotated.elevation.anchors = [
    [0, seam],
    ...grade.elevation.anchors
      .slice(0, -1)
      .map(([s, h]): [number, number] => [wrap(s), h])
      .filter(([s]) => s !== 0)
      .sort((a, b) => a[0] - b[0]),
    [n, seam],
  ];
  const shiftedInput = structuredClone(input);
  shiftedInput.patches.forEach((patch, side) =>
    patch.anchors.forEach((anchor, station) => {
      anchor.coordinate =
        input.patches[side].anchors[(station + offset) % n].coordinate;
    }),
  );
  const before = measuredImageBorders(
      trace,
      input,
      input.imageSha256,
      image,
      grade,
    ),
    after = measuredImageBorders(
      trace,
      shiftedInput,
      input.imageSha256,
      image,
      rotated,
    );
  for (const edge of ["inner", "outer"] as const)
    assert.deepEqual(after.result[edge].slice(0, n), [
      ...before.result[edge].slice(offset, n),
      ...before.result[edge].slice(0, offset),
    ]);
  const { resultSha256, ...saved } = after.measurement;
  assert.equal(
    measuredImageBorders(trace, saved, input.imageSha256, image, rotated)
      .measurement.resultSha256,
    resultSha256,
  );
  const wrong = structuredClone(rotated);
  delete wrong.sourceStationOffset;
  assert.throws(
    () =>
      measuredImageBorders(
        trace,
        shiftedInput,
        input.imageSha256,
        image,
        wrong,
      ),
    /departs|driving order/,
  );
  assert.deepEqual(trace, original);
  for (const bad of [-1, 0.5, frames.count])
    assert.throws(
      () => imageCrossSections(trace, false, bad),
      /source grid index/,
    );
  assert.throws(
    () => imageCrossSections(trace.slice(0, -1), true, 1),
    /source grid index/,
  );
  for (const bad of [-1, 0.5, n])
    assert.equal(
      gradeSeparationSchema.safeParse({ ...rotated, sourceStationOffset: bad })
        .success,
      false,
    );
  const compacted = compactPairedImageMeasurements(trace, shiftedInput, image, {
    maximumErrorM: 0.1,
    gradeSeparation: rotated,
  });
  assert.ok(compacted.maximumErrorM <= 0.1);
  const { refineImageBorders, borderPairHash } =
    await import("../scripts/refine-image-borders");
  const refined = refineImageBorders(
    after.result,
    trace,
    {
      method: "cross-section-image-anchors-v1",
      imageSha256: input.imageSha256,
      seedSha256: borderPairHash(after.result),
      note: "Synthetic shifted-grid refinement fixture only.",
      patches: [
        {
          edge: "inner",
          anchors: [10, 11].map((station) => ({
            station,
            kind: "image-measured" as const,
            coordinate: after.result.inner[station],
          })),
        },
      ],
    },
    image,
    input.imageSha256,
    { gradeSeparation: rotated },
  );
  assert.deepEqual(refined.result, after.result);
});
