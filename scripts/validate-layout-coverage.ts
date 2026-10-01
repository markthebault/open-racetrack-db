import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
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
