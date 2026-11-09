import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Layout } from "../schemas/data";
import { reviewedEstimateReplacement } from "../scripts/reviewed-estimate-replacement";
import { borderPairHash } from "../scripts/refine-image-borders";
const dir="data/finland/botniaring-111368167/layouts/";
const load=(p:string)=>JSON.parse(readFileSync(p,"utf8"));
const source=load(dir+"main.geojson") as Layout,review=load("sources/research/botniaring-border-reestimate.json");
const pair=(d:Layout)=>Object.fromEntries(["inner","outer"].map(role=>[role,(d.features.find(f=>f.properties.role===role)!.geometry as {coordinates:[number,number][]}).coordinates])) as {inner:[number,number][];outer:[number,number][]};
function fixture(){
  const target=structuredClone(source);target.metadata.layoutId=review.targetLayoutId;delete target.metadata.borderInference;
  target.features=target.features.filter(f=>f.properties.role!=="ideal");
  target.features.find(f=>f.properties.role==="trace")!.geometry=load(dir+"botniaringfull.geojson").features.find((f:any)=>f.properties.role==="trace").geometry;
  for(const f of target.features)if(f.properties.role==="inner"||f.properties.role==="outer")f.properties={role:f.properties.role,sourceIds:[],license:"LicenseRef-Track-Borders"};
  return {target,pin:{...review,originalBorderSha256:borderPairHash(pair(target))}};
}
test("a pinned same-cycle estimate permits only exact source-node cycling and preserves its inputs",()=>{
  const {target,pin}=fixture(),before=structuredClone(target),donor=structuredClone(source);
  const result=reviewedEstimateReplacement(target,source,pin,pin.imageSha256);
  assert.equal(result.replacement.borderSha256,pin.originalBorderSha256);
  assert.equal(result.replacement.reason,pin.note);assert.deepEqual(target,before);assert.deepEqual(source,donor);
});
test("same point sets in a different route order, changed source edges and mismatched images are rejected",()=>{
  const {target,pin}=fixture(),trace=target.features.find(f=>f.properties.role==="trace")!.geometry;
  if(trace.type!=="LineString")throw new Error("Expected source");
  [trace.coordinates[7],trace.coordinates[8]]=[trace.coordinates[8],trace.coordinates[7]];
  assert.throws(()=>reviewedEstimateReplacement(target,source,pin,pin.imageSha256),/same source-node cycle/);
  const good=fixture();assert.throws(()=>reviewedEstimateReplacement(good.target,source,good.pin,"0".repeat(64)),/image differs/);
  assert.throws(()=>reviewedEstimateReplacement(good.target,source,{...good.pin,sourceBorderSha256:"0".repeat(64)},good.pin.imageSha256),/source borders changed/);
});
test("target replacement hashes, source rights and recorded image review are mandatory",()=>{
  const {target,pin}=fixture();assert.throws(()=>reviewedEstimateReplacement(target,source,{...pin,originalBorderSha256:"0".repeat(64)},pin.imageSha256),/replacement hash/);
  const bad=structuredClone(source),border=bad.features.find(f=>f.properties.role==="inner")!;
  border.properties={role:"inner",sourceIds:[],license:"LicenseRef-Track-Borders"};
  assert.throws(()=>reviewedEstimateReplacement(target,bad,pin,pin.imageSha256),/source border rights/);
  assert.throws(()=>reviewedEstimateReplacement(target,source,{...pin,defectCropViewed:false},pin.imageSha256));
});

test("published replacement retains its complete pin, source cycle, output coordinates and provider rights",async()=>{
  const {verifyReviewedEstimateResult}=await import("../scripts/reviewed-estimate-replacement");
  const target=load(dir+"botniaringfull.geojson") as Layout;
  assert.deepEqual(target.metadata.borderInference!.supersedes!.sameCycleReview,review);
  assert.doesNotThrow(()=>verifyReviewedEstimateResult(target,source,review));
  for(const f of target.features.filter(f=>f.properties.role==="inner"||f.properties.role==="outer"))assert.equal("license" in f.properties&&f.properties.license,target.metadata.borderInference!.imagery.license);
  const {roadRings}=await import("../src/boundary-path"),{geometryPaths}=await import("../schemas/data"),{groundFootprintFromRings,groundSegmentClearanceM}=await import("../src/ribbon-surface"),{IDEAL_CAR}=await import("../src/ideal-line-model");
  const {inner,outer,project}=roadRings(target),footprint=groundFootprintFromRings([outer],[inner]),ideal=target.features.find(f=>f.properties.role==="ideal")!;
  if(ideal.properties.role!=="ideal")throw new Error("Missing ideal line");
  const points=geometryPaths(ideal.geometry)[0].slice(0,-1).map(project.to);
  for(const [i,p]of points.entries())assert.ok(groundSegmentClearanceM(footprint,p,points[(i+1)%points.length])>=IDEAL_CAR.widthM/2+ideal.properties.edgeMarginM);
});
