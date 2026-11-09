import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { type Layout, validateLayout, validateTrack } from "../schemas/data";
import { buildRoad } from "../src/lap-simulation";
import { plane, type Position } from "../src/geo";
import { groundSegmentClearanceM } from "../src/ribbon-surface";
import { IDEAL_CAR } from "../src/ideal-line-model";
import { groundIdealLine } from "../scripts/ideal-ground-line";
const directory = "data/united-kingdom/gb-dunsfold-top-gear-06a07bad/";
const layout = JSON.parse(readFileSync(directory + "layouts/dunsfold-top-gear.geojson", "utf8")) as Layout;
const road = buildRoad(layout), project = plane(road.origin);
const winding = (points: Position[], p: Position) => {
  let result = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length],
      side = (b[0]-a[0])*(p[1]-a[1])-(p[0]-a[0])*(b[1]-a[1]);
    if (a[1] <= p[1] && b[1] > p[1] && side > 0) result++;
    if (a[1] > p[1] && b[1] <= p[1] && side < 0) result--;
  }
  return result;
};
test("stored shared-ground ideal optimizes in source order, clears whole segments and retains both grass loops", () => {
  const ideal = layout.features.find((f) => f.properties.role === "ideal")!;
  assert.equal(ideal.properties.role, "ideal");
  if (ideal.properties.role !== "ideal" || ideal.geometry.type !== "LineString") throw new Error("Missing ideal line");
  assert.equal(ideal.properties.boundaryModel, "shared-ground-v1");
  const points = ideal.geometry.coordinates.slice(0,-1).map((p): Position => {
    const [x,n] = project.to(p); return [x,-n];
  });
  assert.equal(points.length, road.points.length);
  assert.ok(points.some((p,i) => Math.hypot(p[0]-road.points[i].x,p[1]-road.points[i].z)>0.1));
  for (const [i,p] of points.entries()) assert.ok(
    groundSegmentClearanceM(road.ground!.footprint,p,points[(i+1)%points.length]) >= IDEAL_CAR.widthM/2+ideal.properties.edgeMarginM,
  );
  const source = road.points.map((p): Position=>[p.x,p.z]);
  const loopWindings = road.ground!.footprint.flatMap((p)=>p.slice(1)).map((hole)=>{
    assert.equal(winding(points,hole[0]),winding(source,hole[0]));
    return winding(points,hole[0]);
  });
  assert.deepEqual(loopWindings.map(Math.abs),[1,1]);
});
test("shared-ground ideals require the saved reconstruction rights and reject an oversized vehicle", () => {
  const track = validateTrack(JSON.parse(readFileSync(directory+"track.json","utf8")));
  assert.doesNotThrow(()=>validateLayout(layout,track,layout.metadata.layoutId));
  const bad = structuredClone(layout), ideal = bad.features.find((f)=>f.properties.role==="ideal")!;
  if (ideal.properties.role !== "ideal") throw new Error("Missing ideal line");
  ideal.properties.borderLicenses = ideal.properties.borderLicenses.filter((l)=>l!=="LicenseRef-MapTiler-Derived-Borders");
  assert.throws(()=>validateLayout(bad,track,bad.metadata.layoutId));
  assert.throws(()=>groundIdealLine(road,0.5,{...IDEAL_CAR,widthM:1000}),/clearance/);
});
