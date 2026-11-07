import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {buildComponentNetwork,traceHash} from '../scripts/component-network';
import {buildImageryCourse} from '../scripts/imagery-course';
import type {Track} from '../schemas/data';
const hash=(b:string|Uint8Array)=>createHash('sha256').update(b).digest('hex');
async function fixture(t:{after:(fn:()=>Promise<void>)=>void}){
 const base=await mkdtemp(join(tmpdir(),'component-network-'));t.after(()=>rm(base,{recursive:true,force:true}));const root=join(base,'test');await mkdir(join(root,'layouts'),{recursive:true});
 const save=async(file:string,value:unknown)=>{const bytes=JSON.stringify(value);await writeFile(join(root,file),bytes);return hash(bytes);};
 const track:Track={schemaVersion:1,id:'test',name:'Test',aliases:[],country:{code:'NZ',name:'New Zealand',slug:'new-zealand'},location:[172,-43],sourceIds:['osm','aerial'],defaultLayoutId:'combo',layouts:['combo','old-route','image-route'].map(id=>({id,name:id,file:`layouts/${id}.geojson`})),sources:[{id:'osm',type:'osm',title:'OSM',evidenceNote:'Pinned source nodes',url:'https://www.openstreetmap.org/',license:'ODbL-1.0',retrievedAt:'2026-01-01T00:00:00Z'},{id:'aerial',type:'imagery',title:'Aerial',evidenceNote:'Independent image coordinates',url:'https://example.org/aerial',license:'CC-BY-4.0',retrievedAt:'2026-01-01T00:00:00Z'}]};
 const oldTrace:[number,number][]=[[172,-43],[172.0001,-43],[172.0001,-43.0001],[172,-43]],oldSource={elements:[{type:'way',id:1,version:2,nodes:[1,2,3,1],geometry:oldTrace.map(([lon,lat])=>({lon,lat}))}]},oldHash=await save('osm.json',oldSource),old={schemaVersion:1,trackId:'test',layoutId:'old-route',sourceId:'osm',snapshotFile:'osm.json',snapshotSha256:oldHash,closed:true,gates:[],segments:[{wayId:1,wayVersion:2,fromIndex:0,toIndex:3}]};await save('layouts/old-route.json',old);
 const raster=PNG.sync.write(new PNG({width:100,height:100}));await writeFile(join(root,'image.png'),raster);
 const imageSource={schemaVersion:1,sourceKind:'georeferenced-imagery',sourceId:'aerial',attribution:'Aerial licensor, CC BY 4.0',license:'CC-BY-4.0',imageryFile:'image.png',imagerySha256:hash(raster),sourceUrl:'https://example.org/aerial',reuseEvidenceUrl:'https://example.org/rights',retrievedAt:'2026-01-01T00:00:00Z',width:100,height:100,extent:{xmin:19147000,ymin:-5312000,xmax:19147040,ymax:-5311960,spatialReference:3857},identificationUrl:'https://example.org/track',evidence:'Independently identified route',pixels:[[10,10],[80,10],[80,80],[10,10]],closed:true},imageHash=await save('image.json',imageSource),image={schemaVersion:1,geometrySource:'imagery',trackId:'test',layoutId:'image-route',sourceId:'aerial',snapshotFile:'image.json',snapshotSha256:imageHash,closed:true,timingMode:'shared',notes:[],gates:[]};await save('layouts/image-route.json',image);
 const imageTrace=buildImageryCourse(image,imageSource,track).features[0].geometry.coordinates as [number,number][],components=[{layoutId:'old-route',snapshotFile:'osm.json',snapshotSha256:oldHash,traceSha256:traceHash(oldTrace)},{layoutId:'image-route',snapshotFile:'image.json',snapshotSha256:imageHash,traceSha256:traceHash(imageTrace)}],parent={schemaVersion:1,sourceKind:'component-network',trackId:'test',layoutId:'combo',components},parentHash=await save('network.json',parent),recipe={schemaVersion:2,geometryKind:'network',geometrySource:'components',trackId:'test',layoutId:'combo',sourceId:'assembly',snapshotFile:'network.json',snapshotSha256:parentHash,geometryStatus:'draft',timingMode:'shared',reviewedAt:null,notes:[],gates:[],components};
 return{base,root,save,track,old,oldTrace,image,imageTrace,recipe,parent};
}
test('mixed source networks preserve both independent paths and coordinate-source attribution',async t=>{
 const f=await fixture(t),data=await buildComponentNetwork(f.recipe,f.track,f.base);
 assert.deepEqual(data.features[0].geometry.coordinates,[f.oldTrace,f.imageTrace]);assert.deepEqual(data.features[0].properties.sourceIds,['osm','aerial']);assert.match(data.metadata.attribution,/OpenStreetMap/);assert.match(data.metadata.attribution,/Aerial licensor/);assert.equal(data.metadata.closed,false);assert.equal(data.metadata.timingStatus,'missing');
});
test('mixed networks reject changed snapshot bytes, source versions and route selections',async t=>{
 const f=await fixture(t);await f.save('layouts/old-route.json',{...f.old,segments:[{...f.old.segments[0],wayVersion:3}]});await assert.rejects(buildComponentNetwork(f.recipe,f.track,f.base),/version mismatch/);
 await f.save('layouts/old-route.json',{...f.old,segments:[{...f.old.segments[0],fromIndex:3,toIndex:0}]});await assert.rejects(buildComponentNetwork(f.recipe,f.track,f.base),/trace selection changed/);
 await f.save('layouts/old-route.json',f.old);await writeFile(join(f.root,'osm.json'),'{}');await assert.rejects(buildComponentNetwork(f.recipe,f.track,f.base),/snapshot changed/);
});
test('mixed networks reject unregistered rights, altered image rasters, nested networks and unsupported gates',async t=>{
 const f=await fixture(t),withoutRights={...f.track,sources:f.track.sources.map(s=>s.id==='aerial'?{...s,license:'reference-only'}:s)};await assert.rejects(buildComponentNetwork(f.recipe,withoutRights,f.base),/rights are not registered/);
 await f.save('layouts/old-route.json',{...f.old,geometryKind:'network'});await assert.rejects(buildComponentNetwork(f.recipe,f.track,f.base),/leaf route/);
 await f.save('layouts/old-route.json',{...f.old,gates:[{role:'start_finish'}]});await assert.rejects(buildComponentNetwork(f.recipe,f.track,f.base),/trace trimming/);
 await f.save('layouts/old-route.json',f.old);await writeFile(join(f.root,'image.png'),Buffer.from('changed'));await assert.rejects(buildComponentNetwork(f.recipe,f.track,f.base),/raster changed/);
});
test('mixed network parent pins reject unsafe files, mismatches and self references',async t=>{
 const f=await fixture(t);await assert.rejects(buildComponentNetwork({...f.recipe,snapshotFile:'../osm.json'},f.track,f.base));
 await assert.rejects(buildComponentNetwork({...f.recipe,components:[...f.recipe.components].reverse()},f.track,f.base),/snapshot\/recipe mismatch/);
 const components=[{...f.recipe.components[0],layoutId:'combo'},f.recipe.components[1]],parentHash=await f.save('network.json',{...f.parent,components});await assert.rejects(buildComponentNetwork({...f.recipe,snapshotSha256:parentHash,components},f.track,f.base),/registered distinct mapped leaf/);
});
test('mixed network duplicate geometry and pit lane sources cannot add fake routes',async t=>{
 const f=await fixture(t),components=[f.recipe.components[0],{...f.recipe.components[0],layoutId:'image-route'}],parentHash=await f.save('network.json',{...f.parent,components});
 await f.save('layouts/image-route.json',{...f.old,layoutId:'image-route'});
 await assert.rejects(buildComponentNetwork({...f.recipe,snapshotSha256:parentHash,components},f.track,f.base),/duplicate paths/);
 const pit={elements:[{type:'way',id:1,version:2,nodes:[1,2,3,1],geometry:f.oldTrace.map(([lon,lat])=>({lon,lat})),tags:{raceway:'pit_lane'}}]},pitHash=await f.save('osm.json',pit),pitComponents=components.map(c=>({...c,snapshotSha256:pitHash})),pitParentHash=await f.save('network.json',{...f.parent,components:pitComponents});
 await f.save('layouts/old-route.json',{...f.old,snapshotSha256:pitHash});
 await assert.rejects(buildComponentNetwork({...f.recipe,snapshotSha256:pitParentHash,components:pitComponents},f.track,f.base),/pit lane/);
});
