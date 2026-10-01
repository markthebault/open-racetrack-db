import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readTimingArchive} from './reference-timing';
import {assemble,type Way} from './route';
import {bounds,length} from '../src/geo';
import {validateSelectionTiming} from './selection-timing';

const args=process.argv.slice(2),archive=args[args.indexOf('--archive')+1];
if(!args.includes('--archive')||!archive)throw new Error('Use --archive /absolute/path/to/archive.zip');
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const save=async(p:string,x:unknown)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
const {records}=readTimingArchive(archive),registry=await read('sources/reference/catalogue.json');
const index=await read('data/index.json'),matches=await read('sources/reference/layout-matches.json');
const selections=(await read('sources/reference/course-selections.json')).records;
let added=0;
for(const selection of selections){
 const registration=registry.records.find((r:any)=>r.referenceId===selection.referenceId);
 const record=records.find(r=>r.id===selection.referenceId);
 if(!registration||!record)throw new Error('Selected configuration is not registered');
 const entry=index.tracks.find((e:any)=>e.id===registration.trackId),path=`data/${entry.file}`,track=await read(path);
 const layout=track.layouts.find((l:any)=>l.id===registration.layoutId),root=`sources/${track.id}`;
 const cache=selection.sourcePath??`.local/relations/${selection.relationId}.json`,raw=await read(cache);
 if(selection.sourcePath){
  if(!/^sources\/(?:(europe|world)\/[a-z]{2}|course-networks\/[a-z0-9]+(?:-[a-z0-9]+)*)\/osm\.json$/.test(cache))throw new Error('Unsupported independent source');
  const parent=await read(cache.replace('osm.json','import.json'));
  if(createHash('sha256').update(await readFile(cache)).digest('hex')!==parent.snapshotSha256)throw new Error('Independent country snapshot hash mismatch');
 }
 const nodes=new Map<number,any>(raw.elements.filter((e:any)=>e.type==='node').map((e:any)=>[e.id,e]));
 const relation=raw.elements.find((e:any)=>e.type==='relation'&&e.id===selection.relationId);
 if(!selection.sourcePath&&!relation)throw new Error('Selected independent relation is absent');
 const memberIds=new Set(selection.sourceWayIds??relation.members.filter((m:any)=>m.type==='way').map((m:any)=>m.ref));
 const ways:Way[]=raw.elements.filter((e:any)=>e.type==='way'&&memberIds.has(e.id)).map((w:any)=>({type:'way',id:w.id,version:w.version,tags:w.tags,nodes:w.nodes,geometry:w.geometry??w.nodes.map((n:number)=>{
  const node=nodes.get(n);if(!node)throw new Error('Missing independent source node');return {lon:node.lon,lat:node.lat};
 })}));
 const trace=assemble(ways,selection.segments,selection.closed),measured=length(trace);
 if(selection.segments.some((s:any)=>{
  const tags=ways.find(w=>w.id===s.wayId)!.tags??{};
  return tags.area==='yes'||/^pit[_ -]?lane$/i.test(tags.service??'')||/^pit[_ -]?lane$/i.test(tags.raceway??'')||/^boxes$|pit[ /_-]?(lane|road|entry|exit)/i.test(tags.name??'');
 }))throw new Error('Selected course includes an area or pit/service lane');
 if(Math.abs(measured-selection.expectedLengthM)>.15)throw new Error('Selected independent trace changed');
 const timingMode=validateSelectionTiming(record,trace,selection.closed);
 if(record.nominalLengthM&&Math.abs(measured-record.nominalLengthM)>selection.maximumDistanceDifferenceM)throw new Error('Selected course exceeds documented distance allowance');
 const identity=selection.relationId??Math.min(...selection.sourceWayIds);
 const url=selection.relationId?`https://www.openstreetmap.org/relation/${selection.relationId}`:`https://www.openstreetmap.org/way/${identity}`;
 const networkKey=selection.sourcePath?.match(/^sources\/course-networks\/([a-z0-9-]+)\/osm\.json$/)?.[1];
 const file=`selected-${networkKey??(selection.relationId?'circuit':'network')}-${identity}.json`,sourceId=`osm-selection-${networkKey?networkKey+'-':''}${identity}`;
 const fetchedAt=(await stat(cache)).mtime.toISOString();
 let bytes=JSON.stringify({attribution:'© OpenStreetMap contributors',retrievedAt:fetchedAt,elements:ways,...(relation?{relation:{id:relation.id,version:relation.version,tags:relation.tags,members:relation.members}}:{parentSnapshot:selection.sourcePath})},null,2)+'\n';
 await mkdir(`${root}/layouts`,{recursive:true});
 try{bytes=await readFile(`${root}/${file}`,'utf8');assemble(JSON.parse(bytes).elements,selection.segments,selection.closed);}catch(e){
  if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await writeFile(`${root}/${file}`,bytes);
 }
 const hash=createHash('sha256').update(bytes).digest('hex');
 let manifest:any;
 try{manifest=await read(`${root}/import.json`);}catch(e){
  if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
  await writeFile(`${root}/osm.json`,bytes);
  manifest={schemaVersion:1,trackId:track.id,sourceId,snapshotSha256:hash,fetchedAt,endpoint:url,bbox:bounds(trace)};
  await writeFile(`${root}/review.md`,`# ${track.name}\n\nCourse configurations use explicitly identified branches from an independent circuit relation. Coordinates and joins remain exact source nodes. Travel direction and historical alignment require review.\n`);
 }
 manifest.snapshots??=[];const snapshotIndex=manifest.snapshots.findIndex((s:any)=>s.file===file),snapshotEntry={file,sha256:hash,sourceId,url,retrievedAt:fetchedAt};
 if(snapshotIndex<0)manifest.snapshots.push(snapshotEntry);else manifest.snapshots[snapshotIndex]=snapshotEntry;
 await save(`${root}/import.json`,manifest);
 const note=`Draft configuration: ${selection.evidence} Branch identity was checked against catalogue layout facts and circuit identification references. Independent source distance ${measured.toFixed(1)} m; no coordinates are changed to match a diagram or distance. Travel direction and historical alignment remain provisional.`;
 if(!track.sourceIds.includes(sourceId))track.sourceIds.push(sourceId);
 track.sources=track.sources.filter((s:any)=>!/^selection-identity-[0-9]+$/.test(s.id));
 for(const source of [{id:sourceId,type:'osm',title:'OpenStreetMap explicitly selected circuit branches',url,license:'ODbL-1.0',retrievedAt:fetchedAt,evidenceNote:'Exact independent source ways and node joins; configuration choices are recorded in the course-selection manifest.'},{id:`selection-identity-${layout.id}`,type:'reference',title:'Configuration identification reference',url:selection.identificationUrl,license:'reference-only',retrievedAt:fetchedAt,evidenceNote:'Supports circuit identification only. Catalogue layout facts identify historical branch choices. No diagram coordinates are extracted, traced or copied.'}]){
  const existing=track.sources.findIndex((s:any)=>s.id===source.id);
  if(existing<0)track.sources.push(source);else track.sources[existing]=source;
 }
 if(!track.location){const b=bounds(trace);track.location=[(b[0]+b[2])/2,(b[1]+b[3])/2];}
 await save(`${root}/layouts/${layout.id}.json`,{schemaVersion:1,trackId:track.id,layoutId:layout.id,sourceId,snapshotFile:file,snapshotSha256:hash,closed:selection.closed,timingMode,geometryStatus:'draft',reviewedAt:null,notes:[note],segments:selection.segments,gates:[]});
 if(!registration.geometryAvailable)added++;
 layout.file=`layouts/${layout.id}.geojson`;layout.description=note;delete layout.missingGeometryReason;
 registration.geometryAvailable=true;matches[`${track.id}/${layout.id}`]={recordId:record.id,name:record.name,evidence:note};
 await save(path,track);
 console.log(record.name,measured.toFixed(1));
}
await save('sources/reference/catalogue.json',registry);await save('sources/reference/layout-matches.json',matches);
console.log({added});
