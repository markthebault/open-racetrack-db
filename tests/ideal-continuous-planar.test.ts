import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { geometryPaths, type Layout, validateLayout, validateTrack } from "../schemas/data";
import { roadRings, insideRing } from "../src/boundary-path";
import { groundFootprintFromRings, groundSegmentClearanceM } from "../src/ribbon-surface";
import { IDEAL_CAR } from "../src/ideal-line-model";
import { continuousPlanarIdealLine } from "../scripts/ideal-continuous-planar";
const files=["data/australia/au-bathurst-17c80b83/layouts/bathurst.geojson","data/united-states/us-michelin-laurens-proving-grounds-bdeb232d/layouts/michelin-laurens-proving-grounds.geojson"];
const load=(file:string)=>JSON.parse(readFileSync(file,"utf8")) as Layout;
test("both small-margin ideal lines continuously fit the original complete annulus at unchanged vehicle width",()=>{
  assert.equal(IDEAL_CAR.widthM,2.05);
  for(const file of files){
    const d=load(file),ideal=d.features.find(f=>f.properties.role==="ideal")!;
    if(ideal.properties.role!=="ideal")throw new Error("Missing ideal line");
    assert.equal(ideal.properties.boundaryModel,"continuous-planar-v1");assert.equal(ideal.properties.edgeMarginM,0.01);
    const {inner,outer,project}=roadRings(d),footprint=groundFootprintFromRings([outer],[inner]);
    const points=geometryPaths(ideal.geometry)[0].slice(0,-1).map(project.to);
    for(const [i,p]of points.entries())assert.ok(groundSegmentClearanceM(footprint,p,points[(i+1)%points.length])>=IDEAL_CAR.widthM/2+ideal.properties.edgeMarginM+0.001,file);
    const closed=[...points,points[0]];
    for(const p of inner)assert.equal(insideRing(p,closed),true,file);
    for(const p of outer)assert.equal(insideRing(p,closed),false,file);
  }
});
test("continuous recovery reproduces its stored result and actually optimizes the reference curve",()=>{
  const d=load(files[1]),before=structuredClone(d),result=continuousPlanarIdealLine(d);
  const points=geometryPaths(d.features.find(f=>f.properties.role==="ideal")!.geometry)[0].slice(0,-1).map(result.project.to);
  assert.equal(points.length,result.points.length);
  points.forEach((p,i)=>assert.ok(Math.hypot(p[0]-result.points[i].x,p[1]+result.points[i].z)<0.00002));
  assert.ok(result.points.some((p,i)=>Math.hypot(p.x-(result.pairs[i].a[0]+result.pairs[i].b[0])/2,p.z+(result.pairs[i].a[1]+result.pairs[i].b[1])/2)>0.1));
  assert.deepEqual(d,before);
});
test("recovery rejects a source gap narrower than the vehicle and the planar marker cannot hide a projected crossing",()=>{
  assert.throws(()=>continuousPlanarIdealLine(load("data/australia/au-albert-park-3785d160/layouts/albert-park.geojson")),/too narrow/);
  const dir="data/australia/au-oran-park-raceway-692abacd/",d=load(dir+"layouts/oran-park-raceway.geojson"),track=validateTrack(JSON.parse(readFileSync(dir+"track.json","utf8")));
  const ideal=d.features.find(f=>f.properties.role==="ideal")!;if(ideal.properties.role!=="ideal")throw new Error("Missing ideal line");
  ideal.properties.boundaryModel="continuous-planar-v1";
  assert.throws(()=>validateLayout(d,track,d.metadata.layoutId),/cross or touch|not nested/);
});
