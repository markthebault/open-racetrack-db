import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readTimingArchive} from './reference-timing';
import {components,candidateLoops} from './candidates';
import {anchoredCourses} from './anchored-courses';
import {assemble,type Way} from './route';
import {nearestEdge,bounds,type Position} from '../src/geo';
import {worldCountries} from './world-countries';
const args=process.argv.slice(2),archive=args[args.indexOf('--archive')+1];if(!args.includes('--archive')||!archive)throw new Error('Use --archive /absolute/path/to/archive.zip');
const {records}=readTimingArchive(archive),read=async(p:string)=>JSON.parse(await readFile(p,'utf8')),save=async(p:string,x:unknown)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
const registry=await read('sources/reference/catalogue.json'),index=await read('data/index.json'),matches=await read('sources/reference/layout-matches.json');
const aliases:Record<string,string>={'Czech Republic':'CZ','Turkey':'TR','United Kingdom':'GB','Canary Islands':'ES','Isle Of Man':'IM','Russia':'RU','South Korea':'KR','Taiwan':'TW','Vietnam':'VN','United States':'US','United Arab Emirates':'AE'};
const eligible=(w:Way)=>w.tags?.area!=='yes'&&(w.tags?.highway==='raceway'||w.tags?.['disused:highway']==='raceway')&&w.tags?.service!=='pit_lane'&&w.tags?.raceway!=='pit_lane'&&!/pit[ _-]?(lane|road|entry|exit)|boxengasse|boxenausfahrt|sortie stands/i.test(w.tags?.name??'');
let added=0;const unresolved:any[]=[];
for(const name of new Set(records.map(r=>r.country))){
 const country=worldCountries.find(c=>c.code===aliases[name]||c.name.toLowerCase()===name.toLowerCase())!;
 let region='',raw:any,manifest:any;for(const candidate of ['europe','world']){try{const bytes=await readFile(`sources/${candidate}/${country.code.toLowerCase()}/osm.json`,'utf8');raw=JSON.parse(bytes);manifest=await read(`sources/${candidate}/${country.code.toLowerCase()}/import.json`);if(createHash('sha256').update(bytes).digest('hex')!==manifest.snapshotSha256)throw new Error('Country source hash mismatch');region=candidate;break;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}if(!region)continue;
 const groups=components(raw.elements.filter((e:any)=>e.type==='way'&&eligible(e)&&e.geometry?.every(Boolean))).map(ways=>({ways,box:bounds(ways.flatMap(w=>w.geometry.map(p=>[p.lon,p.lat] as Position)))}));
 const cache=new Map<number,ReturnType<typeof candidateLoops>>();
 for(const r of records.filter(r=>r.country===name&&r.gates.length===1&&r.nominalLengthM)){
  const registered=registry.records.find((x:any)=>x.referenceId===r.id);if(registered.geometryAvailable)continue;const p=r.gates[0].point;
  const nearby=groups.map((g,i)=>({g,i})).filter(({g})=>p[0]>g.box[0]-.005&&p[0]<g.box[2]+.005&&p[1]>g.box[1]-.005&&p[1]<g.box[3]+.005).filter(({g})=>g.ways.some(w=>nearestEdge(p,w.geometry.map(p=>[p.lon,p.lat] as Position)).displacementM<=30));
  const candidates:any[]=[];let incomplete=false;
  for(const {g,i} of nearby){let loops=cache.get(i);if(!loops){loops=candidateLoops(g.ways,400,40);cache.set(i,loops);}if(loops.truncated){const focused=anchoredCourses(g.ways,p,r.nominalLengthM!);if(focused.truncated){incomplete=true;continue;}for(const loop of focused.candidates)candidates.push({g,loop,delta:Math.abs(loop.lengthM-r.nominalLengthM!)});continue;}
   for(const loop of loops.loops){const delta=Math.abs(loop.lengthM-r.nominalLengthM!);const trace=assemble(g.ways,loop.segments,true);if(nearestEdge(p,trace).displacementM<=30)candidates.push({g,loop,delta,trace});}
  }
  candidates.sort((a,b)=>a.delta-b.delta);
  if(incomplete||!candidates.length||candidates[0].delta>Math.max(25,r.nominalLengthM!*.0075)||candidates.length>1&&candidates[1].delta-candidates[0].delta<Math.max(10,r.nominalLengthM!*.0025)){unresolved.push({recordId:r.id,candidates:candidates.length,reason:incomplete?'Focused course search remains incomplete':candidates.length?'Course distance does not distinguish the branches':'No complete source cycle meets timing and nominal-distance checks'});continue;}
  const {g,loop,delta}=candidates[0],entry=index.tracks.find((e:any)=>e.id===registered.trackId),path=`data/${entry.file}`,track=await read(path),layout=track.layouts.find((l:any)=>l.id===registered.layoutId);if(layout.file!==null)continue;
  const root=`sources/${track.id}`,file=`course-network-${g.ways[0].id}.json`,sourceId=`osm-network-${g.ways[0].id}`,bytes=JSON.stringify({attribution:'© OpenStreetMap contributors',osmBaseTimestamp:raw.osmBaseTimestamp,elements:g.ways},null,2)+'\n',hash=createHash('sha256').update(bytes).digest('hex');
  await mkdir(`${root}/layouts`,{recursive:true});await writeFile(`${root}/${file}`,bytes);
  let current:any;try{current=await read(`${root}/import.json`);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await writeFile(`${root}/osm.json`,bytes);current={schemaVersion:1,trackId:track.id,sourceId,snapshotSha256:hash,fetchedAt:manifest.fetchedAt,parentSnapshot:`${region}/${country.code.toLowerCase()}/osm.json`,parentSnapshotSha256:manifest.snapshotSha256,bbox:g.box};await writeFile(`${root}/review.md`,`# ${track.name}\n\nDraft layout association by timing location and nominal course distance. Geometry is exclusively independent OSM source-node paths. A close distance match does not establish visual review.\n`);}
  current.snapshots=(current.snapshots??[]).filter((s:any)=>s.file!==file);current.snapshots.push({file,sha256:hash,sourceId,parentSnapshot:`${region}/${country.code.toLowerCase()}/osm.json`,parentSnapshotSha256:manifest.snapshotSha256});await save(`${root}/import.json`,current);
  if(!track.sources.some((s:any)=>s.id===sourceId))track.sources.push({id:sourceId,type:'osm',title:'OpenStreetMap connected course network',url:`https://www.openstreetmap.org/way/${g.ways[0].id}`,license:'ODbL-1.0',retrievedAt:manifest.fetchedAt,evidenceNote:'Exact source-node geometry from the pinned country extract. Configuration is a draft match using a private timing position and nominal layout distance.'});if(!track.sourceIds.includes(sourceId))track.sourceIds.push(sourceId);
  if(!track.location)track.location=[(g.box[0]+g.box[2])/2,(g.box[1]+g.box[3])/2];
  const note=`Draft route hypothesis: the source cycle is the unique closest nominal-distance match within conservative timing and distance checks. Approximate OSM trace length ${loop.lengthM} m. Difference from the supplied layout distance ${delta.toFixed(1)} m. Course configuration still requires visual review.`;
  await save(`${root}/layouts/${layout.id}.json`,{schemaVersion:1,trackId:track.id,layoutId:layout.id,sourceId,snapshotFile:file,snapshotSha256:hash,closed:true,timingMode:'shared',geometryStatus:'draft',reviewedAt:null,notes:[note],segments:loop.segments,gates:[]});layout.file=`layouts/${layout.id}.geojson`;layout.description=note;delete layout.missingGeometryReason;await save(path,track);registered.geometryAvailable=true;matches[`${track.id}/${layout.id}`]={recordId:r.id,name:r.name,evidence:note};added++;
 }
 console.log(`${country.code}: nominal-distance course candidates checked`);
}
await save('sources/reference/layout-matches.json',matches);await save('sources/reference/catalogue.json',registry);await save('.local/course-distance-research.json',unresolved);console.log({added,unresolved:unresolved.length});
