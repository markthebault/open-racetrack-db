import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readTimingArchive,type TimingRecord} from './reference-timing';
import {worldCountries} from './world-countries';
import {distance} from '../src/geo';
const args=process.argv.slice(2),archive=args[args.indexOf('--archive')+1];if(!args.includes('--archive')||!archive)throw new Error('Use --archive /absolute/path/to/archive.zip');
const {records,xmlSha256}=readTimingArchive(archive),read=async(p:string)=>JSON.parse(await readFile(p,'utf8')),save=async(p:string,x:unknown)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
const index=await read('data/index.json'),coverage=await read('data/layout-coverage.json'),tracks=new Map<string,{path:string;track:any}>();
for(const entry of index.tracks)tracks.set(entry.id,{path:`data/${entry.file}`,track:await read(`data/${entry.file}`)});
const aliases:Record<string,string>={'Czech Republic':'CZ','Turkey':'TR','United Kingdom':'GB','Canary Islands':'ES','Isle Of Man':'IM','Russia':'RU','South Korea':'KR','Taiwan':'TW','Vietnam':'VN','United States':'US','United Arab Emirates':'AE'};
const countryFor=(r:TimingRecord)=>worldCountries.find(c=>c.code===aliases[r.country]||c.name.toLowerCase()===r.country.toLowerCase());
const slug=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const base=(s:string)=>s.replace(/\s+(?:combo|combined|gp|grand prix|full|long|short|north|south|east|west|national|international|club|reverse|circuit no\.?|no\.?|track|layout)\b.*$/i,'').replace(/\s+\d.*$/,'').trim();
const unlocated:{country:string;base:string;id:string;record:TimingRecord}[]=[],registry:any[]=[];
for(const record of records){
 const registered=[...tracks.values()].find(t=>t.track.layouts.some((l:any)=>l.referenceId===record.id));
 const row=coverage.records.find((r:any)=>r.id===record.id);let chosen=registered??tracks.get(row?.trackId);
 if(!chosen){const country=countryFor(record);if(!country)throw new Error(`Unknown catalogue country ${record.country}`);const b=base(record.name),near=unlocated.find(g=>g.country===record.country&&g.base.toLowerCase()===b.toLowerCase()&&distance(g.record.gates[0].point,record.gates[0].point)<2000);const id=near?.id??`${country.code.toLowerCase()}-${slug(b)||'course'}-${createHash('sha256').update(record.id).digest('hex').slice(0,8)}`;
  chosen=tracks.get(id);if(!chosen){const path=`data/${country.slug}/${id}/track.json`,track={schemaVersion:1,id,name:b,aliases:[],country,location:null,sourceIds:[],defaultLayoutId:slug(record.name)||'main',layouts:[],sources:[]};chosen={path,track};tracks.set(id,chosen);unlocated.push({country:record.country,base:b,id,record});await mkdir(path.replace(/track.json$/,''),{recursive:true});}
 }
 let layout=chosen.track.layouts.find((l:any)=>l.referenceId===record.id);
 if(!layout){const mapped=row?.layoutIds.map((id:string)=>chosen!.track.layouts.find((l:any)=>l.id===id)).filter(Boolean)??[];layout=mapped.find((l:any)=>!l.referenceId);
  if(layout){layout.referenceId=record.id;layout.name=record.name;}else{let id=slug(record.name)||'main';const stem=id;let suffix=2;while(chosen.track.layouts.some((l:any)=>l.id===id))id=`${stem}-${suffix++}`;layout={id,name:record.name,referenceId:record.id,file:null,missingGeometryReason:'This layout is listed. Its course trace still needs to be mapped.'};chosen.track.layouts.push(layout);}
 }
 if(layout.file===null)layout.missingGeometryReason='This layout is listed. Its course trace still needs to be mapped.';
 registry.push({referenceId:record.id,trackId:chosen.track.id,layoutId:layout.id,name:record.name,country:record.country,timingMode:record.gates.length===2?'separate':'shared',geometryAvailable:layout.file!==null});
}
for(const {path,track} of tracks.values()){const first=track.layouts.find((l:any)=>l.referenceId&&l.file!==null)??track.layouts.find((l:any)=>l.referenceId);if(first&&!track.layouts.find((l:any)=>l.id===track.defaultLayoutId)?.referenceId)track.defaultLayoutId=first.id;await save(path,track);}
await mkdir('sources/reference',{recursive:true});await save('sources/reference/catalogue.json',{schemaVersion:1,xmlSha256,records:registry});
console.log({registered:registry.length,geometryAvailable:registry.filter(r=>r.geometryAvailable).length,venues:tracks.size});
