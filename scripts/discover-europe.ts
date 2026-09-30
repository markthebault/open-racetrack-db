import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {retryDelay} from './overpass-policy';
import {europeanCountries} from './europe-countries';
import {additionalCountries} from './world-countries';
const worldwide=process.argv.includes('--world'),region=worldwide?'world':'europe',countries=worldwide?additionalCountries:europeanCountries;
const args=process.argv.slice(2),only=args.includes('--country')?args[args.indexOf('--country')+1]:undefined;
if(only&&!countries.some(c=>c.code===only))throw new Error(`Unknown country for this scope: ${only}`);
const endpoint=process.env.OVERPASS_ENDPOINT??'https://overpass-api.de/api/interpreter';
const pause=(seconds:number)=>new Promise(r=>setTimeout(r,seconds*1000));
for(const country of countries.filter(c=>!only||c.code===only)){
 const dir=`sources/${region}/${country.code.toLowerCase()}`;
 try{const snapshot=await readFile(`${dir}/osm.json`,'utf8'),manifest=JSON.parse(await readFile(`${dir}/import.json`,'utf8'));if(createHash('sha256').update(snapshot).digest('hex')!==manifest.snapshotSha256)throw new Error('hash mismatch');console.log(`Reused ${country.code}`);continue;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const clip=!worldwide&&country.code==='RU'?'(34,19,72,60)':'';
 const query=`[out:json][timeout:90][maxsize:268435456];area["ISO3166-1"="${country.code}"]${worldwide?'':'["admin_level"="2"]'}->.country;(way["highway"="raceway"](area.country)${clip};nwr["leisure"~"^(sports_centre|sports_complex)$"]["sport"~"motor"](area.country)${clip};relation["type"="site"]["site"~"^(raceway|motorsport|racetrack)$"](area.country)${clip};);out meta geom;${worldwide?'.country out ids;':''}\n`;
 let success=false;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'OpenRacetrackDB/0.2 (Circuit inventory)'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(120000)});
   if(!response.ok){const seconds=retryDelay(response.status,response.headers.get('retry-after'));console.log(`${country.code}: HTTP ${response.status}, wait ${Math.ceil(seconds)} s`);await pause(seconds);if(attempt<2)continue;throw new Error(`HTTP ${response.status}`);}
   const raw=await response.json();if(raw.remark||!Array.isArray(raw.elements))throw new Error(raw.remark??'Invalid response');
   const keep=['type','id','version','timestamp','tags','nodes','geometry','members','bounds','center','lat','lon'];
   const elements=raw.elements.map((e:any)=>Object.fromEntries(keep.filter(k=>e[k]!==undefined).map(k=>[k,e[k]]))).sort((a:any,b:any)=>a.type.localeCompare(b.type)||a.id-b.id);
   const snapshot=JSON.stringify({attribution:'© OpenStreetMap contributors',osmBaseTimestamp:raw.osm3s.timestamp_osm_base,elements},null,worldwide?undefined:2)+'\n';
   await mkdir(dir,{recursive:true});await writeFile(`${dir}/osm.json`,snapshot);await writeFile(`${dir}/query.overpass`,query);
   await writeFile(`${dir}/import.json`,JSON.stringify({schemaVersion:1,country,endpoint,fetchedAt:new Date().toISOString(),osmBaseTimestamp:raw.osm3s.timestamp_osm_base,snapshotFile:'osm.json',snapshotSha256:createHash('sha256').update(snapshot).digest('hex'),queryFile:'query.overpass',elementCount:elements.length,...(worldwide?{countryAreaFound:elements.some((e:any)=>e.type==='area')}: {})},null,2)+'\n');
   console.log(`Fetched ${country.code}: ${elements.length} elements`);success=true;break;
  }catch(e){console.log(`${country.code}: attempt ${attempt+1}: ${String(e)}`);if(attempt<2)await pause(5);}
 }
 if(!success)console.log(`MISSING ${country.code}: rerun discovery to resume`);
}
