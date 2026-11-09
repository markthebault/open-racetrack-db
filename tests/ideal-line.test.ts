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
  const { pathCrossings } = await import("../src/path-crossings");
  const { reviewedNetworkGround } = await import("../scripts/ideal-network-ground");
  const { groundSegmentClearanceM } = await import("../src/ribbon-surface");
  const report = JSON.parse(
    readFileSync("data/ideal-lines-coverage.json", "utf8"),
  );
  for (const row of report.records.filter(
    (r: { status: string }) => r.status === "generated",
  )) {
    const d = JSON.parse(readFileSync(row.file, "utf8")) as Layout,
      recipe = d.metadata.model3d;
    const ideal = d.features.find((f) => f.properties.role === "ideal");
    assert.ok(ideal, row.file);
    if (
      (ideal.properties.role === "ideal" && ideal.properties.boundaryModel === "ordered-border-ribbon-v1") ||
      d.metadata.borderInference?.gradeSeparation ||
      (recipe?.kind !== "surface" && recipe?.sharedGround) ||
      (recipe?.kind !== "surface" && recipe?.sourceSequence)
    )
      continue;
    const networkGround=ideal.properties.role==='ideal'&&ideal.properties.networkReview?.method==='image-reviewed-network-pavement-v2'
      ? reviewedNetworkGround(d,ideal.properties.networkReview):undefined;
    for (const [index,path] of geometryPaths(ideal.geometry).entries()) {
      const project = plane(path[0]);
      if(networkGround){
        const source=networkGround.source[index],closed=equal(source[0],source.at(-1)!),
          expected=pathCrossings(source.map(project.to),closed),actual=pathCrossings(path.map(project.to),closed);
        assert.equal(actual.length,expected.length,row.file);
        const points=path.map(networkGround.project.to);
        for(let i=1;i<points.length;i++)assert.ok(groundSegmentClearanceM(networkGround.footprint,points[i-1],points[i])>=IDEAL_CAR.widthM/2+.5,row.file);
        if(expected.length){
          const length=(p:[number,number][])=>p.slice(1).reduce((s,q,i)=>s+Math.hypot(q[0]-p[i][0],q[1]-p[i][1]),0),
            a=length(source.map(project.to)),b=length(path.map(project.to));
          for(const [i,c] of actual.entries()){
            assert.equal(c.kind,'crossing',row.file);assert.equal(expected[i].kind,'crossing',row.file);
            assert.ok(Math.hypot(c.point[0]-expected[i].point[0],c.point[1]-expected[i].point[1])<=20,row.file);
            assert.ok(c.stations.every((s,j)=>Math.abs(s/b-expected[i].stations[j]/a)*a<=50),row.file);
          }
          continue;
        }
      }
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
