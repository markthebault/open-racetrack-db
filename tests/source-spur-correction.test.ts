import {test} from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";
import type {Layout} from "../schemas/data";import {borderPairHash} from "../scripts/refine-image-borders";import {applySourceSpurCorrection,verifySourceSpurResult} from "../scripts/source-spur-correction";import {borderInferenceSchema} from "../schemas/border-inference";
const file="data/australia/queensland-raceway-26175772/layouts/queensland-raceway-sprint-circuit.geojson",load=(path=file)=>JSON.parse(readFileSync(path,"utf8")) as Layout;
function fixture(path=file){const current=load(path),{original,pin}=verifySourceSpurResult(current),before=structuredClone(current),info=current.metadata.borderInference!.imagery;delete before.metadata.borderInference;before.features=before.features.filter(f=>f.properties.role!=="ideal");for(const role of ["inner","outer"] as const){const edge=before.features.find(f=>f.properties.role===role)!;edge.geometry={type:"LineString",coordinates:original[role]};}return{before,current,pin,info};}
test("source-spur review replays only exact deletions and preserves every retained coordinate and property",()=>{
 const {before,current,pin,info}=fixture(),untouched=structuredClone(before),result=applySourceSpurCorrection(before,pin,info);
 assert.deepEqual(before,untouched);assert.deepEqual(verifySourceSpurResult(result).pin,pin);
 for(const role of ["inner","outer"]){assert.deepEqual(result.features.find(f=>f.properties.role===role),current.features.find(f=>f.properties.role===role));}
 assert.deepEqual(result.features.filter(f=>!["inner","outer"].includes(f.properties.role)),before.features.filter(f=>!["inner","outer"].includes(f.properties.role)));
 assert.equal(result.metadata.borderInference!.evidence,undefined);assert.equal(result.metadata.borderInference!.measurement,undefined);
});
test("changed pins, coordinates, rights and endpoint deletions are rejected",()=>{
 const {before,pin,info}=fixture();
 for(const field of ["originalBorderSha256","traceSha256","imageSha256","resultBorderSha256"]){assert.throws(()=>applySourceSpurCorrection(before,{...pin,[field]:"0".repeat(64)},info));}
 const changed=structuredClone(pin);changed.removed[0].coordinate[0]+=.00001;assert.throws(()=>applySourceSpurCorrection(before,changed,info),/original coordinate/);
 assert.throws(()=>applySourceSpurCorrection(before,{...pin,removed:[{...pin.removed[0],index:0}]},info));
 assert.throws(()=>applySourceSpurCorrection(before,{...pin,removed:[...pin.removed,...pin.removed]},info),/Duplicate/);
 const bad=structuredClone(before),edge=bad.features.find(f=>f.properties.role==="outer")!;edge.properties={role:"outer",sourceIds:[],license:"LicenseRef-Component-Borders"};assert.throws(()=>applySourceSpurCorrection(bad,pin,info),/rights/);
});
test("the original pair reconstructs offline; altered output and fabricated automatic evidence fail",()=>{
 const current=load(),before=structuredClone(current);verifySourceSpurResult(current);assert.deepEqual(current,before);
 const edge=current.features.find(f=>f.properties.role==="outer")!;if(edge.geometry.type!=="LineString")throw new Error("Expected edge");edge.geometry.coordinates[10][0]+=.000001;assert.throws(()=>verifySourceSpurResult(current),/result hash changed/);
 const inference=structuredClone(before.metadata.borderInference!);inference.evidence={strongEdgeFraction:[1,1],medianInteriorDifference:[0,0],samplingStepM:3,searchRangeM:[-10,25]};assert.equal(borderInferenceSchema.safeParse(inference).success,false);
 const {before:bad,pin,info}=fixture(),f=bad.features.find(f=>f.properties.role===pin.removed[0].edge)!;if(f.geometry.type!=="LineString")throw new Error("Expected edge");f.geometry.coordinates[pin.removed[0].index-1][0]+=.001;
 const pair=Object.fromEntries(["inner","outer"].map(role=>[role,(bad.features.find(f=>f.properties.role===role)!.geometry as {coordinates:[number,number][]}).coordinates])) as Parameters<typeof borderPairHash>[0];
 assert.throws(()=>applySourceSpurCorrection(bad,{...pin,originalBorderSha256:borderPairHash(pair)},info),/return within/);
});

test("a spur immediately before ring closure reconstructs at its original index",()=>{
 const {before,pin,info}=fixture(),role=pin.removed[0].edge,edge=before.features.find(f=>f.properties.role===role)!;
 if(edge.geometry.type!=="LineString")throw new Error("Expected edge");
 const unique=edge.geometry.coordinates.slice(0,-1),start=pin.removed[0].index+1,rotated=[...unique.slice(start),...unique.slice(0,start)];
 edge.geometry.coordinates=[...rotated,rotated[0]];
 const pair=(d:Layout)=>Object.fromEntries(["inner","outer"].map(role=>[role,(d.features.find(f=>f.properties.role===role)!.geometry as {coordinates:[number,number][]}).coordinates])) as Parameters<typeof borderPairHash>[0];
 const expected=structuredClone(before),changed=expected.features.find(f=>f.properties.role===role)!;
 if(changed.geometry.type!=="LineString")throw new Error("Expected edge");changed.geometry.coordinates.splice(rotated.length-1,1);
 const review={...pin,removed:[{...pin.removed[0],index:rotated.length-1}],originalBorderSha256:borderPairHash(pair(before)),resultBorderSha256:borderPairHash(pair(expected))};
 const result=applySourceSpurCorrection(before,review,info);
 assert.deepEqual(verifySourceSpurResult(result).original,pair(before));
});


test("dense paint groups and a bounded numerical loop restore every original Asan vertex",()=>{
 const {before,current,pin,info}=fixture("data/japan/osm-155926409/layouts/main.geojson"),beforeCopy=structuredClone(before);
 assert.equal(pin.removed.length,47);assert.equal(pin.removed.filter(p=>p.kind==="sub-metre-self-crossing").length,6);
 const result=applySourceSpurCorrection(before,pin,info);assert.deepEqual(before,beforeCopy);assert.deepEqual(verifySourceSpurResult(result).original,verifySourceSpurResult(current).original);
 for(const role of ["inner","outer"])assert.deepEqual(result.features.find(f=>f.properties.role===role),current.features.find(f=>f.properties.role===role));
 const wrongKind=structuredClone(pin);for(const p of wrongKind.removed)delete p.kind;
 assert.throws(()=>applySourceSpurCorrection(before,wrongKind,info),/return within/);
 const bad=structuredClone(before),review=structuredClone(pin),point=review.removed.find(p=>p.kind==="sub-metre-self-crossing")!,edge=bad.features.find(f=>f.properties.role===point.edge)!;
 if(edge.geometry.type!=="LineString")throw new Error("Expected edge");edge.geometry.coordinates[point.index][0]+=.0001;point.coordinate=[...edge.geometry.coordinates[point.index]];
 const pair=Object.fromEntries(["inner","outer"].map(role=>[role,(bad.features.find(f=>f.properties.role===role)!.geometry as {coordinates:[number,number][]}).coordinates])) as Parameters<typeof borderPairHash>[0];review.originalBorderSha256=borderPairHash(pair);
 assert.throws(()=>applySourceSpurCorrection(bad,review,info),/deviation bound/);
});
