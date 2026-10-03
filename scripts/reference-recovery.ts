import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {worldCountries} from './world-countries';
import {readTimingArchive} from './reference-timing';
import {components,candidateLoops} from './candidates';
import {normalizeLayoutName} from './layout-matching';
import {assemble,type Way} from './route';
import {nearestEdge,bounds,type Position} from '../src/geo';
const args=process.argv.slice(2),archive=args[args.indexOf('--archive')+1];if(!args.includes('--archive')||!archive)throw new Error('Use --archive /absolute/path/to/archive.zip');
const {records}=readTimingArchive(archive),read=async(p:string)=>JSON.parse(await readFile(p,'utf8')),save=async(p:string,v:unknown)=>writeFile(p,JSON.stringify(v,null,2)+'\n');
const aliases:Record<string,string>={'Czech Republic':'CZ','Turkey':'TR','United Kingdom':'GB','Canary Islands':'ES','Isle Of Man':'IM','Russia':'RU','South Korea':'KR','Taiwan':'TW','Vietnam':'VN','United States':'US','United Arab Emirates':'AE'};
const code=(name:string)=>aliases[name]??worldCountries.find(c=>c.name.toLowerCase()===name.toLowerCase())?.code;
const slug=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
// Historical courses and every reference category are eligible; service lanes and area representations are not traces.
export function eligible(w:Way){const t=w.tags??{},name=[t.name,t['name:en'],t.description].filter(Boolean).join(' ');return t.area!=='yes'&&(t.highway==='raceway'||t['disused:highway']==='raceway')&&!/^pit[_ -]?lane$/i.test(t.service??'')&&!/^pit[_ -]?lane$/i.test(t.raceway??'')&&!/pit[ _-]?(lane|road|entry|exit)|boxengasse|boxenausfahrt|sortie stands|^paddock$/i.test(name);}
const index=await read('data/index.json'),matches:Record<string,{recordId:string;name:string;evidence:string}>=await read('sources/reference/layout-matches.json');
const mapped=new Set(Object.values(matches).map(m=>m.recordId));
// This acquisition helper predates registered entries without geometry. Refuse an unsafe mutation.
for(const entry of index.tracks){const track=await read(`data/${entry.file}`);if(track.layouts.some((l:any)=>l.file===null))throw new Error('Registered catalogue detected. Use recover:variants to upgrade unavailable layouts in place.');}
const explicit=await import('./layout-records');for(const [key,name] of Object.entries(explicit.layoutRecords)){const t=index.tracks.find((t:any)=>t.id===key.split('/')[0]);if(t){const r=records.find(r=>r.name===name&&code(r.country)===t.country.code);if(r)mapped.add(r.id);}}
const owners=new Map<number,Set<string>>();for(const entry of index.tracks){if(entry.traceCount===0)continue;const snapshot=await read(`sources/${entry.id}/osm.json`);for(const w of snapshot.elements.filter((e:any)=>e.type==='way')){const ids=owners.get(w.id)??new Set();ids.add(entry.id);owners.set(w.id,ids);}}
const research:any[]=[];let added=0,associated=0,venuesAdded=0;
for(const countryCode of new Set(records.map(r=>code(r.country)))){
 const country=worldCountries.find(c=>c.code===countryCode);if(!country)throw new Error(`Unknown reference country ${countryCode}`);
 const expected=records.filter(r=>code(r.country)===country.code);let raw:any,manifest:any,region='';
 for(const candidate of ['europe','world']){try{const path=`sources/${candidate}/${country.code.toLowerCase()}/osm.json`,bytes=await readFile(path,'utf8');raw=JSON.parse(bytes);manifest=await read(`sources/${candidate}/${country.code.toLowerCase()}/import.json`);if(createHash('sha256').update(bytes).digest('hex')!==manifest.snapshotSha256)throw new Error('Country snapshot hash mismatch');region=candidate;break;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
 if(!region){for(const r of expected.filter(r=>!mapped.has(r.id)))research.push({recordId:r.id,reason:'Country source extract unavailable'});continue;}
 const ways=raw.elements.filter((e:any)=>e.type==='way'&&eligible(e)&&e.geometry?.every(Boolean)) as Way[];
 const groups=components(ways).map(group=>{const points=group.flatMap(w=>w.geometry.map(p=>[p.lon,p.lat] as Position)),box=bounds(points);return {ways:group,box,center:[(box[0]+box[2])/2,(box[1]+box[3])/2] as Position};});
 const loopCache=new Map<number,ReturnType<typeof candidateLoops>>();
 const near=new Map<string,{i:number;displacement:number}[]>();
 for(const r of expected){const p=r.gates[0].point;const candidates=groups.map((g,i)=>({g,i})).filter(({g})=>p[0]>g.box[0]-.01&&p[0]<g.box[2]+.01&&p[1]>g.box[1]-.01&&p[1]<g.box[3]+.01).map(({g,i})=>({i,displacement:Math.min(...g.ways.map(w=>nearestEdge(p,w.geometry.map(p=>[p.lon,p.lat] as Position)).displacementM))})).filter(c=>c.displacement<=50).sort((a,b)=>a.displacement-b.displacement);near.set(r.id,candidates);}
 for(const r of expected.filter(r=>!mapped.has(r.id))){
  const candidates=near.get(r.id)!;if(candidates.length!==1){research.push({recordId:r.id,reason:candidates.length?'Multiple nearby independent source graphs require venue identification':'No eligible source graph near the timing location'});continue;}
  const group=groups[candidates[0].i],nearRecords=expected.filter(other=>near.get(other.id)?.some(c=>c.i===candidates[0].i));
  const name=normalizeLayoutName(r.name),named=group.ways.filter(w=>[w.tags?.name,w.tags?.['name:en']].some(n=>n&&normalizeLayoutName(n)===name));
  let result=named.length?candidateLoops(named,400,40):undefined,proof='Unique course from independently named source ways.';
  if(!result?.loops.length){
   if(nearRecords.length===1&&r.gates.length===1){result=loopCache.get(candidates[0].i);if(!result){result=candidateLoops(group.ways,400,40);loopCache.set(candidates[0].i,result);}proof='Single reference course at a unique connected OSM source cycle, with private timing proximity.';}
  }
  if(!result||result.truncated||result.loops.length!==1||r.gates.length!==1){research.push({recordId:r.id,reason:r.gates.length!==1?'Open course needs an independently identified path':result?.truncated?'Source graph enumeration truncated':result?.loops.length?'Multiple source cycles require configuration identification':'No uniquely identified source cycle',courseCandidates:result?.loops.length??0,wayIds:group.ways.map(w=>w.id)});continue;}
  const loop=result.loops[0],trace=assemble(group.ways,loop.segments,true);if(nearestEdge(r.gates[0].point,trace).displacementM>30){research.push({recordId:r.id,reason:'Timing point exceeds conservative course-association distance'});continue;}
  const ids=new Set(group.ways.flatMap(w=>[...(owners.get(w.id)??[])]));let entry=ids.size===1?index.tracks.find((t:any)=>t.id===[...ids][0]):undefined;
  if(ids.size>1){research.push({recordId:r.id,reason:'Source graph crosses existing venue subsets; independent association required'});continue;}
  let track:any,path:string,id:string;
  const note=proof+' Draft geometry; course identity and operating status require review. Timing coordinates remain private.';
  if(entry){id=entry.id;path=`data/${entry.file}`;track=await read(path);
   // Extend the pinned subset with independently sourced ways. Existing geometry must keep its exact source versions.
   const sdir=`sources/${id}`,old=await read(`${sdir}/osm.json`),selected=new Map(old.elements.map((e:any)=>[`${e.type}/${e.id}`,e]));
   for(const w of group.ways){const previous:any=selected.get(`way/${w.id}`);if(previous&&JSON.stringify(previous)!==JSON.stringify(w))throw new Error(`${id}: conflicting parent way version ${w.id}`);selected.set(`way/${w.id}`,w);}
   const bytes=JSON.stringify({...old,elements:[...selected.values()]},null,2)+'\n',hash=createHash('sha256').update(bytes).digest('hex');await writeFile(`${sdir}/osm.json`,bytes);const oldManifest=await read(`${sdir}/import.json`);oldManifest.snapshotSha256=hash;oldManifest.selectionWayIds=[...selected.values()].filter((e:any)=>e.type==='way').map((e:any)=>e.id);await save(`${sdir}/import.json`,oldManifest);
   for(const l of track.layouts){if(l.file===null)continue;const recipe=await read(`${sdir}/layouts/${l.id}.json`);if(recipe.snapshotFile&&recipe.snapshotFile!=='osm.json')continue;recipe.snapshotSha256=hash;await save(`${sdir}/layouts/${l.id}.json`,recipe);}
  }else{id=`${country.code.toLowerCase()}-${slug(r.name)}-reference`;path=`data/${country.slug}/${slug(r.name)}-reference/track.json`;track={schemaVersion:1,id,name:r.name,aliases:[],country,location:group.center,sourceIds:['osm-snapshot'],defaultLayoutId:'main',layouts:[],sources:[{id:'osm-snapshot',type:'osm',title:'OpenStreetMap course geometry',url:`https://www.openstreetmap.org/way/${loop.segments[0].wayId}`,license:'ODbL-1.0',retrievedAt:manifest.fetchedAt,evidenceNote:proof}]};
   await mkdir(`sources/${id}/layouts`,{recursive:true});await mkdir(path.replace(/track.json$/,'layouts'),{recursive:true});const bytes=JSON.stringify({attribution:raw.attribution,osmBaseTimestamp:raw.osmBaseTimestamp,elements:group.ways},null,2)+'\n',hash=createHash('sha256').update(bytes).digest('hex');await writeFile(`sources/${id}/osm.json`,bytes);await writeFile(`sources/${id}/query.overpass`,await readFile(`sources/${region}/${country.code.toLowerCase()}/query.overpass`,'utf8'));await save(`sources/${id}/import.json`,{schemaVersion:1,trackId:id,sourceId:'osm-snapshot',snapshotSha256:hash,bbox:group.box,fetchedAt:manifest.fetchedAt,osmBaseTimestamp:raw.osmBaseTimestamp,endpoint:manifest.endpoint,parentSnapshot:`${region}/${country.code.toLowerCase()}/osm.json`,parentSnapshotSha256:manifest.snapshotSha256,selectionWayIds:group.ways.map(w=>w.id)});await writeFile(`sources/${id}/review.md`,`# ${r.name}\n\n${note}\n\nIndependent source graph: ${group.ways.map(w=>w.id).join(', ')}. No private course geometry was read.\n`);entry={id,file:path.slice(5),country};index.tracks.push(entry);venuesAdded++;
  }
  const sdir=`sources/${id}`,source=await read(`${sdir}/import.json`);
  // Reuse an existing exact physical route instead of inflating the count with duplicate shapes.
  const edgeKey=(points:Position[])=>points.slice(1).map((p,i)=>[points[i].join(','),p.join(',')].sort().join(':')).sort().join('|');let existing:any;
  for(const l of track.layouts){if(l.file===null)continue;const recipe=await read(`${sdir}/layouts/${l.id}.json`),snapshot=await read(`${sdir}/${recipe.snapshotFile??'osm.json'}`);if(edgeKey(assemble(snapshot.elements.filter((e:any)=>e.type==='way'),recipe.segments,recipe.closed))===edgeKey(trace)){existing=l;break;}}
  const layoutId=existing?.id??(track.layouts.length?slug(r.name):'main');
  if(!existing){await save(`${sdir}/layouts/${layoutId}.json`,{schemaVersion:1,trackId:id,layoutId,sourceId:'osm-snapshot',snapshotSha256:source.snapshotSha256,closed:true,timingMode:'shared',geometryStatus:'draft',reviewedAt:null,notes:[note,...(loop.directionKnown?[]:['Travel direction is provisional.'])],segments:loop.segments,gates:[]});track.layouts.push({id:layoutId,name:r.name,file:`layouts/${layoutId}.geojson`,description:note});added++;}else{existing.name=r.name;existing.description=note;associated++;}
  await save(path,track);matches[`${id}/${layoutId}`]={recordId:r.id,name:r.name,evidence:proof+' Private timing displacement <=30 m.'};mapped.add(r.id);for(const w of group.ways){const owner=owners.get(w.id)??new Set();owner.add(id);owners.set(w.id,owner);}
 }
 console.log(`${country.code}: source recovery checked ${expected.length} entries`);
}
await save('sources/reference/layout-matches.json',matches);await mkdir('.local',{recursive:true});await save('.local/reference-recovery.json',research);console.log({added,associated,venuesAdded,remaining:research.length});
