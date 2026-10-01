import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const directory='sources/course-relations';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(!process.argv.includes('--refresh')){
 try{
  const [snapshot,manifest]=await Promise.all([readFile(`${directory}/osm.json`),readFile(`${directory}/import.json`,'utf8')]);
  if(sha(snapshot)!==JSON.parse(manifest).snapshotSha256)throw new Error('Circuit relation snapshot hash mismatch');
  console.log('Using pinned independent circuit relations');process.exit(0);
 }catch(error){if(error.code!=='ENOENT')throw error;}
}
const query='[out:json][timeout:90][maxsize:67108864];(relation["type"="circuit"];relation["route"~"^(raceway|racing|motorcar|motorcycle)$"];);out meta geom;';
const endpoint=process.env.OVERPASS_ENDPOINT??'https://overpass-api.de/api/interpreter';
let raw;
for(let attempt=0;attempt<3;attempt++){
 try{
  const response=await globalThis.fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'OpenRacetrackDB circuit geometry research'},body:new globalThis.URLSearchParams({data:query}),signal:globalThis.AbortSignal.timeout(120000)});
  if(!response.ok){
   if(attempt===2)throw new Error(`HTTP ${response.status}`);
   const header=response.headers.get('retry-after'),numeric=Number(header),requested=header?(Number.isFinite(numeric)?numeric:(Date.parse(header)-Date.now())/1000):0;
   const seconds=Math.max([406,429].includes(response.status)?30:5,Number.isFinite(requested)?requested:0);
   console.log(`HTTP ${response.status}; retry after ${seconds} seconds`);await delay(seconds*1000);continue;
  }
  raw=await response.json();if(raw.remark||!Array.isArray(raw.elements)||!raw.osm3s?.timestamp_osm_base)throw new Error(raw.remark??'Invalid circuit response');break;
 }catch(error){if(attempt===2)throw error;console.log(`Attempt ${attempt+1}: ${String(error)}`);await delay(5000);}
}
const keep=['type','id','version','timestamp','tags','nodes','geometry','members','bounds','center','lat','lon'];
const elements=raw.elements.map(element=>Object.fromEntries(keep.filter(key=>element[key]!==undefined).map(key=>[key,element[key]])));
const bytes=JSON.stringify({attribution:'© OpenStreetMap contributors',osmBaseTimestamp:raw.osm3s.timestamp_osm_base,elements},null,2)+'\n';
await mkdir(directory,{recursive:true});
await writeFile(`${directory}/osm.json`,bytes);await writeFile(`${directory}/query.overpass`,query+'\n');
await writeFile(`${directory}/import.json`,JSON.stringify({schemaVersion:1,endpoint,fetchedAt:new Date().toISOString(),snapshotSha256:sha(bytes),elementCount:elements.length},null,2)+'\n');
console.log('Independent named circuit relations',elements.length);
