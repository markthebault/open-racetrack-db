import { test } from "node:test";
import assert from "node:assert/strict";
import { inferImageBorders, type Raster } from "../scripts/infer-image-borders";
import { plane, type Position } from "../src/geo";
import { borderInferenceSchema } from "../schemas/border-inference";
const project = plane([0, 0]);
function circleImage(widthAt: (angle: number) => number) {
  const image: Raster = {
    width: 512,
    height: 512,
    data: new Uint8Array(512 * 512 * 4),
    extent: [-256, -256, 256, 256],
  };
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const east = x - 255.5,
        north = 255.5 - y,
        angle = Math.atan2(north, east),
        road = Math.abs(Math.hypot(east, north) - 100) < widthAt(angle) / 2,
        k = (y * 512 + x) * 4;
      image.data.set(road ? [95, 95, 95, 255] : [45, 150, 50, 255], k);
    }
  const trace: Position[] = Array.from({ length: 181 }, (_, i) =>
    project.from([
      100 * Math.cos((i / 180) * Math.PI * 2),
      100 * Math.sin((i / 180) * Math.PI * 2),
    ]),
  );
  trace[180] = trace[0];
  return { image, trace };
}
test("visible image edges determine changing road widths without a constant-width fallback", () => {
  for (const nominal of [9, 17]) {
    const width = (a: number) => nominal + 2 * Math.sin(3 * a),
      { image, trace } = circleImage(width),
      result = inferImageBorders(trace, image);
    for (const [points, sign] of [
      [result.inner, -1],
      [result.outer, 1],
    ] as const) {
      const errors = points
        .map((p) => {
          const [x, y] = project.to(p),
            angle = Math.atan2(y, x);
          return Math.abs(Math.hypot(x, y) - (100 + (sign * width(angle)) / 2));
        })
        .sort((a, b) => a - b);
      assert.ok(
        errors[Math.floor(errors.length * 0.9)] < 2,
        `Boundary did not follow the image for width ${nominal}`,
      );
    }
    assert.ok(result.evidence.every((e) => e.strong > 0.95));
  }
});
test("a featureless image or an open route cannot silently become assumed-width borders", () => {
  const { image, trace } = circleImage(() => 12);
  image.data.fill(130);
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
  assert.throws(() => inferImageBorders(trace, image), /review|evidence/);
  assert.throws(
    () => inferImageBorders(trace.slice(0, -1), image),
    /closed route/,
  );
});
test("imagery provenance requires a usable resolution and an explicit unreviewed estimate", () => {
  const record = {
    schemaVersion: 1,
    method: "rgb-cross-sections-v1",
    status: "estimated",
    reviewedAt: null,
    traceSha256: "a".repeat(64),
    imagery: {
      sourceId: "naip",
      url: "https://imagery.nationalmap.gov/",
      reuseEvidenceUrl: "https://www.usgs.gov/",
      license: "public-domain",
      attribution: "USGS / USDA",
      retrievedAt: "2026-11-06T00:00:00Z",
      sha256: "b".repeat(64),
      width: 512,
      height: 512,
      extent3857: [-256, -256, 256, 256],
      groundPixelSizeM: 1,
    },
    evidence: {
      strongEdgeFraction: [0.9, 0.92],
      medianInteriorDifference: [0.03, 0.04],
      samplingStepM: 3,
      searchRangeM: [2, 25],
    },
    note: "Unreviewed estimates, not survey accuracy.",
  };
  assert.ok(borderInferenceSchema.safeParse(record).success);
  assert.equal(
    borderInferenceSchema.safeParse({ ...record, status: "verified" }).success,
    false,
  );
  assert.equal(
    borderInferenceSchema.safeParse({
      ...record,
      imagery: { ...record.imagery, groundPixelSizeM: 10 },
    }).success,
    false,
  );
});
