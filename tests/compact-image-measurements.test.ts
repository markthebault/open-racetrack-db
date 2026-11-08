import { test } from "node:test";
import assert from "node:assert/strict";
import { compactPairedImageMeasurements } from "../scripts/compact-image-measurements";
import { imageCrossSections, type Raster } from "../scripts/infer-image-borders";
import { measuredImageBorders } from "../scripts/measured-image-borders";
import { borderMeasurementInputSchema } from "../schemas/border-refinement";
import { plane } from "../src/geo";

function fixture() {
  const projection = plane([0, 0]),
    trace = Array.from({ length: 121 }, (_, i) =>
      projection.from([100 * Math.cos(i * Math.PI / 60), 100 * Math.sin(i * Math.PI / 60)]),
    );
  trace[120] = trace[0];
  const frames = imageCrossSections(trace),
    input = borderMeasurementInputSchema.parse({
      method: "paired-image-edge-anchors-v1",
      interpolation: "edge-linear-v1",
      imageSha256: "a".repeat(64),
      note: "Dense independently observed pairs; interpolation remains estimated.",
      patches: ["inner", "outer"].map((edge, side) => {
        const radius = side ? 106 : 94,
          anchors = Array.from({ length: frames.count + 1 }, (_, station) => ({
            station,
            kind: "image-measured",
            coordinate: projection.from([(radius + (side && station === 31 ? .8 : 0)) * Math.cos(station * 2 * Math.PI / frames.count), (radius + (side && station === 31 ? .8 : 0)) * Math.sin(station * 2 * Math.PI / frames.count)]),
          }));
        anchors.at(-1)!.coordinate = anchors[0].coordinate;
        return { edge, anchors };
      }),
    }),
    image: Raster = { width: 20000, height: 20000, extent: [-250, -250, 250, 250], sample: () => [255, 255, 255, 255] };
  return { trace, input, image, frames, projection };
}

test("paired compaction retains both boundaries, protected controls and coordinate identity within the global error bound", () => {
  const { trace, input, image, frames, projection } = fixture(),
    snapshot = structuredClone(input),
    result = compactPairedImageMeasurements(trace, input, image, { maximumErrorM: .1, preserveStations: [17] }),
    before = measuredImageBorders(trace, input, input.imageSha256, image),
    after = measuredImageBorders(trace, result.input, input.imageSha256, image);
  assert.deepEqual(input, snapshot);
  assert.ok(result.afterPairs < result.beforePairs);
  assert.ok(result.maximumErrorM <= .1);
  for (const patch of result.input.patches) {
    assert.ok(patch.anchors.some((a) => a.station === 17));
    // An outer-edge-only detail must survive even though the inner edge is smooth.
    assert.ok(patch.anchors.some((a) => a.station === 31));
    for (const anchor of patch.anchors)
      assert.deepEqual(anchor, input.patches.find((p) => p.edge === patch.edge)!.anchors.find((a) => a.station === anchor.station));
    for (let i = 1; i < patch.anchors.length; i++)
      assert.ok((patch.anchors[i].station - patch.anchors[i - 1].station) * frames.step <= 50);
    for (let i = 0; i < after.result[patch.edge].length; i++) {
      const a = projection.to(before.result[patch.edge][i]), b = projection.to(after.result[patch.edge][i]);
      assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) <= .1);
    }
  }
  assert.deepEqual(compactPairedImageMeasurements(trace, input, image, { maximumErrorM: .1, preserveStations: [17] }), result);
});

test("compaction rejects unsupported semantics, invalid tolerances and absent protected stations", () => {
  const { trace, input, image } = fixture();
  for (const maximumErrorM of [NaN, Infinity, 0, .049, .501])
    assert.throws(() => compactPairedImageMeasurements(trace, input, image, { maximumErrorM }), /tolerance/);
  assert.throws(() => compactPairedImageMeasurements(trace, input, image, { maximumErrorM: .1, preserveStations: [99999] }), /Protected station/);
  assert.throws(() => compactPairedImageMeasurements(trace, { ...input, routeKind: "run" }, image, { maximumErrorM: .1 }), /closed paired/);
  assert.throws(() => compactPairedImageMeasurements(trace, { ...input, method: "cross-section-image-anchors-v1" }, image, { maximumErrorM: .1 }), /closed paired/);
});

test("compaction preserves an explicitly rotated measurement grid and its geographic controls", () => {
  const { trace, input, image, frames } = fixture(), offset = 30,
    shifted = { ...input, sourceStationOffset: offset, patches: input.patches.map((p) => ({
      ...p, anchors: p.anchors.map((a) => ({ ...a,
        coordinate: p.anchors[(a.station + offset) % frames.count].coordinate,
      })),
    })) }, compact = compactPairedImageMeasurements(trace, shifted, image, { maximumErrorM: .1 });
  assert.equal(compact.input.sourceStationOffset, offset);
  assert.deepEqual(compact.input.patches[0].anchors[0], shifted.patches[0].anchors[0]);
  assert.ok(compact.afterPairs < compact.beforePairs);
  assert.ok(compact.maximumErrorM <= .1);
  assert.equal(measuredImageBorders(trace, compact.input, input.imageSha256, image).measurement.sourceStationOffset, offset);
});

test("compaction checks new interpolated pixels even when every original observation and edge pixel is covered", () => {
  const { trace, input, image } = fixture(),
    compacted = compactPairedImageMeasurements(trace, input, image, { maximumErrorM: .1 }),
    before = measuredImageBorders(trace, input, input.imageSha256, image),
    after = measuredImageBorders(trace, compacted.input, input.imageSha256, image);
  const pixels = (pair: typeof before.result) => {
    const set = new Set<string>();
    for (const points of Object.values(pair)) for (const [lon, lat] of points) {
      const x = Math.floor((6378137 * lon * Math.PI / 180 + 250) / 500 * image.width - .5),
        y = Math.floor((250 - 6378137 * Math.asinh(Math.tan(lat * Math.PI / 180))) / 500 * image.height - .5);
      for (const dx of [0, 1]) for (const dy of [0, 1]) set.add(`${x + dx},${y + dy}`);
    }
    return set;
  }, originalPixels = pixels(before.result), hole = [...pixels(after.result)].find((p) => !originalPixels.has(p));
  assert.ok(hole);
  const missing: Raster = { ...image, sample: (x, y) => [255, 255, 255, `${x},${y}` === hole ? 0 : 255] };
  assert.doesNotThrow(() => measuredImageBorders(trace, input, input.imageSha256, missing));
  assert.throws(() => compactPairedImageMeasurements(trace, input, missing, { maximumErrorM: .1 }), /missing pinned-image coverage/);
});
