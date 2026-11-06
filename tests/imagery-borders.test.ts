import { test } from "node:test";
import assert from "node:assert/strict";
import { inferImageBorders, type Raster } from "../scripts/infer-image-borders";
import { plane, type Position } from "../src/geo";
import { borderInferenceSchema } from "../schemas/border-inference";
import { displayTilePlan } from "../src/imagery";
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
  const licensed = {
    ...record,
    imagery: {
      ...record.imagery,
      reuseEvidenceUrl: undefined,
      license: "LicenseRef-MapTiler-Derived-Borders",
      rightsBasis: "source-specific-agreement",
      tiles: {
        provider: "maptiler-satellite-v4",
        zoom: 17,
        bounds: [100, 110, 105, 115],
      },
    },
  };
  assert.ok(borderInferenceSchema.safeParse(licensed).success);
  assert.equal(
    borderInferenceSchema.safeParse({
      ...licensed,
      imagery: { ...licensed.imagery, rightsBasis: undefined },
    }).success,
    false,
  );
  assert.equal(
    borderInferenceSchema.safeParse({
      ...licensed,
      imagery: {
        ...licensed.imagery,
        url: "https://api.maptiler.com/maps/satellite-v4/tiles.json?key=do-not-save",
      },
    }).success,
    false,
  );
  assert.equal(
    borderInferenceSchema.safeParse({
      ...record,
      imagery: { ...record.imagery, reuseEvidenceUrl: undefined },
    }).success,
    false,
  );
});

test("display tiles crop parent imagery to the saved extent without shifting the road", () => {
  const plan = displayTilePlan({
    provider: "maptiler-satellite-v4",
    zoom: 17,
    bounds: [101, 113, 109, 118],
  });
  assert.ok(plan.width <= 2048 && plan.height <= 2048);
  assert.ok(plan.zoom < 17);
  // The first original tile starts at a fractional position in its parent tile.
  const first = plan.cells[0],
    parent = 2 ** (17 - plan.zoom);
  assert.equal(first.left / plan.width, (first.x * parent - 101) / 9);
  assert.equal(first.top / plan.height, (first.y * parent - 113) / 6);
  assert.ok(Math.min(...plan.cells.map((c) => c.left)) <= 0);
  assert.ok(Math.max(...plan.cells.map((c) => c.left + c.width)) >= plan.width);
  assert.ok(
    Math.max(...plan.cells.map((c) => c.top + c.height)) >= plan.height,
  );
  assert.ok(plan.cells.length < 9 * 6);
});

test("open-road inference preserves separate ends and follows visible changing widths", () => {
  const image: Raster = {
    width: 512,
    height: 512,
    data: new Uint8Array(512 * 512 * 4),
    extent: [-256, -256, 256, 256],
  };
  const width = (x: number) => 12 + 3 * Math.sin(x / 70);
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const road = Math.abs(255.5 - y) < width(x - 255.5) / 2;
      image.data.set(
        road ? [95, 95, 95, 255] : [45, 150, 50, 255],
        (y * 512 + x) * 4,
      );
    }
  const trace = [project.from([-190, 0]), project.from([190, 0])];
  const result = inferImageBorders(trace, image, { open: true });
  assert.notDeepEqual(result.inner[0], result.inner.at(-1));
  for (const [side, sign] of [
    [result.inner, 1],
    [result.outer, -1],
  ] as const) {
    const errors = side.map((p) => {
      const [x, y] = project.to(p);
      return Math.abs(y - (sign * width(x)) / 2);
    });
    assert.ok(Math.max(...errors) < 2);
    assert.ok(Math.abs(project.to(side[0])[0] + 190) < 2);
    assert.ok(Math.abs(project.to(side.at(-1)!)[0] - 190) < 2);
  }
});

test("appearance-based proposals recover image edges when portions of the trace lie outside the road", () => {
  const { image, trace } = circleImage(() => 12);
  for (let i = 0; i < trace.length - 1; i++) {
    const angle = (i / (trace.length - 1)) * Math.PI * 2,
      r = 100 + 7 * Math.sin(2 * angle);
    trace[i] = project.from([r * Math.cos(angle), r * Math.sin(angle)]);
  }
  trace[trace.length - 1] = trace[0];
  const result = inferImageBorders(trace, image, {
    method: "road-appearance-v3",
  });
  for (const [side, radius] of [
    [result.inner, 94],
    [result.outer, 106],
  ] as const) {
    const errors = side
      .map((p) => {
        const [x, y] = project.to(p);
        return Math.abs(Math.hypot(x, y) - radius);
      })
      .sort((a, b) => a - b);
    assert.ok(errors[Math.floor(errors.length * 0.9)] < 2);
  }
  image.data.fill(130);
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
  assert.throws(
    () => inferImageBorders(trace, image, { method: "road-appearance-v3" }),
    /review|evidence|interval/,
  );
});

test("local pavement appearance follows changing widths through lighting changes and rejects absent edges", () => {
  const width = (a: number) => 12 + 3 * Math.sin(3 * a),
    { image, trace } = circleImage(width);
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const east = x - 255.5,
        north = 255.5 - y,
        angle = Math.atan2(north, east),
        road = Math.abs(Math.hypot(east, north) - 100) < width(angle) / 2,
        light = Math.round(80 + 45 * Math.sin(angle));
      image.data.set(
        road ? [light, light + 2, light + 3, 255] : [112, 84, 46, 255],
        (y * image.width + x) * 4,
      );
    }
  const result = inferImageBorders(trace, image, {
    method: "road-local-appearance-v4",
  });
  for (const [points, sign] of [
    [result.inner, -1],
    [result.outer, 1],
  ] as const) {
    const errors = points
      .map((p) => {
        const [x, y] = project.to(p);
        return Math.abs(
          Math.hypot(x, y) - (100 + (sign * width(Math.atan2(y, x))) / 2),
        );
      })
      .sort((a, b) => a - b);
    assert.ok(errors[Math.floor(errors.length * 0.95)] < 2);
  }
  image.data.fill(130);
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
  assert.throws(
    () =>
      inferImageBorders(trace, image, { method: "road-local-appearance-v4" }),
    /review|evidence|interval/,
  );
  image.data.fill(0);
  assert.throws(
    () =>
      inferImageBorders(trace, image, { method: "road-local-appearance-v4" }),
    /coverage/,
  );
});
