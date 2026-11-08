import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateLayout, validateTrack, type Layout } from "../schemas/data";
import { buildRoad, sampleLap, simulateLap } from "../src/lap-simulation";
import { sequenceCycleLayout, sequenceTrace } from "../src/source-sequence";
import { roadStrip } from "../src/road-geometry";
import { modelInputHash } from "../scripts/model-input";
import { prepareModel } from "../src/model-preparation";
import { bordersFromLayout } from "../src/track-borders";

const root = "data/united-kingdom/castle-combe-circuit-35406015/";
function fixture() {
  const layout: Layout = JSON.parse(readFileSync(root + "layouts/castle-combe-western-sprint.geojson", "utf8"));
  const recipe = layout.metadata.model3d;
  if (!recipe || recipe.kind !== "run" || !recipe.sourceSequence)
    throw new Error("Expected the complete Western Sprint source sequence");
  return { layout, recipe, plan: recipe.sourceSequence.plan };
}

test("Western Sprint retains its approach, complete first lap and partial second lap with shared physical heights", () => {
  const { layout, recipe, plan } = fixture(),
    track = validateTrack(JSON.parse(readFileSync(root + "track.json", "utf8")));
  validateLayout(layout, track, layout.metadata.layoutId);
  const source = sequenceTrace(layout, plan), road = buildRoad(layout),
    physical = buildRoad(sequenceCycleLayout(layout, recipe, plan)),
    prefixCount = road.renderSegmentCount! - physical.points.length;
  assert.equal(source.trace.length, 153);
  assert.equal(source.cycle.length, 83);
  assert.ok(road.length > 5300 && road.length < 5400);
  assert.equal(road.interpolatedSections, 0);
  // Every point on the second pass is literally the first pass's geometry and height.
  for (let i = prefixCount + physical.points.length; i < road.points.length - 1; i++) {
    const a = road.points[i], b = road.points[i - physical.points.length];
    for (const key of ["x", "y", "z", "left", "right", "nx", "nz"] as const)
      assert.equal(a[key], b[key], `${key} differs on repeated physical road`);
  }
  const lap = simulateLap(road), finish = sampleLap(lap, lap.duration);
  assert.equal(lap.speed[0], 0);
  assert.ok(lap.speed.at(-1)! > 0);
  assert.equal(road.points.at(-1)!.ds, 0);
  assert.ok(Math.abs(finish.distance - road.length) < 1e-7);
  assert.equal(sampleLap(lap, lap.duration + 10).distance, finish.distance);
  const geometry = roadStrip(road, (p) => [-p.right, p.left], 0.02);
  assert.equal(geometry.getAttribute("position").count, road.renderSegmentCount! * 6);
  assert.ok(road.renderSegmentCount! < road.points.length - 1);
  geometry.dispose();
  const borders = bordersFromLayout(layout)!;
  assert.ok(borders.features.every((f) => f.geometry.type === "MultiLineString" && f.geometry.coordinates.length === 2));
});

test("source sequences reject changed driving order, ambiguous cycles and mismatched source hashes", () => {
  const { layout, recipe, plan } = fixture();
  const trace = layout.features.find((f) => f.properties.role === "trace")!;
  assert.equal(trace.geometry.type, "LineString");
  if (trace.geometry.type !== "LineString") return;
  [trace.geometry.coordinates[95], trace.geometry.coordinates[96]] =
    [trace.geometry.coordinates[96], trace.geometry.coordinates[95]];
  assert.throws(() => sequenceTrace(layout, plan), /driving order/);
  assert.throws(() => modelInputHash(layout, recipe.terrain), /original trace and borders/);
  const clean = fixture();
  assert.throws(() => modelInputHash(clean.layout, clean.recipe.terrain, true), /cannot be combined/);
  clean.plan.cycleEndIndex--;
  assert.throws(() => buildRoad(clean.layout), /cycle indices/);
  const moved = fixture();
  const border = moved.layout.features.find((f) => f.properties.role === "inner")!;
  if (border.geometry.type === "LineString") border.geometry.coordinates[0][0] += 0.00001;
  assert.throws(() => modelInputHash(moved.layout, moved.recipe.terrain), /original trace and borders/);
});

test("source-sequence approaches reject swapped edges, reversed order and a missing road join", () => {
  const reversed = fixture();
  reversed.plan.approach.sections.forEach((s) => { [s.left, s.right] = [s.right, s.left]; });
  assert.throws(() => buildRoad(reversed.layout), /edges are reversed/);
  const backward = fixture();
  backward.plan.approach.sections.reverse();
  assert.throws(() => buildRoad(backward.layout), /reversed|reverses|join/);
  const missing = fixture();
  missing.plan.approach.sections.pop();
  assert.throws(() => buildRoad(missing.layout), /meet the inherited loop edges/);
  const gap = fixture();
  gap.plan.approach.sections.splice(1, 3);
  assert.throws(() => buildRoad(gap.layout), /unsupported gap/);
});

test("adding a further complete source pass changes driving distance without duplicating rendered road", () => {
  const { layout, recipe, plan } = fixture(), original = buildRoad(layout),
    { trace, cycle } = sequenceTrace(layout, plan),
    feature = layout.features.find((f) => f.properties.role === "trace")!;
  feature.geometry = { type: "LineString", coordinates: [
    ...trace.slice(0, plan.cycleStartIndex), ...cycle.slice(0, -1),
    ...trace.slice(plan.cycleStartIndex),
  ] };
  const longer = buildRoad(layout), physical = buildRoad(sequenceCycleLayout(layout, recipe, plan));
  assert.equal(longer.renderSegmentCount, original.renderSegmentCount);
  assert.equal(longer.points.length - original.points.length, physical.points.length);
  assert.ok(Math.abs(longer.length - original.length - physical.length) < 1e-7);
});

test("complete source-sequence models regenerate from their one public GeoJSON without authoring files", () => {
  const { layout, recipe } = fixture(), before = structuredClone(layout),
    hash = modelInputHash(layout, recipe.terrain),
    regenerated = prepareModel(layout, recipe.terrain, hash);
  assert.deepEqual(regenerated, recipe);
  assert.deepEqual(layout, before);
  assert.equal(hash, recipe.preparation!.inputSha256);
});
