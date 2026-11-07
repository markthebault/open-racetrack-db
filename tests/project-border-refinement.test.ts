import { test } from "node:test";
import assert from "node:assert/strict";
import { projectBorderRefinement } from "../scripts/project-border-refinement";
import { borderPairHash } from "../scripts/refine-image-borders";
import { imageCrossSections } from "../scripts/infer-image-borders";
import { borderRefinementInputSchema } from "../schemas/border-refinement";
import { plane, distance, type Position } from "../src/geo";

const projection = plane([0, 0]);
function circle(dx = 0): Position[] {
  const path = Array.from({ length: 80 }, (_, i) =>
    projection.from([
      dx + 200 * Math.cos((i * Math.PI) / 40),
      160 * Math.sin((i * Math.PI) / 40),
    ]),
  );
  return [...path, path[0]];
}
function seed(trace: Position[]) {
  const f = imageCrossSections(trace);
  const edge = (offset: number) => {
    const points = f.smooth.map((p, i) =>
      f.projection.from([
        p[0] + offset * f.normals[i][0],
        p[1] + offset * f.normals[i][1],
      ]),
    );
    return [...points, points[0]];
  };
  return { inner: edge(6), outer: edge(-6) };
}
function fixture() {
  const trace = circle(),
    pair = seed(trace),
    hash = "a".repeat(64);
  const input = borderRefinementInputSchema.parse({
    method: "cross-section-image-anchors-v1",
    imageSha256: hash,
    seedSha256: borderPairHash(pair),
    note: "Synthetic physical edge measurements",
    patches: [
      {
        edge: "inner",
        anchors: [
          { station: 60, kind: "preserved-seed", coordinate: pair.inner[60] },
          { station: 70, kind: "image-measured", coordinate: pair.inner[70] },
          { station: 90, kind: "image-measured", coordinate: pair.inner[90] },
          { station: 100, kind: "preserved-seed", coordinate: pair.inner[100] },
        ],
      },
    ],
  });
  const targetTrace = circle(0.6);
  return {
    source: { trace, seed: pair, input },
    target: { trace: targetTrace, seed: seed(targetTrace), imageSha256: hash },
  };
}

test("physical measurements project onto a nearby route while preserving its own seed joins", () => {
  const { source, target } = fixture(),
    result = projectBorderRefinement(source, target),
    anchors = result.input.patches[0].anchors;
  assert.equal(result.mappings.length, 2);
  assert.equal(result.input.seedSha256, borderPairHash(target.seed));
  assert.deepEqual(
    anchors[0].coordinate,
    target.seed.inner[anchors[0].station],
  );
  for (const anchor of anchors.filter((a) => a.kind === "image-measured")) {
    const original = source.input.patches[0].anchors.find(
      (a) =>
        a.kind === "image-measured" && Math.abs(a.station - anchor.station) < 2,
    )!;
    assert.ok(distance(anchor.coordinate, original.coordinate) < 0.7);
  }
  assert.ok(
    result.mappings.every((m) => m.traceGapM < 0.7 && Math.abs(m.alongM) < 0.7),
  );
});

test("measurement projection rejects changed evidence, stale source seeds and forged preserved joins", () => {
  const { source, target } = fixture();
  assert.throws(
    () =>
      projectBorderRefinement(source, {
        ...target,
        imageSha256: "b".repeat(64),
      }),
    /same pinned image/,
  );
  assert.throws(
    () => projectBorderRefinement({ ...source, seed: target.seed }, target),
    /original seed/,
  );
  const changed = structuredClone(source);
  changed.input.patches[0].anchors[0].coordinate = [10, 10];
  assert.throws(
    () => projectBorderRefinement(changed, target),
    /preserved anchor/,
  );
});

test("measurements cannot jump to a distant or oppositely directed route", () => {
  const { source, target } = fixture(),
    far = circle(20),
    reversed = [...target.trace].reverse();
  assert.throws(
    () =>
      projectBorderRefinement(source, {
        ...target,
        trace: far,
        seed: seed(far),
      }),
    /nearby equally directed/,
  );
  assert.throws(
    () =>
      projectBorderRefinement(source, {
        ...target,
        trace: reversed,
        seed: seed(reversed),
      }),
    /nearby equally directed/,
  );
});

test("measurement projection rejects ambiguous repeated branches", () => {
  const { source, target } = fixture(),
    twice = [...source.trace.slice(0, -1), ...source.trace];
  assert.throws(
    () =>
      projectBorderRefinement(source, {
        ...target,
        trace: twice,
        seed: seed(twice),
      }),
    /ambiguous between target branches/,
  );
});

test("whole-loop projection cannot silently move the closure seam", () => {
  const { source, target } = fixture(),
    ring = source.trace.slice(0, -1),
    rotated = [...ring.slice(12), ...ring.slice(0, 12)];
  rotated.push(rotated[0]);
  const input = structuredClone(source.input),
    last = source.seed.inner.length - 1;
  input.patches[0].anchors[0] = {
    station: 0,
    kind: "preserved-seed",
    coordinate: source.seed.inner[0],
  };
  input.patches[0].anchors[3] = {
    station: last,
    kind: "preserved-seed",
    coordinate: source.seed.inner[last],
  };
  assert.throws(
    () =>
      projectBorderRefinement(
        { ...source, input },
        { ...target, trace: rotated, seed: seed(rotated) },
      ),
    /matching closed seams/,
  );
});

test("a stored GeoJSON recipe can supply measurements without a separate authoring file", () => {
  const { source, target } = fixture();
  const stored = { ...source.input, resultSha256: "c".repeat(64) };
  const direct = projectBorderRefinement(source, target);
  assert.deepEqual(
    projectBorderRefinement({ ...source, input: stored }, target),
    direct,
  );
});
