import { test } from "node:test";
import assert from "node:assert/strict";
import { measureSavedWidth } from "../src/width-measurement";
import {
  manualWidthConfiguration,
  widthCalculationInputs,
  mergeWidthResults,
} from "../src/trace-width-runtime";
import { plane } from "../src/geo";
import type { Layout, Track } from "../schemas/data";
const projection = plane([7, 50]),
  p = (x: number, y: number) => projection.from([x, y]);
test("width migration measures existing geometry by distance, without touching its source coordinates", () => {
  const layout = {
    metadata: { lengthM: 200 },
    features: [
      {
        properties: { role: "trace" },
        geometry: {
          type: "LineString",
          coordinates: [p(0, 0), p(100, 0), p(200, 0)],
        },
      },
      {
        properties: { role: "inner" },
        geometry: {
          type: "LineString",
          coordinates: [p(0, 5), p(100, 5), p(100, 10), p(200, 10)],
        },
      },
      {
        properties: { role: "outer" },
        geometry: {
          type: "LineString",
          coordinates: [p(0, -5), p(100, -5), p(100, -10), p(200, -10)],
        },
      },
    ],
  } as unknown as Layout;
  const before = structuredClone(layout),
    width = measureSavedWidth(layout);
  assert.ok(Math.abs(width.meanWidthM - 15) < 0.001);
  assert.equal(width.interpolatedSections, 0);
  assert.deepEqual(layout, before);
});
test("network worker inputs retain component widths, path order and individual closure", () => {
  const layout = {
    metadata: {
      layoutId: "network",
      closed: false,
      borderComposition: [
        { sourceLayoutId: "a", metadata: { closed: true } },
        { sourceLayoutId: "b", metadata: { closed: false } },
      ],
    },
    features: [
      {
        properties: { role: "trace" },
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [p(0, 0), p(100, 0), p(100, 100), p(0, 0)],
            [p(200, 0), p(300, 0)],
          ],
        },
      },
    ],
  } as unknown as Layout;
  const track = {
    layouts: [
      { id: "network", roadWidthM: 10 },
      { id: "a", roadWidthM: 8 },
      { id: "b", roadWidthM: 12 },
    ],
  } as Track;
  const inputs = widthCalculationInputs(layout, track);
  assert.deepEqual(
    inputs.map((i) => [i.widthM, i.closed]),
    [
      [8, true],
      [12, false],
    ],
  );
  assert.deepEqual(inputs[1].trace, [p(200, 0), p(300, 0)]);
});
test("unusable geometry leaves a usable source layout and an explicit unavailable note, without a fabricated ideal line", () => {
  const layout = {
    metadata: { notes: [] },
    features: [
      {
        properties: { role: "trace" },
        geometry: { type: "LineString", coordinates: [p(0, 0), p(1, 0)] },
      },
    ],
  } as unknown as Layout;
  const before = structuredClone(layout),
    out = mergeWidthResults(
      layout,
      [],
      [{ ok: false, error: "Tight source kink" }],
    );
  assert.deepEqual(layout, before);
  assert.deepEqual(out.features, before.features);
  assert.match(out.metadata.notes[0], /unavailable.*Tight source kink/);
});

test("uncertain layouts never automatically get a width calculation", () => {
  const layout = { metadata: { layoutId: "blocked" } } as Layout;
  const track = {
    layouts: [
      {
        id: "blocked",
        roadWidthM: 10,
        lineUnavailableReason: "Boundary needs review",
      },
    ],
  } as Track;
  assert.deepEqual(widthCalculationInputs(layout, track), []);
});

test("manual width is a scalar session override and preserves original uncertainty metadata", () => {
  const track = {
    layouts: [{ id: "blocked", lineUnavailableReason: "Needs review" }],
  } as Track;
  const layout = { metadata: { layoutId: "blocked" } } as Layout;
  const copy = manualWidthConfiguration(track, layout, 9.2);
  assert.equal(copy.layouts[0].roadWidthM, 9.2);
  assert.equal(copy.layouts[0].lineUnavailableReason, undefined);
  assert.equal(track.layouts[0].roadWidthM, undefined);
  assert.equal(track.layouts[0].lineUnavailableReason, "Needs review");
  assert.throws(() => manualWidthConfiguration(track, layout, NaN));
});
