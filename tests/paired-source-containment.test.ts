import { test } from "node:test";
import assert from "node:assert/strict";
import { plane, type Position } from "../src/geo";
import { imageCrossSections, type Raster } from "../scripts/infer-image-borders";
import { borderPairHash, refineImageBorders } from "../scripts/refine-image-borders";
import { borderMeasurementInputSchema, borderRefinementInputSchema } from "../schemas/border-refinement";

const projection = plane([0, 0]);
function fixture(radius = 117, square = false) {
  const sides = square ? 4 : 120;
  const trace = Array.from({ length: sides }, (_, i): Position => projection.from([
    radius * Math.cos(i * 2 * Math.PI / sides), radius * Math.sin(i * 2 * Math.PI / sides),
  ]));
  trace.push(trace[0]);
  const frames = imageCrossSections(trace), innerRadius = square ? 90 : 82;
  const ring = (r: number) => {
    const points = frames.smooth.map(q => {
      const geo = frames.projection.from(q), [x, y] = projection.to(geo), angle = Math.atan2(y, x);
      return projection.from([r * Math.cos(angle), r * Math.sin(angle)]);
    });
    return [...points, points[0]];
  };
  const seed = { inner: ring(innerRadius), outer: ring(124) };
  const image: Raster = { width: 512, height: 512, extent: [-256, -256, 256, 256],
    data: new Uint8Array(512 * 512 * 4).fill(255) };
  const input = borderRefinementInputSchema.parse({
    method: "paired-image-edge-anchors-v1", interpolation: "edge-linear-v1",
    sourceContainment: "complete-source-within-road-v1",
    imageSha256: "b".repeat(64), seedSha256: borderPairHash(seed),
    patches: (["inner", "outer"] as const).map(edge => ({ edge,
      anchors: [10, 20, 30].map(station => ({ station, kind: "image-measured", coordinate: seed[edge][station] })),
    })),
    note: "A reviewed asymmetric road contains the complete source route; the route is not moved to its centre.",
  });
  return { trace, seed, image, input };
}

test("explicit footprint validation supports asymmetric paving while the default departure limit remains", () => {
  const { trace, seed, image, input } = fixture(), before = structuredClone(seed);
  assert.throws(() => refineImageBorders(seed, trace, { ...input, sourceContainment: undefined }, image, "b".repeat(64)), /10 metres/);
  const result = refineImageBorders(seed, trace, input, image, "b".repeat(64));
  assert.equal(result.refinement.sourceContainment, "complete-source-within-road-v1");
  assert.equal(result.refinement.resultSha256, borderPairHash(result.result));
  assert.deepEqual(seed, before);
  const displaced = structuredClone(input);
  for (const patch of displaced.patches) patch.anchors[1].coordinate = seed[patch.edge][29];
  assert.throws(() => refineImageBorders(seed, trace, displaced, image, "b".repeat(64)), /10 metres along/);
});

test("footprint validation rejects an outside route and a route whose segments cut the grass island", () => {
  const outside = fixture(130);
  assert.throws(() => refineImageBorders(outside.seed, outside.trace, outside.input, outside.image, "b".repeat(64)), /inside the refined road footprint/);
  // All four raw vertices lie in the road, but each connecting chord cuts the island.
  const cut = fixture(117, true);
  assert.throws(() => refineImageBorders(cut.seed, cut.trace, cut.input, cut.image, "b".repeat(64)), /cross or touch/);
});

test("footprint validation rejects contact with a boundary and cannot opt into an open or source-normal route", () => {
  const f = fixture();
  f.seed.outer[0] = f.trace[0]; f.seed.outer[f.seed.outer.length - 1] = f.trace[0];
  f.input.seedSha256 = borderPairHash(f.seed);
  assert.throws(() => refineImageBorders(f.seed, f.trace, f.input, f.image, "b".repeat(64)), /cross or touch|inside the refined road footprint/);
  assert.throws(() => refineImageBorders(f.seed, f.trace.slice(0, -1), f.input, f.image, "b".repeat(64), { open: true }), /simple closed road/);
  assert.equal(borderRefinementInputSchema.safeParse({ ...f.input, method: "cross-section-image-anchors-v1", interpolation: undefined }).success, false);
  const complete: Record<string, unknown> = { ...f.input };
  delete complete.seedSha256;
  const parsed = borderMeasurementInputSchema.safeParse(complete);
  assert.equal(parsed.success, false);
  assert.ok(parsed.error?.issues.some(i => i.message.includes("only available for partial paired refinements")));
});
