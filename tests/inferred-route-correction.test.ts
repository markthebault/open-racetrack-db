import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';import{measuredImageBorders}from'../scripts/measured-image-borders';import{buildRoad}from'../src/lap-simulation';
import{assemble,type Way}from'../scripts/route';import{layoutSchema}from'../schemas/data';
const json=async(p:string)=>JSON.parse(await readFile(p,'utf8')),hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
test('Autobahn corrected fallback preserves source proof and independently regenerated public-domain estimates',async()=>{
 const s='sources/us-autobahn-country-club-42852101',d='data/united-states/autobahn-country-club-42852101/layouts',recipe=await json(s+'/layouts/main.json'),proof=await json('sources/research/autobahn-route-correction.json'),main=layoutSchema.parse(await json(d+'/main.geojson')),named=layoutSchema.parse(await json(d+'/autobahn-country-club.geojson'));
 const ways=async(file:string)=>(await json(s+'/'+file)).elements.filter((e:Way&{type:string})=>e.type==='way');
 const old={type:'LineString',coordinates:assemble(await ways('osm.json'),proof.previousRecipe.segments,true)},trace={type:'LineString',coordinates:assemble(await ways(recipe.snapshotFile),recipe.segments,true)};
 assert.equal(hash(old),proof.previousTraceSha256);assert.notEqual(hash(trace),hash(old));assert.equal(hash(trace),proof.replacement.traceSha256);assert.equal(recipe.snapshotSha256,proof.replacement.snapshotSha256);assert.deepEqual(main.features.find(f=>f.properties.role==='trace')!.geometry,trace);assert.deepEqual(trace,named.features.find(f=>f.properties.role==='trace')!.geometry);
 for(const id of proof.excludedWayIds)assert.equal(recipe.segments.some((p:{wayId:number})=>p.wayId===id),false);
 const pair=(l:typeof main)=>['inner','outer'].map(role=>l.features.find(f=>f.properties.role===role)!);assert.notDeepEqual(pair(main),pair(named));assert.equal(hash(pair(named).map(f=>f.geometry.coordinates)),proof.borderReplay.borderGeometrySha256);for(const f of pair(main)){assert.ok('license'in f.properties);assert.equal(f.properties.license,'public-domain');}
 assert.equal(main.metadata.borderInference!.method,'image-measured-paired-edges-v1');const {resultSha256,...input}=main.metadata.borderInference!.measurement!;const replay=measuredImageBorders(trace.coordinates,input,proof.measurement.imageSha256);assert.equal(replay.measurement.resultSha256,resultSha256);assert.equal(resultSha256,proof.measurement.resultSha256);for(const edge of ['inner','outer']as const)assert.deepEqual(replay.result[edge],main.features.find(f=>f.properties.role===edge)!.geometry.coordinates);assert.equal(input.patches.reduce((n,p)=>n+p.anchors.length,0),650);const road=buildRoad(main);assert.equal(road.interpolatedSections,0);assert.ok(Math.min(...road.points.map(p=>p.left+p.right))>10);assert.equal(main.metadata.borderInference!.status,'estimated');assert.equal(main.metadata.borderInference!.traceSha256,hash(trace));assert.deepEqual(main.metadata.borderInference!.imagery,named.metadata.borderInference!.imagery);assert.equal(main.metadata.borderInference!.imagery.sha256,proof.borderReplay.imageSha256);assert.equal(recipe.originalBorderReuse,undefined);
 assert.equal(main.metadata.timing,undefined);assert.equal(main.metadata.timingStatus,'missing');assert.ok(main.metadata.model3d);
});

test('Talladega full-course correction excludes internal shortcuts and retains timing',async()=>{
 const root='sources/us-talladega-grand-prix-raceway-1061184414',recipe=await json(root+'/layouts/talladega-gran-prix.json'),proof=await json('sources/research/talladega-course-correction.json'),snapshot=await json(root+'/'+recipe.snapshotFile),ways=snapshot.elements.filter((e:Way&{type:string})=>e.type==='way'),layout=layoutSchema.parse(await json('data/united-states/talladega-grand-prix-raceway-1061184414/layouts/talladega-gran-prix.geojson'));
 const previous=assemble(ways,proof.original.recipe.segments,true),current=assemble(ways,recipe.segments,true),closedCourse=ways.find((w:Way)=>w.id===1061184414);
 assert.deepEqual(previous,proof.original.layout.features.find((f:any)=>f.properties.role==='trace').geometry.coordinates);
 assert.notDeepEqual(previous,current);
 assert.deepEqual(current,closedCourse.geometry.map((p:{lon:number;lat:number})=>[p.lon,p.lat]));
 assert.deepEqual(layout.features.find(f=>f.properties.role==='trace')!.geometry.coordinates,current);
 assert.deepEqual(layout.metadata.timing,proof.original.layout.metadata.timing);
 const evidence=layout.metadata.borderInference!,{resultSha256,...input}=evidence.measurement!,replay=measuredImageBorders(current,input,evidence.imagery.sha256);
 assert.equal(replay.measurement.resultSha256,resultSha256);
 for(const edge of ['inner','outer']as const)assert.deepEqual(replay.result[edge],layout.features.find(f=>f.properties.role===edge)!.geometry.coordinates);
 assert.equal(buildRoad(layout).interpolatedSections,0);
 assert.ok(layout.metadata.model3d);
});
