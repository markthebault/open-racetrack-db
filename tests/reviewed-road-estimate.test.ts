import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import type {Layout} from "../schemas/data";
import {borderInferenceSchema} from "../schemas/border-inference";
import {borderPairHash} from "../scripts/refine-image-borders";
import {reviewedRoadEstimateReplacement,verifyReviewedRoadEstimateResult} from "../scripts/reviewed-road-estimate";
const load=(p:string)=>JSON.parse(readFileSync(p,"utf8"));
const file="data/united-states/us-norway-speedway-28bd57a2/layouts/norway-speedway.geojson";
const review=load("sources/research/norway-speedway-border-reestimate.json");
function fixture(){
  const target=load(file) as Layout;delete target.metadata.borderInference;
  target.features=target.features.filter(f=>f.properties.role!=="ideal");
  const pair={} as {inner:[number,number][];outer:[number,number][]};
  for(const role of ["inner","outer"] as const){
    const f=target.features.find(f=>f.properties.role===role)!;
    if(f.geometry.type!=="LineString")throw new Error("Expected a line");
    pair[role]=f.geometry.coordinates;
    f.properties={role,sourceIds:[],license:"LicenseRef-Track-Borders"};
  }
  const trace=target.features.find(f=>f.properties.role==="trace")!.geometry;
  return{target,pin:{...review,originalBorderSha256:borderPairHash(pair),traceSha256:createHash("sha256").update(JSON.stringify(trace)).digest("hex")}};
}
test("image-reviewed replacement pins original geometry, route, image and review without mutating inputs",()=>{
  const {target,pin}=fixture(),before=structuredClone(target);
  const result=reviewedRoadEstimateReplacement(target,pin,pin.imageSha256);
  assert.equal(result.replacement.borderSha256,pin.originalBorderSha256);
  assert.deepEqual(result.replacement.imageReview,pin);assert.deepEqual(target,before);
  for(const field of ["originalBorderSha256","traceSha256","imageSha256"]){
    assert.throws(()=>reviewedRoadEstimateReplacement(target,{...pin,[field]:"0".repeat(64)},pin.imageSha256));
  }
  assert.throws(()=>reviewedRoadEstimateReplacement(target,{...pin,defectCropViewed:false},pin.imageSha256));
  assert.throws(()=>reviewedRoadEstimateReplacement(target,{...pin,defectVertices:[{edge:"outer",index:1e8}]},pin.imageSha256));
  target.metadata.geometryKind="network";
  assert.throws(()=>reviewedRoadEstimateReplacement(target,pin,pin.imageSha256),/independent/);
});
test("published reviewed estimate rejects altered output, provider rights and unreviewed automatic replacements",()=>{
  const target=load(file) as Layout;
  assert.doesNotThrow(()=>verifyReviewedRoadEstimateResult(target,review));
  const inference=structuredClone(target.metadata.borderInference!);
  delete inference.supersedes!.imageReview;
  assert.equal(borderInferenceSchema.safeParse(inference).success,false);
  const bad=structuredClone(target),edge=bad.features.find(f=>f.properties.role==="inner")!;
  if(edge.geometry.type!=="LineString")throw new Error("Expected line");
  edge.geometry.coordinates[0][0]+=.00001;
  assert.throws(()=>verifyReviewedRoadEstimateResult(bad,review),/hash changed/);
  const wrongRights=structuredClone(target);
  wrongRights.features.find(f=>f.properties.role==="inner")!.properties={role:"inner",sourceIds:[],license:"LicenseRef-Track-Borders"};
  assert.throws(()=>verifyReviewedRoadEstimateResult(wrongRights,review),/rights changed/);
  const wrongMethod=structuredClone(target.metadata.borderInference!);wrongMethod.method="rgb-cross-sections-v2";
  assert.equal(borderInferenceSchema.safeParse(wrongMethod).success,false);
});
