import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bordersFromLayout, bordersSchema } from "../src/track-borders";
import { validateLayout, validateTrack, isTimingRole } from "../schemas/data";
const json=async(path:string)=>JSON.parse(await readFile(path,"utf8"));

test("embedded borders validate without being mistaken for timing gates",async()=>{
 const track=validateTrack(await json("data/belgium/spa-francorchamps/track.json"));
 const data=validateLayout(await json("data/belgium/spa-francorchamps/layouts/grand-prix.geojson"),track,"grand-prix");
 assert.deepEqual(bordersFromLayout(data)?.features.map(f=>f.properties.role).sort(),["inner","outer"]);
 assert.equal(data.features.filter(f=>isTimingRole(f.properties.role)).length,0);
 assert.equal(data.metadata.timingStatus,"estimated");
 assert.ok(data.features.filter(f=>["inner","outer"].includes(f.properties.role)).every(f=>f.properties.sourceIds.length===0));
 const incomplete=structuredClone(data);incomplete.features=incomplete.features.filter(f=>f.properties.role!=="outer");
 assert.throws(()=>validateLayout(incomplete,track,"grand-prix"),/both inner and outer/);
});

test("border overlays require one inner and one outer feature with finite GPS coordinates",()=>{
 const data={type:"FeatureCollection",features:["inner","outer"].map(role=>({type:"Feature",properties:{role},geometry:{type:"LineString",coordinates:[[5.96,50.44],[5.97,50.43]]}}))};
 assert.doesNotThrow(()=>bordersSchema.parse(data));
 const same=structuredClone(data);same.features[1].properties.role="inner";
 assert.throws(()=>bordersSchema.parse(same));
 const bad=structuredClone(data);bad.features[0].geometry.coordinates[0]=[Infinity,95];
 assert.throws(()=>bordersSchema.parse(bad));
});

test("composite border layouts preserve separate component paths",()=>{
 const coordinates=[[[5.96,50.44],[5.97,50.43]],[[5.98,50.44],[5.99,50.43]]];
 const result=bordersSchema.parse({type:"FeatureCollection",features:["inner","outer"].map(role=>({type:"Feature",properties:{role},geometry:{type:"MultiLineString",coordinates}}))});
 assert.deepEqual(result.features[0].geometry.coordinates,coordinates);
});

test("canonical layouts reject border geometry beyond the viewer's supported path limits",async()=>{
 const track=validateTrack(await json("data/belgium/spa-francorchamps/track.json"));
 const data=await json("data/belgium/spa-francorchamps/layouts/grand-prix.geojson");
 const border=data.features.find((f:{properties:{role:string}})=>f.properties.role==="inner");
 border.geometry={type:"MultiLineString",coordinates:Array.from({length:33},()=>[[5.96,50.44],[5.97,50.43]])};
 assert.throws(()=>validateLayout(data,track,"grand-prix"),/display limits/);
});
