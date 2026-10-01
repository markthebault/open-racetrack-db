import {readTimingArchive} from './racelogic';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {nearestEdge,type Position} from '../src/geo';
import {worldCountries} from './world-countries';
import {layoutRecords as mapping} from './layout-records';
const args=process.argv.slice(2),archive=args[args.indexOf('--archive')+1];
if(!archive||args.indexOf('--archive')<0)throw new Error('Use --archive /absolute/path/to/racelogic-tracks-db.zip');
const {records}=readTimingArchive(archive);
const catalogue=JSON.parse(await readFile('data/index.json','utf8'));
const names:Record<string,string>={CZ:'Czech Republic',TR:'Turkey',GB:'United Kingdom',IM:'Isle Of Man'};
const out:Record<string,unknown>={};
for(const [id,name] of Object.entries(mapping)){const entry=catalogue.tracks.find((t:any)=>t.id===id.split('/')[0]);if(!entry)throw new Error(`Unknown mapped venue ${id}`);const country=worldCountries.find(c=>c.code===entry.country.code)!;const acceptedNames=[names[country.code]??country.name,...(country.code==='ES'?['Canary Islands']:[])];const record=records.find(r=>r.name===name&&acceptedNames.includes(r.country));if(!record)throw new Error(`Timing record missing: ${id}: ${name}`);out[id]={name,gates:record.gates};}
for(const entry of catalogue.tracks){
 const country=worldCountries.find(c=>c.code===entry.country.code);if(!country)continue;
 const acceptedNames=[names[country.code]??country.name,...(country.code==='ES'?['Canary Islands']:[])];
 const candidates=records.filter(r=>acceptedNames.includes(r.country));if(!candidates.length)continue;
 const track=JSON.parse(await readFile(`data/${entry.file}`,'utf8'));
 for(const layout of track.layouts){const key=`${track.id}/${layout.id}`;if(out[key])continue;
  const data=JSON.parse(await readFile(`data/${entry.file.replace(/track.json$/,'')}${layout.file}`,'utf8')),trace=data.features[0].geometry.coordinates;
  const matches=candidates.filter(r=>r.gates.length===1).map(r=>{const point:Position=r.gates[0].point;return {name:r.name,point,displacement:nearestEdge(point,trace).displacementM};}).filter(r=>r.displacement<=20).sort((a,b)=>a.displacement-b.displacement);
  if(matches.length){const match=matches[0];out[key]={name:match.name,association:'proximity-only',gates:[{role:'start_finish',point:match.point}]};}
 }
}
await mkdir('.local',{recursive:true});await writeFile('.local/timing.json',JSON.stringify(out,null,2)+'\n');console.log(`Imported ${Object.keys(out).length} private timing records to ignored .local/timing.json. No boundaries read.`);
