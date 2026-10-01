import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {readTimingArchive} from './reference-timing';import {worldCountries} from './world-countries';
import {components,candidateLoops} from './candidates';import {anchoredCourses} from './anchored-courses';import {assemble,type Way} from './route';import {bounds,nearestEdge,type Position} from '../src/geo';
const args=process.argv.slice(2),archive=args[args.indexOf('--archive')+1];if(!args.includes('--archive')||!archive)throw new Error('Use --archive /absolute/path/to/archive.zip');
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8')),registry=await read('sources/reference/catalogue.json'),{records,xmlSha256}=readTimingArchive(archive);
const aliases:Record<string,string>={'Czech Republic':'CZ','Turkey':'TR','United Kingdom':'GB','Canary Islands':'ES','Isle Of Man':'IM','Russia':'RU','South Korea':'KR','Taiwan':'TW','Vietnam':'VN','United States':'US','United Arab Emirates':'AE'};
const rows:any[]=[],proposals:any[]=[];
for(const countryName of new Set(records.map(r=>r.country))){
 const country=worldCountries.find(c=>c.code===aliases[countryName]||c.name.toLowerCase()===countryName.toLowerCase());if(!country)throw new Error('Unknown reference country');
 let sourcePath='',raw:any;
 for(const region of ['europe','world']){try{const path=`sources/${region}/${country.code.toLowerCase()}/osm.json`,bytes=await readFile(path,'utf8'),manifest=await read(path.replace('osm.json','import.json'));if(createHash('sha256').update(bytes).digest('hex')!==manifest.snapshotSha256)throw new Error('Research country source hash mismatch');sourcePath=path;raw=JSON.parse(bytes);break;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
 const groups=raw?components(raw.elements.filter((w:any)=>w.type==='way'&&w.tags?.area!=='yes'&&(w.tags?.highway==='raceway'||w.tags?.['disused:highway']==='raceway')&&!/^pit[_ -]?lane$/i.test(w.tags?.service??'')&&!/^pit[_ -]?lane$/i.test(w.tags?.raceway??'')&&!/pit[ _-]?(lane|road|entry|exit)|boxengasse|boxenausfahrt/i.test(w.tags?.name??'')&&w.geometry?.every(Boolean))).map(ways=>({ways,box:bounds(ways.flatMap(w=>w.geometry.map(p=>[p.lon,p.lat] as Position)))})):[];
 const cached=new Map<number,ReturnType<typeof candidateLoops>>();
 for(const record of records.filter(r=>r.country===countryName&&!registry.records.find((x:any)=>x.referenceId===r.id).geometryAvailable)){
  const registration=registry.records.find((x:any)=>x.referenceId===record.id),row:any={referenceId:record.id,trackId:registration.trackId,layoutId:registration.layoutId,sourcePath:sourcePath||null};rows.push(row);
  if(!record.nominalLengthM){row.reason='configuration-evidence-required';row.nextStep='Identify what the aggregate catalogue entry represents and independently source its constituent configurations.';continue;}
  if(record.gates.length===2){row.reason='open-course-evidence-required';row.nextStep='Identify the independent open route and its source-node endpoints; do not substitute a closed venue loop.';continue;}
  const p=record.gates[0].point,nearby=groups.map((g,i)=>({g,i})).filter(({g})=>p[0]>=g.box[0]-.005&&p[0]<=g.box[2]+.005&&p[1]>=g.box[1]-.005&&p[1]<=g.box[3]+.005&&g.ways.some(w=>nearestEdge(p,w.geometry.map(p=>[p.lon,p.lat] as Position)).displacementM<=30));
  row.sourceWayIds=[...new Set(nearby.flatMap(({g})=>g.ways.map(w=>w.id)))];
  if(!nearby.length){row.reason='independent-geometry-missing';row.nextStep='Acquire an independently licensed course trace or complete missing public-road mapping.';continue;}
  const candidates:any[]=[];let incomplete=false;
  for(const {g,i} of nearby){let found=cached.get(i);if(!found){found=candidateLoops(g.ways,400,40);cached.set(i,found);}if(found.truncated){const focused=anchoredCourses(g.ways,p,record.nominalLengthM,{maximumSteps:500000});if(focused.truncated)incomplete=true;for(const candidate of focused.candidates)candidates.push({...candidate,ways:g.ways});}else for(const candidate of found.loops){if(nearestEdge(p,assemble(g.ways,candidate.segments,true)).displacementM<=30)candidates.push({...candidate,ways:g.ways});}}
  candidates.sort((a,b)=>Math.abs(a.lengthM-record.nominalLengthM!)-Math.abs(b.lengthM-record.nominalLengthM!));row.candidateCount=candidates.length;
  if(candidates[0])row.closestSourceLengthM=candidates[0].lengthM;
  if(incomplete){row.reason='search-incomplete';row.nextStep='Constrain route branches using independent layout evidence before continuing bounded search.';}
  else if(!candidates.length){row.reason='source-connectivity-incomplete';row.nextStep='Find the missing independently mapped connectors or independently licensed trace; never bridge nearby coordinates.';}
  else if(Math.abs(candidates[0].lengthM-record.nominalLengthM)>Math.max(25,record.nominalLengthM*.0075)){row.reason='course-distance-discrepancy';row.nextStep='Use independent layout documents to identify the intended route and explain the distance discrepancy.';}
  else if(candidates.length>1&&Math.abs(candidates[1].lengthM-record.nominalLengthM)-Math.abs(candidates[0].lengthM-record.nominalLengthM)<Math.max(10,record.nominalLengthM*.0025)){row.reason='ambiguous-source-branches';row.nextStep='Identify the exact branch sequence using independent layout documents, not just course distance.';}
  else{row.reason='candidate-awaiting-association';row.nextStep='Check the independently connected route hypothesis before registering it as a draft.';proposals.push({referenceId:record.id,sourcePath,wayIds:candidates[0].ways.map((w:Way)=>w.id),candidate:{segments:candidates[0].segments,lengthM:candidates[0].lengthM}});}
 }
 console.log(`${country.code}: remaining routes classified`);
}
const currentRegistry=await read('sources/reference/catalogue.json'),pendingRows=rows.filter(row=>!currentRegistry.records.find((r:any)=>r.referenceId===row.referenceId).geometryAvailable);
const counts:Record<string,number>={};for(const row of pendingRows)counts[row.reason]=(counts[row.reason]??0)+1;
await writeFile('data/layout-gap-research.json',JSON.stringify({schemaVersion:1,xmlSha256,policy:'These are source limitations and unresolved route associations, not completed layouts. No private timing coordinates or archive geometry are included.',summary:counts,records:pendingRows},null,2)+'\n');
await writeFile('.local/course-gap-proposals.json',JSON.stringify(proposals,null,2)+'\n');console.log(counts);
