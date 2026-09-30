import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {venues} from './venues';
const args=process.argv.slice(2), id=args[args.indexOf('--track')+1];
const venue=venues.find(v=>v.id===id);
if(!venue) throw new Error('Use --track with a known venue ID in scripts/venues.ts');
const directory=`sources/${id}`,refresh=args.includes('--refresh');
try {
 const manifest=JSON.parse(await readFile(`${directory}/import.json`,'utf8'));
 const snapshot=await readFile(`${directory}/osm.json`,'utf8');
 if(createHash('sha256').update(snapshot).digest('hex')!==manifest.snapshotSha256) throw new Error('Snapshot hash mismatch');
 if(!refresh){console.log(`Reused ${id}: ${manifest.snapshotSha256}`);process.exit(0);}
} catch(e) {if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const [w,s,e,n]=venue.bbox;
const query=`[out:json][timeout:25][maxsize:33554432];(way["highway"="raceway"](${s},${w},${n},${e});node["raceway"~"^(start|finish|start-finish)$"](${s},${w},${n},${e}););out meta geom;\n`;
const endpoint=process.env.OVERPASS_ENDPOINT??'https://overpass-api.de/api/interpreter';
let raw:any;
for(let attempt=0;attempt<3;attempt++){
 try{
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'OpenRacetrackDB/0.1.0 (maintainer source import)'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(90000)});
  if(!response.ok){
   if([406,429,502,503,504].includes(response.status)&&attempt<2){const retry=response.headers.get('retry-after');const requested=retry?(Number(retry)||Math.max(0,(Date.parse(retry)-Date.now())/1000)):0;const seconds=Math.max([406,429].includes(response.status)?30:5,requested);console.log(`Overpass HTTP ${response.status}; retrying in ${Math.ceil(seconds)} s`);await new Promise(r=>setTimeout(r,seconds*1000));continue;}
   throw new Error(`Overpass HTTP ${response.status}`);
  }
  raw=await response.json();if(raw.remark||!raw.elements?.length)throw new Error(`Overpass: ${raw.remark??'empty result'}`);break;
 }catch(e){if(attempt===2)throw e;}
}
const clean={attribution:'© OpenStreetMap contributors',osmBaseTimestamp:raw.osm3s.timestamp_osm_base,elements:raw.elements.map((item:any)=>Object.fromEntries(['type','id','version','timestamp','tags','nodes','geometry','lat','lon'].filter(k=>item[k]!==undefined).map(k=>[k,item[k]]))).sort((a:any,b:any)=>a.type.localeCompare(b.type)||a.id-b.id)};
const bytes=JSON.stringify(clean,null,2)+'\n';
const target=refresh?`sources-staging/${id}`:directory;
await mkdir(target,{recursive:true});
await writeFile(`${target}/osm.json`,bytes);await writeFile(`${target}/query.overpass`,query);
await writeFile(`${target}/import.json`,JSON.stringify({schemaVersion:1,trackId:id,sourceId:'osm-snapshot',endpoint,bbox:venue.bbox,fetchedAt:new Date().toISOString(),osmBaseTimestamp:clean.osmBaseTimestamp,snapshotFile:'osm.json',snapshotSha256:createHash('sha256').update(bytes).digest('hex'),queryFile:'query.overpass'},null,2)+'\n');
console.log(`${refresh?'Staged':'Fetched'} ${id}: ${clean.elements.length} elements in ${target}`);
