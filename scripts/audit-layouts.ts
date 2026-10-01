import {normalizeLayoutName} from './layout-matching';
import {readFile,writeFile} from 'node:fs/promises';
import {readTimingArchive} from './racelogic';
import {layoutRecords} from './layout-records';
import {worldCountries} from './world-countries';
import {nearestEdge,distance,type Position} from '../src/geo';
import {candidateLoops,exclusion} from './candidates';
import type {Way} from './route';
const args=process.argv.slice(2),archive=args[args.indexOf('--archive')+1];
if(!args.includes('--archive')||!archive)throw new Error('Use --archive /absolute/path/to/archive.zip');
const {records,xmlSha256}=readTimingArchive(archive);
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const index=await read('data/index.json');
const aliases:Record<string,string>={'Czech Republic':'CZ','Turkey':'TR','United Kingdom':'GB','Canary Islands':'ES','Isle Of Man':'IM','Russia':'RU','South Korea':'KR','Taiwan':'TW','Vietnam':'VN','United States':'US','United Arab Emirates':'AE'};
const countryCode=(name:string)=>aliases[name]??worldCountries.find(c=>c.name.toLowerCase()===name.toLowerCase())?.code;
const venues=await Promise.all(index.tracks.map(async(t:any)=>{
 const track=await read(`data/${t.file}`),snapshot=await read(`sources/${t.id}/osm.json`);
 const traces=snapshot.elements.filter((e:any)=>e.type==='way'&&e.tags?.highway==='raceway'&&!exclusion(e as Way)).map((w:Way)=>w.geometry.map(p=>[p.lon,p.lat] as Position));
 return {...t,track,traces};
}));
const rows=records.map(record=>{
 const explicit=Object.entries(layoutRecords).filter(([,name])=>name===record.name).filter(([key])=>venues.some(v=>v.id===key.split('/')[0]&&v.country.code===countryCode(record.country)));
 const nearby=venues.filter(v=>v.country.code===countryCode(record.country)&&distance(v.location,record.gates[0].point)<35000).map(v=>({id:v.id,displacement:Math.min(...v.traces.map((t:Position[])=>nearestEdge(record.gates[0].point,t).displacementM))})).filter(v=>v.displacement<=300).sort((a,b)=>a.displacement-b.displacement);
 const trackId=explicit[0]?.[0].split('/')[0]??(nearby.length===1||nearby.length>1&&nearby[1].displacement-nearby[0].displacement>100?nearby[0]?.id:undefined);
 const layoutIds=explicit.map(([key])=>key.split('/')[1]);
 const outOfScope=/\bkart\b|karting|kart circuit|motorplex kart|motocross|rallycross/i.test(record.name);
 return {id:record.id,country:record.country,name:record.name,timingMode:record.gates.length===2?'separate':'shared',...(trackId?{trackId}:{}),layoutIds,status:outOfScope?'out-of-scope':layoutIds.length?'draft-mapped':trackId?'missing-layout':nearby.length?'ambiguous-venue':'missing-venue',association:explicit.length?'explicit':trackId?'gps-candidate':'none',remainingWork:layoutIds.length?['Review the named course geometry and travel convention.','Public timing still needs independently reusable evidence.',...(record.gates.length===2?['Private preview trims the supporting loop; independently sourced public open endpoints remain missing.']:[])]:['Identify the venue and explicit connected route recipe from independent geometry.'],...(nearby.length&&!explicit.length?{candidateTrackIds:nearby.map(v=>v.id)}:{})};
});
const venueRows=venues.map(v=>{
 const expected=rows.filter(r=>r.trackId===v.id&&r.status!=='out-of-scope');
 const covered=new Set(expected.flatMap(r=>r.layoutIds));
 return {trackId:v.id,name:v.name,country:v.country.name,actualLayoutCount:v.layoutCount,expectedRecordCount:expected.length,minimumAdditionalLayoutCount:Math.max(0,expected.length-v.layoutCount),mappedRecordCount:expected.filter(r=>r.layoutIds.length).length,missingRecordNames:expected.filter(r=>!r.layoutIds.length).map(r=>r.name),unassociatedLayoutIds:v.track.layouts.filter((l:any)=>!covered.has(l.id)).map((l:any)=>l.id),status:!expected.length?'no-associated-reference':expected.some(r=>!r.layoutIds.length)||covered.size!==v.layoutCount?'gap':'draft-count-parity'};
});
const sourceAvailability=new Map<string,any>();
for(const referenceCountry of new Set(records.map(r=>r.country))){const code=countryCode(referenceCountry);if(!code)continue;for(const region of ['europe','world']){try{const snapshot=await read(`sources/${region}/${code.toLowerCase()}/osm.json`);sourceAvailability.set(referenceCountry,snapshot.elements.filter((e:any)=>e.type==='way'&&e.tags?.highway==='raceway'&&!exclusion(e)));break;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}}
const routeResearch=rows.filter(r=>!['draft-mapped','out-of-scope'].includes(r.status)).map(r=>{const ways=(sourceAvailability.get(r.country)??[]) as Way[],name=normalizeLayoutName(r.name),named=ways.filter(w=>[w.tags?.name,w.tags?.['name:en']].some(n=>n&&normalizeLayoutName(n)===name));const candidates=named.length?candidateLoops(named,400,500):undefined;return {recordId:r.id,matchingNamedWayIds:named.map(w=>w.id),namedCourseCandidates:candidates?.loops.length??0,enumerationTruncated:candidates?.truncated??false,reason:!named.length?'No independently named OSM raceway matches this configuration in the saved country extract. Route identification or additional source geometry is required.':candidates?.loops.length===1?'A named OSM route candidate exists, but venue association, timing proximity or travel convention did not pass the automatic checks. Inspect before adding.':'Named source ways do not identify a unique connected course. An explicit route recipe is required.'};});
const summary={referenceRecords:rows.length,venuesChecked:venueRows.length,draftMapped:rows.filter(r=>r.status==='draft-mapped').length,unmappedLayouts:rows.filter(r=>r.status==='missing-layout').length,missingVenues:rows.filter(r=>r.status==='missing-venue').length,ambiguousVenues:rows.filter(r=>r.status==='ambiguous-venue').length,outOfScope:rows.filter(r=>r.status==='out-of-scope').length};
const report={schemaVersion:1,reference:'Racelogic StartFinishDataBase.xml',xmlSha256,policy:'Expected layout names and timing conventions come from Racelogic. GPS is used privately to propose venue associations. Public output contains no timing coordinates, boundary fields or archive geometry. Explicit mappings remain draft routes; matching counts does not establish reviewed geometry. Unmapped entries require route identification, not copies of an existing circuit.',summary,records:rows,venues:venueRows,routeResearch};
await writeFile('data/layout-coverage.json',JSON.stringify(report,null,2)+'\n');
const cell=(s:string)=>s.replaceAll('|','\\|').replaceAll('\n',' ');
let md='# Racelogic layout gaps\n\nReference: supplied Racelogic timing XML, SHA-256 `'+xmlSha256+'`. All '+rows.length+' records and '+venueRows.length+' public venues are accounted for. Only layout names and start/finish GPS were read. No boundary or CIR files were opened. Timing GPS remains private. Count parity remains provisional: GP/Sprint/combined variants need geometry review, and separate-gate entries can still use a supporting public loop pending reusable endpoint evidence.\n\n'+Object.entries(summary).map(([k,v])=>`- ${k}: ${v}`).join('\n')+'\n\n## How to read this list\n\nRacelogic defines the expected entries. A GPS candidate proposes a venue association only. It does not identify a route configuration. Generic OSM loops and proximity-only timing matches do not count as mapped layouts. Draft-mapped entries have explicit route associations and still need geometry review. Out-of-scope names explicitly mention karting or rallycross. Street, historical and uncertain records remain listed for review.\n\n## Every current venue\n\n| Country | Venue | Public traces | Reference records | Explicitly mapped | Missing layout names | Unassociated public layout IDs |\n| --- | --- | ---: | ---: | ---: | --- | --- |\n';
for(const v of venueRows)md+=`| ${cell(v.country)} | ${cell(v.name)} | ${v.actualLayoutCount} | ${v.expectedRecordCount} | ${v.mappedRecordCount} | ${cell(v.missingRecordNames.join('; '))} | ${cell(v.unassociatedLayoutIds.join('; '))} |\n`;
md+='\n## Remaining route research\n\nEvery unmapped record was checked against named raceway ways in the saved country extracts. Facility polygons and Racelogic boundary fields are excluded. A name match without a unique connected cycle is insufficient to add a trace.\n\n| Reference record | Named OSM ways | Closed candidates | Remaining work |\n| --- | --- | ---: | --- |\n';
for(const r of routeResearch)md+=`| ${cell(r.recordId)} | ${r.matchingNamedWayIds.join('; ')} | ${r.namedCourseCandidates} | ${cell(r.reason)} |\n`;
md+='\n## Complete reference inventory\n\nIncludes missing venues, ambiguous associations and out-of-scope records, so none disappear from the comparison.\n\n| Country | Expected record | Venue association | Layout IDs | Status |\n| --- | --- | --- | --- | --- |\n';
for(const r of rows)md+=`| ${cell(r.country)} | ${cell(r.name)} | ${r.trackId??r.candidateTrackIds?.join('; ')??''} | ${r.layoutIds.join('; ')} | ${r.status} |\n`;
await writeFile('Docs/09-racelogic-layout-gaps.md',md);console.log(summary);
