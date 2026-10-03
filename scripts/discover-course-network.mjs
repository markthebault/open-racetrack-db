import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1];
const slug=value('--slug'),box=value('--bbox'),date=args.includes('--date')?value('--date'):null;
if(!args.includes('--slug')||!args.includes('--bbox')||!slug||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new Error('Use --slug circuit-date --bbox south,west,north,east [--date YYYY-MM-DDT00:00:00Z] [--airfields] [--track-lines]');
const bbox=box.split(',').map(Number);
if(bbox.length!==4||bbox.some(v=>!Number.isFinite(v))||bbox[0]>=bbox[2]||bbox[1]>=bbox[3]||bbox[0]<-90||bbox[2]>90||bbox[1]<-180||bbox[3]>180||(bbox[2]-bbox[0])*(bbox[3]-bbox[1])>.04)throw new Error('Invalid or excessive venue bounds');
if(date&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(date))throw new Error('Invalid historical date');
const racewaysOnly=args.includes('--raceways-only'),airfields=args.includes('--airfields'),trackLines=args.includes('--track-lines'),directory=`sources/course-networks/${slug}`,sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(racewaysOnly&&(airfields||trackLines))throw new Error('Additional course-feature research requires the full road network');
try{const bytes=await readFile(`${directory}/osm.json`),manifest=JSON.parse(await readFile(`${directory}/import.json`,'utf8'));if(sha(bytes)!==manifest.snapshotSha256||JSON.stringify(bbox)!==JSON.stringify(manifest.bbox)||date!==manifest.historicalDate||racewaysOnly!==(manifest.racewaysOnly??false)||airfields!==(manifest.airfields??false)||trackLines!==(manifest.trackLines??false))throw new Error('Pinned source differs from request');console.log(slug,'using pinned snapshot');process.exit(0);}catch(error){if(error.code!=='ENOENT')throw error;}
const endpoint=process.env.OVERPASS_ENDPOINT??'https://overpass-api.de/api/interpreter';
const query=`[out:json][timeout:90][maxsize:33554432]${date?`[date:"${date}"]`:''};(way["highway"${racewaysOnly?'="raceway"':''}](${box});way["disused:highway"="raceway"](${box});${airfields?`way["aeroway"~"^(runway|taxiway)$"]["area"!="yes"](${box});`:''}${trackLines?`way["leisure"="track"]["area"!="yes"](${box});`:''});out meta geom;`;
let raw;
for(let attempt=0;attempt<3;attempt++){
 const response=await globalThis.fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'OpenRacetrackDB independent historical circuit research'},body:new globalThis.URLSearchParams({data:query}),signal:globalThis.AbortSignal.timeout(120000)});
 if(!response.ok){if(attempt===2)throw new Error(`HTTP ${response.status}`);const header=response.headers.get('retry-after'),numeric=Number(header),requested=header?(Number.isFinite(numeric)?numeric:(Date.parse(header)-Date.now())/1000):0,seconds=Math.max([406,429].includes(response.status)?30:5,Number.isFinite(requested)?requested:0);console.log(`HTTP ${response.status}; retry after ${seconds} seconds`);await delay(seconds*1000);continue;}
 raw=await response.json();if(raw.remark||!Array.isArray(raw.elements)||!raw.osm3s?.timestamp_osm_base)throw new Error(raw.remark??'Invalid independent response');break;
}
const keep=['type','id','version','timestamp','tags','nodes','geometry'];
const elements=raw.elements.map(e=>Object.fromEntries(keep.filter(k=>e[k]!==undefined).map(k=>[k,e[k]])));
const bytes=JSON.stringify({attribution:'© OpenStreetMap contributors',osmBaseTimestamp:raw.osm3s.timestamp_osm_base,historicalDate:date,elements},null,2)+'\n';
await mkdir(directory,{recursive:true});await writeFile(`${directory}/osm.json`,bytes);await writeFile(`${directory}/query.overpass`,query+'\n');
await writeFile(`${directory}/import.json`,JSON.stringify({schemaVersion:1,endpoint,fetchedAt:new Date().toISOString(),historicalDate:date,racewaysOnly,...(airfields?{airfields:true}:{}),...(trackLines?{trackLines:true}:{}),bbox,snapshotSha256:sha(bytes),elementCount:elements.length},null,2)+'\n');
console.log(slug,elements.length,'independent ways');
