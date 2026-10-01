import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {europeanCountries} from './europe-countries';
import {additionalCountries,worldCountries} from './world-countries';
const worldwide=process.argv.includes('--world'),region=worldwide?'world':'europe',countries=worldwide?additionalCountries:europeanCountries;
import {components,exclusion,candidateLoops} from './candidates';
import {assemble,type Way} from './route';
import {bounds,type Position} from '../src/geo';
import {distance} from '../src/geo';
import {validateTrack,type Track} from '../schemas/data';

const json=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
const save=async(path:string,value:unknown)=>writeFile(path,JSON.stringify(value,null,2)+'\n');
const existing=await json('data/index.json'),existingWays=new Map<number,string>(),existingIdentities=new Map<string,string>();
for(const e of existing.tracks){const track=await json(`data/${e.file}`);const identity=track.sources.find((s:any)=>s.type==='osm')?.url.match(/openstreetmap.org\/(node|way|relation)\/(\d+)$/);if(identity)existingIdentities.set(track.id,`${identity[1]}/${identity[2]}`);for(const l of track.layouts){if(l.file===null)continue;const recipe=await json(`sources/${track.id}/layouts/${l.id}.json`);for(const s of recipe.segments)existingWays.set(s.wayId,track.id);}}
const countryReports=[],inventory:any[]=[],bootstrap:any[]=[];
try{bootstrap.push(...(await json(`sources/${region}/bootstrap.json`)).filter((t:any)=>existing.tracks.some((e:any)=>e.id===t.id)));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const identityPattern=/circuit|autodrom|race\s?(track|way)|racing|speedway|motorsport|motor\s?sport|rennstrecke|ring\b|pista|race\s?park|motodrom|рад|автодром|автостаза|писта|стаза|radalle|gelleråsen|kinnekulle|banan\b|mondello|rudskogen|våler|kymiring|botniaring|alastaro|ahvenisto|mantorp|サーキット|スピードウェイ|赛车场|賽車場|赛道|赛车|서킷|레이스웨이/i;
const excludedIdentity=/kart|カート|卡丁|카트|motocross|\bmx\b|horse|equine|4x4|off[- ]road|hill\s?climb|drift|proving|test\s?track|testing\s?ground/i;
const normal=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const roadHints=await json(`sources/${region}/road-circuits.json`);
const knownRoad=new RegExp(roadHints.namePatterns.join('|'),'i');
const publishedLocations=existing.tracks.filter((e:any)=>e.location!==null).map((e:any)=>({country:e.country.code,location:e.location,name:e.name,id:e.id,identity:existingIdentities.get(e.id)}));
function center(points:Position[]):Position{return [points.reduce((s,p)=>s+p[0],0)/points.length,points.reduce((s,p)=>s+p[1],0)/points.length];}
function sourcePoints(e:any):Position[]{if(e.geometry)return e.geometry.filter(Boolean).map((p:any)=>[p.lon,p.lat]);if(e.members)return e.members.flatMap((m:any)=>sourcePoints(m));return e.lon!==undefined?[[e.lon,e.lat]]:[];}
function inside(p:Position,ring:Position[]){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function slug(name:string){return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,75).replace(/-$/,'');}

for(const country of countries){
 const dir=`sources/${region}/${country.code.toLowerCase()}`;let raw:any,manifest:any;
 try{raw=await json(`${dir}/osm.json`);manifest=await json(`${dir}/import.json`);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;countryReports.push({country,status:'not-fetched',elements:0,imported:0,existing:0,pending:0});continue;}
 const snapshot=await readFile(`${dir}/osm.json`,'utf8');if(createHash('sha256').update(snapshot).digest('hex')!==manifest.snapshotSha256)throw new Error(`${country.code}: source hash mismatch`);
 const allWays=raw.elements.filter((e:any)=>e.type==='way'&&e.tags?.highway==='raceway'&&e.nodes?.length>1&&e.geometry?.every(Boolean)) as Way[];
 const pavedEligible=allWays.filter(w=>!exclusion(w)&&!['dirt','ground','mud','sand','grass','gravel','unpaved'].includes(w.tags?.surface??''));
 const groups=components(pavedEligible);
 const sites=raw.elements.filter((e:any)=>e.tags?.name&&e.tags?.leisure&&e.tags.highway!=='raceway');
 const report={country,status:worldwide&&manifest.countryAreaFound===false?'area-unavailable':'fetched',elements:raw.elements.length,imported:0,existing:0,pending:0,fetchedAt:manifest.fetchedAt,snapshotSha256:manifest.snapshotSha256,racewayWays:allWays.length,excludedWays:allWays.length-pavedEligible.length,groupsWithoutClosedCandidate:0};
 const prepared=groups.map(group=>({group,candidates:candidateLoops(group,400,worldwide?500:1000)})).sort((a,b)=>(b.candidates.loops[0]?.lengthM??0)-(a.candidates.loops[0]?.lengthM??0));
 for(const {group,candidates} of prepared){
  const covered=[...new Set(group.map(w=>existingWays.get(w.id)).filter(Boolean))];if(covered.length){report.existing+=covered.length;inventory.push({country:country.code,wayIds:group.map(w=>w.id),status:'existing',trackIds:covered});continue;}
  if(!candidates.loops.length){report.groupsWithoutClosedCandidate++;continue;}
  const namedClosed=group.filter(w=>w.nodes[0]===w.nodes.at(-1)&&w.tags?.name&&(identityPattern.test(normal(w.tags.name))||knownRoad.test(normal(w.tags.name)))).map(w=>candidateLoops([w],400,worldwide?500:1000).loops[0]).filter(Boolean).sort((a,b)=>b.lengthM-a.lengthM);
  const loop=namedClosed[0]??candidates.loops[0],points=assemble(group,loop.segments,true),location=center(points),bbox=bounds(points);
  const containing=sites.filter((e:any)=>{const p=sourcePoints(e);return p.length>2&&inside(location,p);}).sort((a:any,b:any)=>{const x=bounds(sourcePoints(a)),y=bounds(sourcePoints(b));return (x[2]-x[0])*(x[3]-x[1])-(y[2]-y[0])*(y[3]-y[1]);});
  const identity=containing[0]??group.filter(w=>w.tags?.name&&(identityPattern.test(normal(w.tags.name))||knownRoad.test(normal(w.tags.name)))).sort((a,b)=>(b.tags?.name?.length??0)-(a.tags?.name?.length??0))[0];
  const rawName=(identity?.tags?.['name:en']??identity?.tags?.name) as string|undefined;
  const canonical=(roadHints.canonicalNames??[]).find((c:any)=>c.country===country.code&&c.sourceName===rawName);
  const name=canonical?.name??(rawName?.includes('. Goodwood Motor Circuit')?'Goodwood Motor Circuit':rawName==='Palmer Sport'?'Bedford Autodrome':rawName);
  const record:any={country:country.code,wayIds:group.map(w=>w.id),name:name??null,sourceIdentity:identity?{type:identity.type??'way',id:identity.id}:null,lengthM:loop.lengthM,candidateCount:candidates.loops.length,enumerationTruncated:candidates.truncated};
  if(!name||excludedIdentity.test(name)||group.every(w=>['dirt','ground','mud','sand','grass','gravel','unpaved'].includes(w.tags?.surface??''))){record.status='pending';record.reason=!name?'Venue identity not established in OSM':excludedIdentity.test(name)?'Facility classification needs review':'Unpaved course classification needs review';report.pending++;inventory.push(record);continue;}
  const selectedWays=loop.segments.map(s=>group.find(w=>w.id===s.wayId)!);
  if(!knownRoad.test(normal(name))){record.status='pending';record.reason='Car or motorcycle road-circuit identity needs confirmation; not automatically inferred from a generic facility name';report.pending++;inventory.push(record);continue;}
  if(selectedWays.some(w=>['dirt','ground','mud','sand','grass','gravel','unpaved'].includes(w.tags?.surface??''))){record.status='pending';record.reason='Selected loop includes unpaved sections; road-course association needs review';report.pending++;inventory.push(record);continue;}
  const duplicate=publishedLocations.find((v:any)=>v.country===country.code&&distance(v.location,location)<1500);
  if(duplicate){record.status='pending';record.reason='Additional course near an existing venue requires layout association';record.relatedTrackId=duplicate.id;report.pending++;inventory.push(record);continue;}
  if(points.some((p,i)=>i>0&&p[0]===points[i-1][0]&&p[1]===points[i-1][1])){record.status='pending';record.reason='Consecutive coincident source coordinates require review';report.pending++;inventory.push(record);continue;}
  // Avoid publishing a loop assembled from unresolved combinatorial alternatives.
  if(candidates.truncated&&!namedClosed.length){record.status='pending';record.reason='Complex branching requires an explicit course selection';report.pending++;inventory.push(record);continue;}
  const venueSlug=`${slug(name)||'osm'}-${group[0].id}`,id=`${country.code.toLowerCase()}-${venueSlug}`,folder=`data/${country.slug}/${venueSlug}`,sourceDir=`sources/${id}`;
  const notes=[namedClosed.length?'Closed named OSM raceway retained as a course candidate. Named-layout association requires review.':'Connected OSM course candidate. The selected loop is the longest simple source-node cycle after explicit exclusions; its association with a named circuit configuration requires review.','Source way order and shared node IDs are retained. No nearby endpoints are joined and no reference boundaries are read.'];
  if(!loop.directionKnown)notes.push('Some source ways lack one-way direction tags. Travel direction is provisional.');
  const elements=raw.elements.filter((e:any)=>group.some(w=>w.id===e.id&&e.type==='way')||(e.id===identity.id&&e.type===(identity.type??'way')));
  const venueSnapshot=JSON.stringify({attribution:raw.attribution,osmBaseTimestamp:raw.osmBaseTimestamp,elements},null,2)+'\n',hash=createHash('sha256').update(venueSnapshot).digest('hex');
  await mkdir(`${sourceDir}/layouts`,{recursive:true});await mkdir(`${folder}/layouts`,{recursive:true});await writeFile(`${sourceDir}/osm.json`,venueSnapshot);await writeFile(`${sourceDir}/query.overpass`,await readFile(`${dir}/query.overpass`,'utf8'));
  await save(`${sourceDir}/import.json`,{schemaVersion:1,trackId:id,sourceId:'osm-snapshot',endpoint:manifest.endpoint,bbox,fetchedAt:manifest.fetchedAt,osmBaseTimestamp:manifest.osmBaseTimestamp,snapshotFile:'osm.json',snapshotSha256:hash,queryFile:'query.overpass',parentSnapshot:`${region}/${country.code.toLowerCase()}/osm.json`,parentSnapshotSha256:manifest.snapshotSha256,selectionWayIds:group.map(w=>w.id),selectionIdentity:record.sourceIdentity});
  await save(`${sourceDir}/layouts/main.json`,{schemaVersion:1,trackId:id,layoutId:'main',sourceId:'osm-snapshot',snapshotSha256:hash,closed:true,timingMode:'shared',geometryStatus:'draft',reviewedAt:null,notes,segments:loop.segments,gates:[]});
  const identityReferences=(roadHints.classificationReferences??[]).filter((ref:any)=>(!ref.country||ref.country===country.code)&&new RegExp(ref.namePattern,'i').test(normal(rawName??name))).map((ref:any,i:number)=>({id:`venue-reference-${i+1}`,type:'reference',title:'Venue operator identity reference',url:ref.url,license:'reference-only',retrievedAt:ref.retrievedAt,evidenceNote:'The operator reference supports venue identity. It does not verify this source-cycle selection and supplies no public coordinates.'}));
  const track:Track=validateTrack({schemaVersion:1,id,name,...(identity.tags['addr:city']?{locality:identity.tags['addr:city']}:{}),aliases:[...new Set([identity.tags.name,...(identity.tags.alt_name??'').split(';')].filter((alias:string)=>alias&&alias!==name))],country,location,sourceIds:['osm-snapshot'],defaultLayoutId:'main',layouts:[{id:'main',name:'Connected course candidate',file:'layouts/main.geojson',description:'Draft OSM course selection. Named-layout and direction confirmation is still required.'}],sources:[{id:'osm-snapshot',type:'osm',title:'OpenStreetMap course and venue identity',url:`https://www.openstreetmap.org/${record.sourceIdentity.type}/${identity.id}`,license:'ODbL-1.0',retrievedAt:manifest.fetchedAt,evidenceNote:'Venue identity and trace coordinates come from the pinned OSM extract. The source identity identifies the facility; course configuration is provisional. No privately sourced coordinates enter the public database.'},...identityReferences]});
  await save(`${folder}/track.json`,track);
  await writeFile(`${sourceDir}/review.md`,`# ${name}\n\nGeometry: **draft**. Public timing: **missing**. Inspector: Codex, ${manifest.fetchedAt.slice(0,10)}.\n\nParent country snapshot: \`${region}/${country.code.toLowerCase()}/osm.json\`, SHA-256 \`${manifest.snapshotSha256}\`. Venue subset SHA-256: \`${hash}\`.\n\n## Connected course candidate\n\nRecipe: \`layouts/main.json\`. Approximate trace length: ${loop.lengthM} m. Candidate count: ${candidates.loops.length}. ${notes.join(' ')}\n\nIdentity: [OSM ${record.sourceIdentity.type} ${identity.id}](https://www.openstreetmap.org/${record.sourceIdentity.type}/${identity.id}). Source geometry: ${[...new Set(loop.segments.map(s=>s.wayId))].map(i=>`[way ${i}](https://www.openstreetmap.org/way/${i})`).join(', ')}.\n\nPit, karting, motocross, service and unrelated ways are filtered before selection. Branches within the remaining graph are hypotheses, not independent evidence of named configurations. No geometry is marked reviewed. Public timing is absent pending a reusable source. Private start/finish comparisons do not establish a named layout or redistribution rights. No CIR, track-map or reference boundary file is read.\n\nRemaining work: confirm the selected course against venue evidence, inspect every ambiguous branch and travel direction, and add independently reusable timing evidence.\n`);
  bootstrap.push({id,name,country,slug:venueSlug,bbox});record.status='imported-draft';record.trackId=id;record.layoutId='main';report.imported++;inventory.push(record);
  publishedLocations.push({country:country.code,location,name,id,identity:`${record.sourceIdentity.type}/${record.sourceIdentity.id}`});
 }
 // Retain named facilities even when no eligible closed trace is mapped.
 for(const site of sites){const name=site.tags['name:en']??site.tags.name;if(!knownRoad.test(normal(name))||excludedIdentity.test(name))continue;const pts=sourcePoints(site);if(!pts.length)continue;const location=center(pts);if(publishedLocations.some((v:any)=>v.country===country.code&&distance(v.location,location)<1500))continue;if(inventory.some(r=>r.country===country.code&&r.name===name))continue;inventory.push({country:country.code,name,wayIds:[],sourceIdentity:{type:site.type,id:site.id},status:'pending',reason:'Named facility has no selected eligible closed road trace; source geometry requires inspection'});report.pending++;}
 countryReports.push(report);console.log(`${country.code}: ${report.imported} new courses, ${report.existing} existing, ${report.pending} pending`);
}
const referenceBacklog=await json(`sources/${region}/reference-backlog.json`);
for(const venue of referenceBacklog.venues){if(inventory.some(c=>c.country===venue.country&&normal(c.name??'')===normal(venue.name)))continue;inventory.push({...venue,status:'pending',wayIds:[],sourceReference:referenceBacklog.sourceUrl});countryReports.find(r=>r.country.code===venue.country)!.pending++;}
await mkdir(`sources/${region}`,{recursive:true});await save(`sources/${region}/bootstrap.json`,[...new Map(bootstrap.map(v=>[v.id,v])).values()].sort((a,b)=>a.id.localeCompare(b.id)));
if(worldwide){const europe=await json('data/europe-coverage.json');for(const report of countryReports)Object.assign(report,{sourceRegion:'world'});for(const report of europe.countries)if(!countryReports.some(r=>r.country.code===report.country.code))countryReports.push({...report,sourceRegion:'europe'});inventory.push(...europe.candidates.filter((c:any)=>!countries.some(w=>w.code===c.country)));countryReports.sort((a,b)=>a.country.name.localeCompare(b.country.name));if(countryReports.length!==worldCountries.length)throw new Error('Incomplete country inventory');}
await save(`data/${region}-coverage.json`,{schemaVersion:1,scope:(worldwide?'Worldwide inventory. ':'')+'Permanent car and motorcycle circuits in the selected countries. Karting and motocross excluded. Country extracts do not prove complete venue or layout coverage.',minimumCandidateLengthM:worldwide?500:1000,countries:countryReports,candidates:inventory});
console.log(`Prepared ${bootstrap.length} named draft courses; generation is the next step.`);
