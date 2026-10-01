import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTimingXml} from '../scripts/reference-timing';
import type {LayoutCoverage} from '../src/layout-coverage';
const fixture=(extra='')=>`<referenceStartFinishDatabase><country name="Germany"><circuits><circuit name="Fixture GP"><length>999999</length><min>do-not-use</min><splitinfo><startFinish><long>420</long><lat>3000</lat></startFinish>${extra}</splitinfo></circuit></circuits></country></referenceStartFinishDatabase>`;
test('timing reader accepts singleton countries and circuits and ignores boundary fields',()=>{
 const r=parseTimingXml(fixture());assert.deepEqual(r,[{id:'Germany/Fixture GP',country:'Germany',name:'Fixture GP',gates:[{role:'start_finish',point:[7,50]}]}]);
});
test('course distance is scalar metadata and never imports boundary fields',()=>{const [r]=parseTimingXml(fixture().replace('<length>999999</length>','<length>5137</length><max>boundary</max>'));assert.equal(r.nominalLengthM,5137);assert.deepEqual(Object.keys(r).sort(),['country','gates','id','name','nominalLengthM']);});
test('separate timing records retain start and finish roles',()=>{
 const [r]=parseTimingXml(fixture('<Finish><long>421</long><lat>3001</lat></Finish>'));assert.deepEqual(r.gates.map(g=>g.role),['start','finish']);
});
test('invalid timing GPS and duplicate reference identities fail',()=>{
 assert.throws(()=>parseTimingXml(fixture().replace('<long>420','<long>NaN')),/invalid timing GPS/);
 const xml=fixture().replace('</circuits>','<circuit name="Fixture GP"><splitinfo><startFinish><long>420</long><lat>3000</lat></startFinish></splitinfo></circuit></circuits>');assert.throws(()=>parseTimingXml(xml),/Duplicate/);
});
test('every reference is accounted for and mapped layouts exist without public GPS fields',()=>{
 const report:LayoutCoverage=JSON.parse(readFileSync('data/layout-coverage.json','utf8')),index=JSON.parse(readFileSync('data/index.json','utf8'));
 assert.equal(report.records.length,1007);assert.equal(new Set(report.records.map(r=>r.id)).size,1007);assert.equal(report.venues.length,index.tracks.length);
 assert.equal(Object.entries(report.summary).filter(([k])=>!['referenceRecords','venuesChecked'].includes(k)).reduce((s,[,v])=>s+v,0),1007);
 for(const r of report.records){assert.deepEqual(Object.keys(r).filter(k=>/^(point|gates|coordinates|length|bounds|min|max)$/i.test(k)),[]);if(r.trackId){const entry=index.tracks.find((t:any)=>t.id===r.trackId);assert.ok(entry);const track=JSON.parse(readFileSync(`data/${entry.file}`,'utf8'));for(const id of r.layoutIds)assert.ok(track.layouts.some((l:any)=>l.id===id));}}
 for(const venue of report.venues)if(venue.expectedRecordCount&&venue.actualLayoutCount!==venue.expectedRecordCount)assert.equal(venue.status,'gap');
 for(const id of ['br-autodromo-velo-citta-478876097','it-fiorano-circuit-35073932','us-portland-international-raceway-5510199'])assert.equal(report.venues.find(v=>v.trackId===id)?.actualLayoutCount,1);
 const nurb=report.records.filter(r=>r.trackId==='de-nurburgring');assert.equal(nurb.length,9);assert.ok(nurb.every(r=>r.status==='draft-mapped'));assert.equal(new Set(nurb.flatMap(r=>r.layoutIds)).size,9);
 const gp=JSON.parse(readFileSync('data/germany/nurburgring/layouts/grand-prix.geojson','utf8'));assert.ok(gp.metadata.lengthM>5000&&gp.metadata.lengthM<5300);
 const sprint=JSON.parse(readFileSync('data/germany/nurburgring/layouts/sprintstrecke.geojson','utf8'));assert.ok(sprint.metadata.lengthM>3500&&sprint.metadata.lengthM<3700);
});

 test('normalizing names preserves course qualifiers',async()=>{const {normalizeLayoutName:n}=await import('../scripts/layout-matching');assert.notEqual(n('Dubai Autodrome International'),n('Dubai Autodrome GP'));assert.notEqual(n('Circuit International'),n('Circuit National'));assert.notEqual(n('Nurburgring GP'),n('Nurburgring GP without MB Arena'));assert.equal(n('Bedford Autodrome East Circuit'),n('Bedford Autodrome East'));});

 test('all supplied layout entries are registered exactly once, including unavailable geometry',()=>{const registry=JSON.parse(readFileSync('sources/reference/catalogue.json','utf8')),index=JSON.parse(readFileSync('data/index.json','utf8'));assert.equal(registry.records.length,1007);assert.equal(new Set(registry.records.map((r:any)=>r.referenceId)).size,1007);for(const r of registry.records){const e=index.tracks.find((t:any)=>t.id===r.trackId);assert.ok(e);const t=JSON.parse(readFileSync(`data/${e.file}`,'utf8'));const l=t.layouts.find((l:any)=>l.id===r.layoutId);assert.equal(l?.referenceId,r.referenceId);assert.equal(l?.name,r.name);assert.equal(l.file!==null,r.geometryAvailable);if(l.file===null)assert.ok(l.missingGeometryReason);}});
