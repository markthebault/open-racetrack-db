import {createHash} from 'node:crypto';
import {normalizeLayoutName} from './layout-matching';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {candidateLoops,exclusion} from './candidates';
import {assemble,type Way} from './route';
import {nearestEdge,type Position} from '../src/geo';
import {readTimingArchive} from './racelogic';
const args=process.argv.slice(2),archive=args[args.indexOf('--archive')+1];
if(!args.includes('--archive')||!archive)throw new Error('Use --archive /absolute/path/to/archive.zip');
const {records}=readTimingArchive(archive),read=async(p:string)=>JSON.parse(await readFile(p,'utf8')),write=async(p:string,x:unknown)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
const inventory=await read('data/layout-coverage.json'),index=await read('data/index.json');
const clean=normalizeLayoutName;
const slug=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
// Rotation and travel direction do not change the identity of the physical source edges.
const identity=(trace:Position[])=>trace.slice(1).map((p,i)=>[trace[i].join(','),p.join(',')].sort().join(':')).sort().join('|');
const associations:Record<string,{recordId:string;name:string;evidence:string}>=await read('sources/racelogic/layout-matches.json').catch(()=>({}));let added=0,associated=0;
for(const entry of index.tracks){
 const expected=inventory.records.filter((r:any)=>r.trackId===entry.id&&r.status==='missing-layout');if(!expected.length)continue;
 const path=`data/${entry.file}`,track=await read(path),snapshot=await read(`sources/${entry.id}/osm.json`),manifest=await read(`sources/${entry.id}/import.json`);
 if(createHash('sha256').update(await readFile(`sources/${entry.id}/osm.json`,'utf8')).digest('hex')!==manifest.snapshotSha256)throw new Error(`${entry.id}: snapshot hash mismatch`);
 const ways=snapshot.elements.filter((e:any)=>e.type==='way'&&e.tags?.highway==='raceway'&&!exclusion(e)) as Way[];
 const existing=await Promise.all(track.layouts.map(async(l:any)=>({layout:l,recipe:await read(`sources/${entry.id}/layouts/${l.id}.json`),trace:(await read(`data/${entry.file.replace(/track.json$/,'')}${l.file}`)).features[0].geometry.coordinates})));
 for(const expectedRecord of expected){
  const record=records.find(r=>r.id===expectedRecord.id)!;if(record.gates.length!==1)continue;
  const name=clean(record.name);if(name.length<5)continue;
  const named=ways.filter(w=>[w.tags?.name,w.tags?.['name:en']].some(n=>n&&clean(n)===name));if(!named.length)continue;
  const candidates=candidateLoops(named,400,500);if(candidates.truncated||candidates.loops.length!==1)continue;
  const loop=candidates.loops[0],trace=assemble(named,loop.segments,true);if(nearestEdge(record.gates[0].point,trace).displacementM>30)continue;
  const same=existing.find(e=>identity(e.trace)===identity(trace));
  let id=same?.layout.id;
  const note='Draft identification from a uniquely connected OSM course with a matching layout name. Private Racelogic start/finish GPS supports the venue association. Named source geometry and configuration still require visual review.';
  if(!id){id=slug(record.name);if(track.layouts.some((l:any)=>l.id===id))throw new Error(`${entry.id}: layout ID collision ${id}`);
   const recipe={schemaVersion:1,trackId:entry.id,layoutId:id,sourceId:manifest.sourceId,snapshotSha256:manifest.snapshotSha256,closed:true,timingMode:'shared',geometryStatus:'draft',reviewedAt:null,notes:[note,...(loop.directionKnown?[]:['Travel direction is not established by all selected OSM ways.'])],segments:loop.segments,gates:[]};
   await write(`sources/${entry.id}/layouts/${id}.json`,recipe);
   track.layouts.push({id,name:record.name,file:`layouts/${id}.geojson`,description:note});added++;
  }else{same!.layout.name=record.name;same!.layout.description=note;associated++;}
  associations[`${entry.id}/${id}`]={recordId:record.id,name:record.name,evidence:'Unique closed course from OSM raceway ways with matching normalized layout name; private timing proximity <=30 m. Draft association.'};
 }
 await write(path,track);
}
await mkdir('sources/racelogic',{recursive:true});await write('sources/racelogic/layout-matches.json',associations);console.log({added,associated});
