import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {additionalCountries} from './world-countries';
import {worldQuery,splitCountries} from './world-discovery';
import {retryDelay} from './overpass-policy';
const only=process.argv.includes('--country')?process.argv[process.argv.indexOf('--country')+1]:undefined;
if(only&&!additionalCountries.some(c=>c.code===only))throw new Error(`Unknown additional country: ${only}`);
const endpoint=process.env.OVERPASS_ENDPOINT??'https://overpass-api.de/api/interpreter',missing=[];
for(const country of additionalCountries.filter(c=>!only||c.code===only)){
 const dir=`sources/world/${country.code.toLowerCase()}`;
 try{const snapshot=await readFile(`${dir}/osm.json`),manifest=JSON.parse(await readFile(`${dir}/import.json`,'utf8'));if(createHash('sha256').update(snapshot).digest('hex')!==manifest.snapshotSha256)throw new Error(`${country.code}: hash mismatch`);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;missing.push(country);}
}
const pause=(seconds:number)=>new Promise(resolve=>setTimeout(resolve,seconds*1000));
let failed=false;
for(let i=0;i<missing.length;i+=12){
 const batch=missing.slice(i,i+12),codes=batch.map(c=>c.code),query=worldQuery(codes);let success=false;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'OpenRacetrackDB/0.3 (offline worldwide inventory)'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(120000)});
   if(!response.ok){const seconds=retryDelay(response.status,response.headers.get('retry-after'));console.log(`${codes.join(',')}: HTTP ${response.status}, wait ${seconds} s`);await pause(seconds);if(attempt<2)continue;throw new Error(`HTTP ${response.status}`);}
   const raw=await response.json();if(raw.remark||!Array.isArray(raw.elements)||!raw.osm3s?.timestamp_osm_base)throw new Error(raw.remark??'Invalid response');
   const groups=splitCountries(raw.elements,codes),fetchedAt=new Date().toISOString();
   const keep=['type','id','version','timestamp','tags','nodes','geometry','members','bounds','center','lat','lon'];
   for(const country of batch){
    const dir=`sources/world/${country.code.toLowerCase()}`,elements=groups.get(country.code)!.map(e=>Object.fromEntries(keep.filter(k=>e[k]!==undefined).map(k=>[k,e[k]]))).sort((a,b)=>a.type.localeCompare(b.type)||a.id-b.id);
    const snapshot=JSON.stringify({attribution:'© OpenStreetMap contributors',osmBaseTimestamp:raw.osm3s.timestamp_osm_base,elements})+'\n';
    await mkdir(dir,{recursive:true});await writeFile(`${dir}/osm.json`,snapshot);await writeFile(`${dir}/query.overpass`,query);
    await writeFile(`${dir}/import.json`,JSON.stringify({schemaVersion:1,country,endpoint,fetchedAt,osmBaseTimestamp:raw.osm3s.timestamp_osm_base,snapshotFile:'osm.json',snapshotSha256:createHash('sha256').update(snapshot).digest('hex'),queryFile:'query.overpass',elementCount:elements.length,countryAreaFound:elements.some(e=>e.type==='area'),selectionMethod:'Country-area marker emitted before each foreach result',requestedCountryCodes:codes},null,2)+'\n');
    console.log(`Fetched ${country.code}: ${elements.length} elements${elements.some(e=>e.type==='area')?'':' (country area unavailable)'}`);
   }
   success=true;break;
  }catch(e){console.log(`${codes.join(',')}: attempt ${attempt+1}: ${String(e)}`);if(attempt<2)await pause(5);}
 }
 if(!success){failed=true;console.log(`MISSING batch ${codes.join(',')}. Resume discovery to retry.`);}
}
if(failed)process.exitCode=1;
