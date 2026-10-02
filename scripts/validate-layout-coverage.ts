import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {assemble} from './route';
import {validateSelectionSource} from './selection-source';
import {length} from '../src/geo';
import {readNetworkSelection} from './network-selection';
import {buildCourseNetwork} from './course-network';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {buildImageryCourse,imageryCourseSchema,validateImageryRaster} from './imagery-course';
import type {LayoutCoverage} from '../src/layout-coverage';
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const report:LayoutCoverage=await read('data/layout-coverage.json'),index=await read('data/index.json');
assert.equal(report.schemaVersion,1);assert.match(report.xmlSha256,/^[a-f0-9]{64}$/);
assert.equal(report.records.length,report.summary.referenceRecords);assert.equal(new Set(report.records.map(r=>r.id)).size,report.records.length);
assert.equal(report.venues.length,index.tracks.length);assert.equal(new Set(report.venues.map(v=>v.trackId)).size,index.tracks.length);assert.equal(report.summary.venuesChecked,index.tracks.length);
const statuses:Record<string,keyof LayoutCoverage['summary']>={'draft-mapped':'draftMapped','missing-layout':'unmappedLayouts','missing-venue':'missingVenues','ambiguous-venue':'ambiguousVenues','out-of-scope':'outOfScope'};
for(const [status,key] of Object.entries(statuses))assert.equal(report.summary[key],report.records.filter(r=>r.status===status).length);
for(const r of report.records){assert.ok(r.status in statuses);assert.deepEqual(Object.keys(r).filter(k=>/^(point|gates|coordinates|length|bounds|min|max)$/i.test(k)),[]);assert.ok(r.remainingWork.length);}
for(const entry of index.tracks){const track=await read(`data/${entry.file}`),venue=report.venues.find(v=>v.trackId===entry.id);assert.ok(venue);assert.equal(venue.actualLayoutCount,track.layouts.length);assert.equal(venue.actualTraceCount,track.layouts.filter((l:any)=>l.file!==null).length);const records=report.records.filter(r=>r.trackId===entry.id&&r.status!=='out-of-scope');assert.equal(venue.expectedRecordCount,records.length);assert.equal(venue.mappedRecordCount,records.filter(r=>r.layoutIds.length).length);for(const r of records)for(const id of r.layoutIds)assert.ok(track.layouts.some((l:any)=>l.id===id));}
for(const r of report.records)if(r.trackId)assert.ok(index.tracks.some((t:any)=>t.id===r.trackId));
console.log(`Validated every public venue and ${report.records.length} reference layout records.`);

const catalogue=await read('sources/reference/catalogue.json');assert.equal(catalogue.records.length,report.records.length);assert.equal(new Set(catalogue.records.map((r:any)=>r.referenceId)).size,report.records.length);for(const r of catalogue.records){const e=index.tracks.find((t:any)=>t.id===r.trackId);assert.ok(e);const t=await read(`data/${e.file}`),layout=t.layouts.find((l:any)=>l.id===r.layoutId);assert.equal(layout?.referenceId,r.referenceId);assert.equal(layout?.name,r.name);assert.equal(layout.file!==null,r.geometryAvailable);}

const research=await read('data/layout-gap-research.json');assert.equal(research.schemaVersion,1);assert.equal(research.xmlSha256,report.xmlSha256);
const expectedGaps=catalogue.records.filter((r:any)=>!r.geometryAvailable).map((r:any)=>r.referenceId).sort();
assert.deepEqual(research.records.map((r:any)=>r.referenceId).sort(),expectedGaps);assert.equal(new Set(research.records.map((r:any)=>r.referenceId)).size,research.records.length);
const reasons:Record<string,number>={};for(const row of research.records){const registration=catalogue.records.find((r:any)=>r.referenceId===row.referenceId);assert.equal(row.trackId,registration.trackId);assert.equal(row.layoutId,registration.layoutId);assert.ok(row.nextStep);assert.deepEqual(Object.keys(row).filter(k=>/^(point|gates|coordinates|lat|lon|latitude|longitude|bounds)$/i.test(k)),[]);reasons[row.reason]=(reasons[row.reason]??0)+1;}
assert.deepEqual(research.summary,reasons);console.log(`Validated source limitations for all ${research.records.length} remaining geometry gaps.`);

const selections=await read('sources/reference/course-selections.json');
assert.equal(selections.schemaVersion,1);
assert.equal(new Set(selections.records.map((s:any)=>s.referenceId)).size,selections.records.length);
for(const selection of selections.records){
 if(selection.endpointToleranceM!==undefined){assert.equal(selection.closed,false);assert.ok(Number.isFinite(selection.endpointToleranceM)&&selection.endpointToleranceM>=0&&selection.endpointToleranceM<=50);assert.ok(selection.endpointEvidence?.trim());}
 const registration=catalogue.records.find((r:any)=>r.referenceId===selection.referenceId);assert.ok(registration?.geometryAvailable);
 const recipe=await read(`sources/${registration.trackId}/layouts/${registration.layoutId}.json`);
 assert.deepEqual(recipe.segments,selection.segments);assert.equal(recipe.closed,selection.closed);
 const snapshot=await read(`sources/${registration.trackId}/${recipe.snapshotFile}`);
 const trace=assemble(snapshot.elements,recipe.segments,recipe.closed);
 assert.ok(Math.abs(length(trace)-selection.expectedLengthM)<.15);
 validateSelectionSource(snapshot.elements,selection);
 const entry=index.tracks.find((t:any)=>t.id===registration.trackId),track=await read(`data/${entry.file}`);
 assert.ok(track.sources.some((s:any)=>s.type==='reference'&&s.url===selection.identificationUrl));
}
console.log(`Validated ${selections.records.length} explicitly identified course selections against exact source recipes.`);

const networks=await read('sources/reference/course-network-selections.json');
assert.equal(networks.schemaVersion,1);assert.equal(new Set(networks.records.map((s:any)=>s.referenceId)).size,networks.records.length);
for(const selection of networks.records){
 const registration=catalogue.records.find((r:any)=>r.referenceId===selection.referenceId);assert.ok(registration?.geometryAvailable);
 const entry=index.tracks.find((t:any)=>t.id===registration.trackId),track=await read(`data/${entry.file}`);
 const recipe=await read(`sources/${track.id}/layouts/${registration.layoutId}.json`),network=await readNetworkSelection(track.id,selection.layoutIds);
 assert.deepEqual(recipe.paths,network.paths);assert.deepEqual(recipe.components,network.components);
 const snapshot=await read(`sources/${track.id}/${recipe.snapshotFile}`),data=buildCourseNetwork(recipe,snapshot.elements,track);
 assert.ok(Math.abs(data.metadata.lengthM-selection.expectedLengthM)<.15);
 assert.ok(selection.evidence&&track.sources.some((s:any)=>s.type==='reference'&&s.url===selection.identificationUrl));
}
console.log(`Validated ${networks.records.length} identified aggregate networks and their component provenance.`);

const imagery=await read('sources/reference/imagery-course-selections.json');
assert.equal(imagery.schemaVersion,1);assert.equal(new Set(imagery.records.map((s:any)=>s.referenceId)).size,imagery.records.length);
for(const selection of imagery.records){
 const registration=catalogue.records.find((r:any)=>r.referenceId===selection.referenceId);assert.ok(registration?.geometryAvailable);
 const entry=index.tracks.find((t:any)=>t.id===registration.trackId),track=await read(`data/${entry.file}`);
 const recipe=await read(`sources/${track.id}/layouts/${registration.layoutId}.json`);
 assert.equal(selection.sourcePath,`sources/${track.id}/${recipe.snapshotFile}`);
 const bytes=await readFile(selection.sourcePath),source=imageryCourseSchema.parse(JSON.parse(bytes.toString()));
 const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
 assert.equal(hash(bytes),selection.snapshotSha256);assert.equal(recipe.snapshotSha256,selection.snapshotSha256);
 const raster=await readFile(`${dirname(selection.sourcePath)}/${source.imageryFile}`);
 assert.equal(hash(raster),source.imagerySha256);assert.equal(source.imagerySha256,selection.imagerySha256);validateImageryRaster(source,raster);
 const data=buildImageryCourse(recipe,source,track);assert.ok(Math.abs(data.metadata.lengthM-selection.expectedLengthM)<.15);
 assert.equal(source.identificationUrl,selection.identificationUrl);assert.equal(source.evidence,selection.evidence);
 assert.ok(track.sources.some((s:any)=>s.type==='reference'&&s.url===selection.identificationUrl));
}
console.log(`Validated ${imagery.records.length} independently digitized imagery courses, raster hashes and georeferencing.`);
