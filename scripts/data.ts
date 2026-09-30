import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {validateTrack,validateLayout,indexSchema,type Layout} from '../schemas/data';
import {bounds,displayGate,length,trimLoop,intersects} from '../src/geo';
import {assemble,slice,type Way} from './route';
const args=process.argv.slice(2),check=args.includes('--check'),generate=args[0]==='generate';
const json=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
const outputs=new Map<string,string>();
for(const country of (await readdir('data',{withFileTypes:true})).filter(d=>d.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))){for(const folder of (await readdir(`data/${country.name}`,{withFileTypes:true})).filter(d=>d.isDirectory())){
 const dir=`data/${country.name}/${folder.name}`,track=validateTrack(await json(`${dir}/track.json`)),manifest=await json(`sources/${track.id}/import.json`),snapshot=await readFile(`sources/${track.id}/osm.json`,'utf8');
 const hash=createHash('sha256').update(snapshot).digest('hex');if(hash!==manifest.snapshotSha256)throw new Error(`${track.id}: snapshot hash mismatch`);
 const ways=JSON.parse(snapshot).elements.filter((e:any)=>e.type==='way') as Way[];
 await readFile(`sources/${track.id}/review.md`,'utf8');
 for(const layout of track.layouts){const recipe=await json(`sources/${track.id}/layouts/${layout.id}.json`);if(recipe.snapshotSha256!==hash)throw new Error(`${track.id}/${layout.id}: recipe hash mismatch`);if(recipe.trackId!==track.id||recipe.layoutId!==layout.id)throw new Error(`${track.id}/${layout.id}: recipe identity mismatch`);
 let coordinates=assemble(ways,recipe.segments,recipe.closed);const features:Layout['features']=[];const anchors=new Map();
 for(const g of recipe.gates){const segment=recipe.segments[g.anchorSegmentIndex],way=ways.find(w=>w.id===segment?.wayId);if(!way)throw new Error('Gate anchor: missing way');const part=slice(way,segment),a=part[g.anchorEdgeIndex]?.point,b=part[g.anchorEdgeIndex+1]?.point;if(!a||!b)throw new Error('Gate anchor: edge out of bounds');let endpoints;
 if(g.endpointMethod==='perpendicular-display'){const gate=displayGate(g.sourcePosition,a,b,g.displayWidthM);endpoints=gate.coordinates;const index=coordinates.findIndex((p,i)=>p[0]===a[0]&&p[1]===a[1]&&coordinates[i+1]?.[0]===b[0]&&coordinates[i+1]?.[1]===b[1]);anchors.set(g.role,{index,point:gate.point});}
 else {endpoints=g.endpoints;if(!intersects(a,b,endpoints[0],endpoints[1]))throw new Error('Gate endpoints do not cross anchor');}
 const {role,sourceIds,positionStatus,endpointMethod,positionNote}=g;features.push({type:'Feature',id:role,properties:{role,sourceIds,positionStatus,endpointMethod,positionNote},geometry:{type:'LineString',coordinates:endpoints}});}
 if(!recipe.closed&&anchors.has('start')&&anchors.has('finish'))coordinates=trimLoop(coordinates,anchors.get('start'),anchors.get('finish'));
 features.sort((a,b)=>['start_finish','start','finish'].indexOf(a.id)-['start_finish','start','finish'].indexOf(b.id));
 const timingStatus=!features.length?'missing':recipe.timingMode==='separate'&&features.length===1?'partial':features.every(f=>'positionStatus'in f.properties&&f.properties.positionStatus==='verified')?'verified':'estimated';
 features.unshift({type:'Feature',id:'trace',properties:{role:'trace',sourceIds:[recipe.sourceId]},geometry:{type:'LineString',coordinates}});
 const data=validateLayout({type:'FeatureCollection',bbox:bounds(features.flatMap(f=>f.geometry.coordinates)),metadata:{schemaVersion:1,trackId:track.id,layoutId:layout.id,license:'ODbL-1.0',attribution:'© OpenStreetMap contributors',closed:recipe.closed,geometryStatus:recipe.geometryStatus,timingStatus,timingMode:recipe.timingMode,lengthM:length(coordinates),reviewedAt:recipe.reviewedAt,notes:recipe.notes},features},track,layout.id);
 const path=`${dir}/${layout.file}`,bytes=JSON.stringify(data,null,2)+'\n';outputs.set(path,bytes);
 if(!generate)validateLayout(await json(path),track,layout.id);
 console.log(`${track.id}/${layout.id}: ${data.metadata.lengthM} m; ${data.metadata.geometryStatus}, timing ${data.metadata.timingStatus}`);
 }
}}
const tracks=[];for(const country of (await readdir('data',{withFileTypes:true})).filter(d=>d.isDirectory())){for(const folder of (await readdir(`data/${country.name}`,{withFileTypes:true})).filter(d=>d.isDirectory())){const track=validateTrack(await json(`data/${country.name}/${folder.name}/track.json`));const {id,name,aliases,country:countryData,locality,location}=track;tracks.push({id,name,aliases,country:countryData,...(locality?{locality}:{}),location,file:`${country.name}/${folder.name}/track.json`,layoutCount:track.layouts.length});}}
tracks.sort((a,b)=>a.id.localeCompare(b.id));const catalogue=indexSchema.parse({schemaVersion:1,tracks});if(new Set(tracks.map(t=>t.id)).size!==tracks.length)throw new Error('Duplicate venue IDs');outputs.set('data/index.json',JSON.stringify(catalogue,null,2)+'\n');
if(generate){for(const [path,bytes] of outputs){if(check){if(await readFile(path,'utf8')!==bytes)throw new Error(`${path}: stale generated file; run npm run generate:data`);}else{await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);}}}else{const existing=indexSchema.parse(await json('data/index.json'));if(JSON.stringify(existing)!==JSON.stringify(catalogue))throw new Error('data/index.json: stale catalogue');for(const [path,bytes] of outputs)if(await readFile(path,'utf8')!==bytes)throw new Error(`${path}: differs from recipe`);}
if(args.includes('--pilot-ready')){const errors=[];for(const [track,id] of [['at-salzburgring','grand-prix'],['fr-anneau-du-rhin','3-0-km'],['fr-anneau-du-rhin','3-7-km'],['de-nurburgring','grand-prix'],['de-nurburgring','nordschleife'],['de-nurburgring','nordschleife-btg']]){const output=[...outputs.values()].map(s=>JSON.parse(s)).find(d=>d.metadata?.trackId===track&&d.metadata?.layoutId===id);if(!output)errors.push(`${track}/${id}: required layout absent`);else{if(output.metadata.geometryStatus!=='reviewed')errors.push(`${track}/${id}: geometry is draft`);if(output.metadata.timingStatus!=='verified')errors.push(`${track}/${id}: reusable timing positions missing`);}}if(errors.length)throw new Error(`Pilot incomplete:\n${errors.join('\n')}`);}
