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
