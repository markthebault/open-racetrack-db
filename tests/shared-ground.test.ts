import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Layout } from "../schemas/data";
import { sharedGroundSchema } from "../schemas/shared-ground";
import { trackModelSchema } from "../schemas/track-model";
import { readSharedSourceNodes, verifySharedGroundSource } from "../scripts/shared-source-junctions";
import { modelInputHash } from "../scripts/model-input";
import { prepareModel } from "../src/model-preparation";
import { buildRoad, simulateLap } from "../src/lap-simulation";
import { sharedGroundMeshes } from "../src/shared-ground-render";
import { groundClearanceM, groundSegmentClearanceM, footprintArea } from "../src/ribbon-surface";
import { bordersFromLayout } from "../src/track-borders";
import { plane } from "../src/geo";
import { sampleElevation } from "../src/elevation";
import { modelCrossingStatus } from "../scripts/audit-model-crossings";
import { auditGradeCrossings } from "../scripts/audit-grade-crossings";

async function fixture() {
  const layout = JSON.parse(readFileSync("data/united-kingdom/gb-dunsfold-top-gear-06a07bad/layouts/dunsfold-top-gear.geojson", "utf8")) as Layout,
    record = JSON.parse(readFileSync("sources/research/road-limit-measurement-reviews.json", "utf8")).records
      .find((r: { trackId: string }) => r.trackId === layout.metadata.trackId),
    ground = sharedGroundSchema.parse({ schemaVersion: 1,
      sourceNode: (await readSharedSourceNodes(layout))[0].source,
      borderSha256: record.candidateAreaBoundaryRecipe.sourceBorderFeaturesSha256,
      imagery: record.imagery, innerRings: record.candidateAreaBoundaryRecipe.innerRings,
      note: record.candidateAreaBoundaryRecipe.note,
    }), terrain = layout.metadata.model3d!.terrain,
    hash = modelInputHash(layout, terrain, false, undefined, ground),
    model = prepareModel(layout, terrain, hash, false, undefined, ground),
    prepared: Layout = { ...layout, metadata: { ...layout.metadata, model3d: model } };
  return { layout, ground, terrain, model, prepared };
}

test("the compact correction reconstructs two islands while preserving every original feature", async () => {
  const { layout, ground, model, prepared } = await fixture(), before = structuredClone(layout.features);
  await verifySharedGroundSource(layout, ground);
  assert.notEqual(model.kind, "surface");
  const road = buildRoad(prepared), borders = bordersFromLayout(prepared)!;
  assert.equal(road.ground!.boundaries.inner.length, 2);
  assert.equal(borders.features.find((f) => f.properties.role === "inner")!.geometry.type, "MultiLineString");
  assert.deepEqual(prepared.features, before);
  assert.ok(Math.abs(road.length - layout.metadata.lengthM) < 3);
  assert.equal(road.interpolatedSections, 0);
  assert.ok(Number.isFinite(simulateLap(road).duration));
  const trace = layout.features.find((f) => f.properties.role === "trace")!.geometry;
  if (trace.type !== "LineString") throw new Error("Expected complete source");
  const project = plane(road.origin);
  trace.coordinates.slice(0, -1).forEach((coordinate, i) => {
    const p = road.points.find((p) => Math.abs(p.sourceStation! - i) < 1e-8);
    assert.ok(p, `Original source control ${i} is missing`);
    const [x, north] = project.to(coordinate);
    assert.ok(Math.hypot(p.x - x, p.z + north) < 1e-7);
  });
});

test("both junction visits share one world height and every full segment clears the complete car", async () => {
  const { prepared, ground, terrain } = await fixture(), road = buildRoad(prepared), project = plane(road.origin),
    visits = ground.sourceNode.traceIndices.map((index) => road.points.find((p) => Math.abs(p.sourceStation! - index) < 1e-8)!);
  assert.ok(Math.hypot(visits[0].x - visits[1].x, visits[0].z - visits[1].z) < 1e-8);
  assert.equal(visits[0].y, visits[1].y);
  road.points.forEach((p, i) => {
    const q = road.points[(i + 1) % road.points.length];
    assert.equal(p.y, sampleElevation(terrain, project.from([p.x, -p.z])));
    assert.ok(groundSegmentClearanceM(road.ground!.footprint, [p.x, p.z], [q.x, q.z]) >= 2.5);
  });
});

test("shared-ground meshes cover physical pavement once and keep grass holes clear", async () => {
  const { prepared } = await fixture(), road = buildRoad(prepared), meshes = sharedGroundMeshes(road),
    p = meshes.asphalt.getAttribute("position"), indices = meshes.asphalt.getIndex()!;
  let area = 0;
  for (let i = 0; i < indices.count; i += 3) {
    const [a, b, c] = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)],
      x = (p.getX(a) + p.getX(b) + p.getX(c)) / 3, z = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
    assert.ok(groundClearanceM(road.ground!.footprint, [x, z]) >= -1e-4);
    area += Math.abs((p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a)) -
      (p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a))) / 2;
  }
  assert.ok(Math.abs(area - footprintArea(road.ground!.footprint)) < 0.05);
  assert.ok(meshes.curbSections > 0);
  assert.equal(meshes.curbs.getAttribute("position").count, meshes.curbs.getAttribute("color").count);
  for (const geometry of [meshes.asphalt, meshes.outlines, meshes.curbs]) geometry.dispose();
});

test("stale source/border identity and missing shared-ground proof fail before model preparation", async () => {
  const { layout, ground, terrain, model } = await fixture(), changed = structuredClone(layout),
    inner = changed.features.find((f) => f.properties.role === "inner")!.geometry;
  if (inner.type !== "LineString") throw new Error("Expected source ring");
  inner.coordinates[2][0] += 0.00001;
  assert.throws(() => modelInputHash(changed, terrain, false, undefined, ground), /original trace and borders/);
  await assert.rejects(verifySharedGroundSource(changed, ground), /boundary hash mismatch/);
  assert.notEqual(model.kind, "surface");
  assert.throws(() => trackModelSchema.parse({ ...model, sharedGround: undefined }), /Shared ground/);
});

test("a claimed grass island crossing the source cannot pass point-only or nominal-width repair", async () => {
  const { prepared } = await fixture(), road = buildRoad(prepared), changed = structuredClone(prepared),
    model = changed.metadata.model3d!;
  if (model.kind === "surface" || !model.sharedGround) throw new Error("Expected ground model");
  const project = plane(road.origin), p = road.points[Math.floor(road.points.length / 3)],
    ring = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5]]
      .map(([dx, dz]) => project.from([p.x + dx, -(p.z + dz)]));
  model.sharedGround.innerRings.push(ring);
  assert.throws(() => buildRoad(changed), /complete car body/);
});

test("a shared ground claim resolves only its exact node, without concealing bridges or other crossings", async () => {
  const { prepared } = await fixture(), trace = prepared.features.find((f) => f.properties.role === "trace")!.geometry;
  if (trace.type !== "LineString") throw new Error("Expected source trace");
  const crossing = auditGradeCrossings(trace.coordinates, true)[0];
  assert.equal(modelCrossingStatus(prepared, crossing), "shared-ground-junction");
  assert.equal(modelCrossingStatus(prepared, { ...crossing, coordinate: [crossing.coordinate[0] + 0.001, crossing.coordinate[1]] }), "unexplained-source-crossing");
  assert.equal(modelCrossingStatus(prepared, { ...crossing, status: "source-bridge-needs-profile" }), "bridge-profile-missing-playable-model");
});
