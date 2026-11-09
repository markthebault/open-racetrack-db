import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateTrack, validateLayout, type Layout } from "../schemas/data";
import {
  serializeLayout,
  existingLayoutExtras,
} from "../scripts/layout-borders";
import { modelInputHash } from "../scripts/model-input";
import { IDEAL_CAR, G, lateralLimit } from "../src/ideal-line-model";
import { speedProfile } from "../scripts/ideal-line-solver";
const file = "data/belgium/spa-francorchamps/layouts/grand-prix.geojson",
  raw = JSON.parse(readFileSync(file, "utf8")) as Layout,
  track = validateTrack(
    JSON.parse(
      readFileSync("data/belgium/spa-francorchamps/track.json", "utf8"),
    ),
  );
test("ideal line is an optional estimated feature with separate border rights and preserved canonical serialization", async () => {
  const layout = validateLayout(raw, track, "grand-prix"),
    ideal = layout.features.find((f) => f.properties.role === "ideal");
  assert.ok(ideal?.properties.role === "ideal");
  assert.equal(ideal.properties.estimated, true);
  assert.equal(serializeLayout(layout), readFileSync(file, "utf8"));
  const extras = await existingLayoutExtras(file);
  assert.deepEqual(extras.ideal, ideal);
  assert.equal(extras.borders.length, 2);
  const without = structuredClone(layout);
  without.features = without.features.filter(
    (f) => f.properties.role !== "ideal",
  );
  assert.ok(validateLayout(without, track, "grand-prix"));
  assert.equal(
    modelInputHash(layout, layout.metadata.model3d!.terrain),
    modelInputHash(without, without.metadata.model3d!.terrain),
  );
});
test("derived lines cannot claim surveyed status or exist without the source boundaries", () => {
  const bad = structuredClone(raw) as any;
  bad.features.find(
    (f: any) => f.properties.role === "ideal",
  ).properties.estimated = false;
  assert.throws(() => validateLayout(bad, track, "grand-prix"));
  const missing = structuredClone(raw);
  missing.features = missing.features.filter(
    (f) => f.properties.role !== "inner" && f.properties.role !== "outer",
  );
  assert.throws(() => validateLayout(missing, track, "grand-prix"));
});
test("constant-radius speed respects aero-dependent lateral grip and combined traction", () => {
  const p = Array.from({ length: 180 }, (_, i) => ({
      x: 70 * Math.cos((i / 180) * 2 * Math.PI),
      z: 70 * Math.sin((i / 180) * 2 * Math.PI),
      y: 0,
    })),
    r = speedProfile(p, true, IDEAL_CAR);
  assert.ok(
    r.speed.every(
      (v, i) =>
        (v * v * Math.abs(r.curvature[i])) / G <=
        lateralLimit(v, IDEAL_CAR) + 1e-5,
    ),
  );
  assert.ok(r.duration > 0);
  assert.ok(Math.abs(r.speed[0] - r.speed.at(-1)!) < 0.01);
});

test("all stored independent ideal corridors are simple; ordered crossings retain their explicit source model", async () => {
  const { geometryPaths } = await import("../schemas/data");
  const { plane, equal } = await import("../src/geo");
  const { assertSeparateSimpleRings } = await import("../src/boundary-path");
  const report = JSON.parse(
    readFileSync("data/ideal-lines-coverage.json", "utf8"),
  );
  for (const row of report.records.filter(
    (r: { status: string }) => r.status === "generated",
  )) {
    const d = JSON.parse(readFileSync(row.file, "utf8")) as Layout,
      recipe = d.metadata.model3d;
    if (
      d.metadata.borderInference?.gradeSeparation ||
      (recipe?.kind !== "surface" && recipe?.sharedGround) ||
      (recipe?.kind !== "surface" && recipe?.sourceSequence)
    )
      continue;
    const ideal = d.features.find((f) => f.properties.role === "ideal");
    assert.ok(ideal, row.file);
    for (const path of geometryPaths(ideal.geometry)) {
      const project = plane(path[0]);
      assert.doesNotThrow(
        () =>
          assertSeparateSimpleRings(
            [path.map(project.to)],
            equal(path[0], path.at(-1)!),
          ),
        row.file,
      );
    }
  }
});
