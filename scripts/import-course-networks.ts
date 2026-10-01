import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readTimingArchive} from './reference-timing';
import {readNetworkSelection} from './network-selection';
import {assemble} from './route';
import {nearestEdge} from '../src/geo';
const args=process.argv.slice(2),archive=args[args.indexOf('--archive')+1];
if(!args.includes('--archive')||!archive)throw new Error('Use --archive /absolute/path/to/archive.zip');
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8')),save=async(p:string,v:unknown)=>writeFile(p,JSON.stringify(v,null,2)+'\n');
const records=readTimingArchive(archive).records,registry=await read('sources/reference/catalogue.json'),index=await read('data/index.json'),matches=await read('sources/reference/layout-matches.json');
const selections=(await read('sources/reference/course-network-selections.json')).records;
for(const selection of selections){
 const registration=registry.records.find((r:any)=>r.referenceId===selection.referenceId),record=records.find(r=>r.id===selection.referenceId);
 if(!registration||!record||!/combo/i.test(record.name))throw new Error('Network must identify a registered aggregate configuration');
 const entry=index.tracks.find((e:any)=>e.id===registration.trackId),trackPath=`data/${entry.file}`,track=await read(trackPath),layout=track.layouts.find((l:any)=>l.id===registration.layoutId);
 if(selection.layoutIds.includes(layout.id))throw new Error('Network cannot include itself');
 if(selection.layoutIds.some((id:string)=>!track.layouts.some((l:any)=>l.id===id&&l.file)))throw new Error('Missing network component');
 const network=await readNetworkSelection(track.id,selection.layoutIds),paths=network.paths.map(p=>assemble(network.ways,p.segments,p.closed));
 if(Math.abs(network.lengthM-selection.expectedLengthM)>.15)throw new Error('Selected network source changed');
 if(record.gates.some(g=>Math.min(...paths.map(path=>nearestEdge(g.point,path).displacementM))>30))throw new Error('Network fails private timing proximity');
 const root=`sources/${track.id}`,file=`network-${layout.id}.json`,sourceId=`osm-network-${layout.id}`,url=`https://www.openstreetmap.org/way/${Math.min(...network.ways.map(w=>w.id))}`;
 const retrievedAt=track.sources.find((s:any)=>s.id===sourceId)?.retrievedAt??new Date().toISOString();
 const bytes=JSON.stringify({attribution:'© OpenStreetMap contributors',retrievedAt,components:network.components,elements:network.ways.map(w=>({type:'way',...w}))},null,2)+'\n',hash=createHash('sha256').update(bytes).digest('hex');
 await mkdir(`${root}/layouts`,{recursive:true});await writeFile(`${root}/${file}`,bytes);
 const manifest=await read(`${root}/import.json`);manifest.snapshots=(manifest.snapshots??[]).filter((s:any)=>s.file!==file);manifest.snapshots.push({file,sha256:hash,sourceId,url,retrievedAt});await save(`${root}/import.json`,manifest);
 const note=`Draft track network: ${selection.evidence} Each component follows an identified independent source route. Shared mapped edges count once in the displayed branch length. This aggregate is not one lap; no line connects separate paths and no coordinates are adjusted to a diagram or catalogue distance.`;
 if(!track.sourceIds.includes(sourceId))track.sourceIds.push(sourceId);
 for(const source of [{id:sourceId,type:'osm',title:'OpenStreetMap identified course network',url,license:'ODbL-1.0',retrievedAt,evidenceNote:'Exact pinned source ways from the component recipes; independent paths have no invented joins.'},{id:`network-identity-${layout.id}`,type:'reference',title:'Aggregate layout identification',url:selection.identificationUrl,license:'reference-only',retrievedAt,evidenceNote:selection.evidence+' Identification only; no image coordinates copied.'}]){const at=track.sources.findIndex((s:any)=>s.id===source.id);if(at<0)track.sources.push(source);else track.sources[at]=source;}
 await save(`${root}/layouts/${layout.id}.json`,{schemaVersion:2,geometryKind:'network',trackId:track.id,layoutId:layout.id,sourceId,snapshotFile:file,snapshotSha256:hash,geometryStatus:'draft',timingMode:record.gates.length===1?'shared':'separate',reviewedAt:null,notes:[],gates:[],paths:network.paths,components:network.components});
 layout.file=`layouts/${layout.id}.geojson`;layout.description=`Combined mapped configurations: ${selection.layoutIds.map((id:string)=>track.layouts.find((l:any)=>l.id===id).name).join(', ')}. Shared sections count once in the mapped branch length. Branch identity and historical alignment still need review.`;delete layout.missingGeometryReason;registration.geometryAvailable=true;
 matches[`${track.id}/${layout.id}`]={recordId:record.id,name:record.name,evidence:note};await save(trackPath,track);console.log(record.name,network.lengthM,network.paths.length);
}
await save('sources/reference/catalogue.json',registry);await save('sources/reference/layout-matches.json',matches);
