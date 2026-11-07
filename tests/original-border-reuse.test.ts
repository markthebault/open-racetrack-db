import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {layoutSchema,type Layout} from '../schemas/data';
import {geometryHash,reuseOriginalBorders} from '../scripts/reuse-original-borders';
import {assemble,type Way} from '../scripts/route';
const dir='data/united-kingdom/silverstone-circuit-3571477',sources='sources/gb-silverstone-circuit-3571477';
const json=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
const source=layoutSchema.parse(await json(`${dir}/layouts/silverstone-gp-wing-sf.geojson`));
const recipe=await json(`${sources}/layouts/main.json`),pin=recipe.originalBorderReuse;
function target(){const t=structuredClone(source);t.metadata.layoutId='test-reuse';delete t.metadata.timing;delete t.metadata.model3d;t.metadata.timingStatus='missing';t.features=t.features.filter(f=>f.properties.role==='trace');return t;}
test('exact original border reuse clones rights and coordinates without importing timing or changing inputs',()=>{
 const t=target(),before=JSON.stringify(t),original=JSON.stringify(source),r=reuseOriginalBorders(t,source,pin);
 assert.equal(JSON.stringify(t),before);assert.equal(JSON.stringify(source),original);
 assert.deepEqual(r.borders,source.features.filter(f=>['inner','outer'].includes(f.properties.role)));
 assert.match(r.note,/timing is not inherited/);assert.equal(t.metadata.timing,undefined);
 r.borders[0].geometry.coordinates.pop();assert.equal(JSON.stringify(source),original);
});
test('exact reuse refuses geometry, phase, identity, rights, evidence and existing-border drift',()=>{
 const reject=(change:(t:Layout,s:Layout)=>void,reference:unknown=pin)=>{const t=target(),s=structuredClone(source);change(t,s);assert.throws(()=>reuseOriginalBorders(t,s,reference));};
 reject(t=>{t.metadata.trackId='other';});
 reject(t=>{t.metadata.layoutId=source.metadata.layoutId;});
 reject(()=>{}, {...pin,sourceLayoutId:'not-registered'});
 reject(()=>{}, {...pin,traceSha256:'0'.repeat(64)});
 reject(()=>{}, {...pin,bordersSha256:'0'.repeat(64)});
 reject(t=>{const g=t.features[0].geometry;if(g.type==='LineString')g.coordinates[1][0]+=0.00001;});
 reject(t=>{const g=t.features[0].geometry;if(g.type==='LineString'){g.coordinates.pop();g.coordinates.push(g.coordinates.shift()!);g.coordinates.push(g.coordinates[0]);}});
 reject(t=>{t.metadata.closed=false;});
 reject(t=>{t.metadata.geometryKind='network';});
 reject((_t,s)=>{s.metadata.notes.push('Original borders reused from intermediate');});
 reject((_t,s)=>{s.features.push(structuredClone(s.features.find(f=>f.properties.role==='inner')!));});
 reject((_t,s)=>{const p=s.features.find(f=>f.properties.role==='inner')!.properties;if('license'in p)p.license='CC-BY-4.0';});
 reject(t=>{const edge=structuredClone(source.features.find(f=>f.properties.role==='inner')!);if(edge.geometry.type==='LineString')edge.geometry.coordinates[1][0]+=0.00001;t.features.push(edge);});
 // Inferred data cannot be laundered into original-border reuse even with unchanged features.
 reject((_t,s)=>{s.metadata.borderInference={} as NonNullable<Layout['metadata']['borderInference']>;});
});
test('Silverstone correction replays named source exactly while retaining the superseded recipe and missing timing',async()=>{
 const data=layoutSchema.parse(await json(`${dir}/layouts/main.geojson`)),proof=await json('sources/research/silverstone-route-correction.json');
 const ways=(await json(`${sources}/${recipe.snapshotFile}`)).elements.filter((e:Way&{type:string})=>e.type==='way');
 const oldWays=(await json(`${sources}/osm.json`)).elements.filter((e:Way&{type:string})=>e.type==='way');
 const trace=data.features.find(f=>f.properties.role==='trace')!;
 assert.deepEqual(trace.geometry,{type:'LineString',coordinates:assemble(ways,recipe.segments,true)});
 assert.equal(geometryHash({type:'LineString',coordinates:assemble(oldWays,proof.previousRecipe.segments,true)}),proof.previousTraceSha256);
 assert.notEqual(proof.previousTraceSha256,pin.traceSha256);
 assert.equal(data.metadata.timing,undefined);assert.equal(data.metadata.timingStatus,'missing');
 assert.deepEqual(reuseOriginalBorders(data,source,pin).borders,data.features.filter(f=>['inner','outer'].includes(f.properties.role)));
 assert.ok(data.metadata.notes.some(n=>n.includes(pin.bordersSha256)));
 assert.ok(data.metadata.model3d);
});

for(const [name,track,folder,sibling,proofName] of [
 ['NCM','us-ncm-motorsports-park-326452603','ncm-motorsports-park-326452603','ncm-grand-full','ncm'],
 ['Pittsburgh','us-pittsburgh-international-race-complex-225264359','pittsburgh-international-race-complex-225264359','pittsburgh-int-race-complex-full','pittsburgh'],
 ['Homestead','us-homestead-miami-speedway-108159182','homestead-miami-speedway-108159182','homestead-modified-road-course','homestead'],
])test(`${name} fallback exactly replays its corrected source and pinned original borders`,async()=>{
 const base=`data/united-states/${folder}/layouts`,s=`sources/${track}`;
 const main=layoutSchema.parse(await json(`${base}/main.geojson`)),named=layoutSchema.parse(await json(`${base}/${sibling}.geojson`));
 const recipe=await json(`${s}/layouts/main.json`),proof=await json(`sources/research/${proofName}-route-correction.json`);
 const ways=async(file:string)=>(await json(`${s}/${file}`)).elements.filter((e:Way&{type:string})=>e.type==='way');
 const oldGeometry={type:'LineString',coordinates:assemble(await ways('osm.json'),proof.previousRecipe.segments,true)};
 assert.equal(geometryHash(oldGeometry),proof.previousTraceSha256);
 const geometry={type:'LineString',coordinates:assemble(await ways(recipe.snapshotFile),recipe.segments,true)};
 assert.notEqual(geometryHash(geometry),proof.previousTraceSha256);
 assert.equal(geometryHash(geometry),proof.replacement.traceSha256);
 assert.equal(recipe.snapshotSha256,proof.replacement.snapshotSha256);
 assert.deepEqual(main.features.find(f=>f.properties.role==='trace')!.geometry,geometry);
 for(const id of proof.excludedWayIds)assert.equal(recipe.segments.some((p:{wayId:number})=>p.wayId===id),false);
 assert.deepEqual(reuseOriginalBorders(main,named,recipe.originalBorderReuse).borders,main.features.filter(f=>['inner','outer'].includes(f.properties.role)));
 assert.equal(main.metadata.timing,undefined);assert.equal(main.metadata.timingStatus,'missing');
 assert.equal(main.metadata.borderInference,undefined);assert.ok(main.metadata.model3d);
});


test('coverage checks recognize all exact reused layouts without image acquisition',()=>{
 for(const track of ['gb-silverstone-circuit-3571477','us-ncm-motorsports-park-326452603','us-homestead-miami-speedway-108159182','us-pittsburgh-international-race-complex-225264359']){
  const output=execFileSync(process.execPath,['--import','tsx','scripts/infer-borders.ts','--track',track,'--layout','main','--check'],{encoding:'utf8'}),report=JSON.parse(output.trim());
  assert.equal(report.layouts,1);assert.deepEqual(report.statuses,{'reused-existing':1});
 }
});
