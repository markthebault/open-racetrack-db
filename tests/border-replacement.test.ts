import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { borderReplacement } from "../scripts/border-replacement";
import { borderPairHash } from "../scripts/refine-image-borders";
import { borderInferenceSchema } from "../schemas/border-inference";
import type { Layout } from "../schemas/data";
import { preserveDisplayImageryOnBorderRefresh } from "../scripts/layout-borders";
import { modelInputHash } from "../scripts/model-input";

function fixture() {
  // Keep this independent of any later correction to the production borders.
  const d = JSON.parse(readFileSync("data/sweden/se-sviestad-f8832c27/layouts/sviestad.geojson", "utf8")) as Layout;
  delete d.metadata.borderInference;
  const pair = { inner: [[0, 0], [0, 1]] as [number, number][], outer: [[1, 0], [1, 1]] as [number, number][] };
  for (const role of ["inner", "outer"] as const)
    d.features.find((f) => f.properties.role === role)!.geometry = { type: "LineString", coordinates: pair[role] };
  return { d, hash: borderPairHash(pair) };
}

test("border refresh rebuilds geometry while retaining an explicit display source and embedded terrain", () => {
  const layout = JSON.parse(readFileSync("data/japan/jp-fuji-1937cd5f/layouts/fuji-short.geojson", "utf8")) as Layout,
    previous = structuredClone(layout.metadata.model3d!);
  previous.preparation!.preserveImageryReference = true;
  previous.preparation!.inputSha256 = "f".repeat(64);
  previous.imagery.attribution = "Pinned display fixture";
  delete layout.metadata.model3d;
  layout.metadata.borderInference!.note += " Updated border observations.";
  const before = structuredClone(layout), oldModel = structuredClone(previous),
    refreshed = preserveDisplayImageryOnBorderRefresh(layout, previous),
    model = refreshed.metadata.model3d!;
  assert.equal(model.kind ?? "lap", "lap");
  assert.ok(model.preparation!.preserveImageryReference);
  assert.deepEqual(model.imagery, previous.imagery);
  assert.deepEqual(model.terrain, previous.terrain);
  assert.deepEqual(refreshed.features, layout.features.filter(f=>f.properties.role!=="ideal"));
  assert.equal(model.preparation!.inputSha256, modelInputHash(refreshed, model.terrain));
  assert.notEqual(model.preparation!.inputSha256, previous.preparation!.inputSha256);
  assert.deepEqual(layout, before);
  assert.deepEqual(previous, oldModel);
  delete previous.preparation!.preserveImageryReference;
  assert.deepEqual(preserveDisplayImageryOnBorderRefresh(layout, previous).features, layout.features.filter(f=>f.properties.role!=="ideal"));
});

test("original border correction pins both old edges and never mutates the source during preflight", () => {
  const { d, hash } = fixture(), before = structuredClone(d);
  assert.deepEqual(borderReplacement(d, hash, "  Pinned native imagery shows a different paved branch.  "), {
    borderSha256: hash, reason: "Pinned native imagery shows a different paved branch.",
  });
  assert.deepEqual(d, before);
  const f = d.features.find((f) => f.properties.role === "outer")!;
  if (f.geometry.type === "LineString") f.geometry.coordinates[1][0] += .001;
  assert.throws(() => borderReplacement(d, hash, "Pinned native imagery shows a different paved branch."), /hash does not match/);
});

test("replacement refuses ambiguous scope, inferred edges, missing edges and undocumented edits", () => {
  const { d, hash } = fixture(), reason = "Pinned native imagery shows a different paved branch.";
  assert.throws(() => borderReplacement(d, "0", reason), /exact pair hash/);
  assert.throws(() => borderReplacement(d, hash, "fix"), /documented reason/);
  for (const change of [
    (x: Layout) => { x.metadata.geometryKind = "network"; },
    (x: Layout) => { x.metadata.borderInference = {} as NonNullable<Layout["metadata"]["borderInference"]>; },
    (x: Layout) => { x.features = x.features.filter((f) => f.properties.role !== "outer"); },
    (x: Layout) => { x.features.push(structuredClone(x.features.find((f) => f.properties.role === "inner")!)); },
  ]) {
    const copy = structuredClone(d); change(copy);
    assert.throws(() => borderReplacement(copy, hash, reason));
  }
});

test("replacement provenance requires complete measured geometry rather than an automatic proposal", () => {
  const d = JSON.parse(readFileSync("data/united-kingdom/gb-gurston-down-hillclimb-ade02267/layouts/gurston-down-hillclimb.geojson", "utf8"));
  const evidence = { ...d.metadata.borderInference, supersedes: { borderSha256: "a".repeat(64), reason: "Pinned native imagery shows a different paved branch." } };
  assert.deepEqual(borderInferenceSchema.parse(evidence).supersedes, evidence.supersedes);
  delete evidence.measurement;
  delete evidence.edgeConvention;
  evidence.method = "rgb-cross-sections-v2";
  evidence.evidence = { strongEdgeFraction: [1, 1], medianInteriorDifference: [.1, .1], samplingStepM: 3, searchRangeM: [2, 25] };
  assert.throws(() => borderInferenceSchema.parse(evidence), /complete image measurements/);
});
