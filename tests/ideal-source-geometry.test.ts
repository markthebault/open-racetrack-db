import {serializeLayout} from '../scripts/layout-borders';
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {readFile} from 'node:fs/promises';import {dirname,join} from 'node:path';
import {sourceGeometryIdealLine,sourceGeometryIdealFeature} from '../scripts/ideal-source-geometry';import {composeIdealLine} from '../scripts/compose-ideal-lines';import {groundSegmentClearanceM} from '../src/ribbon-surface';import {validateLayout,layoutSchema,geometryPaths,type Layout} from '../schemas/data';
const load=(p:string)=>JSON.parse(readFileSync(p,'utf8')),pins=load('sources/research/ideal-source-geometry-reviews.json'),files=['data/united-kingdom/gb-prodrive-bf598a18/layouts/prodrive.geojson','data/united-states/road-atlanta-9292566/layouts/road-atlanta-short.geojson'];
test('qualified source estimates retain every original feature and fit the complete cleaned source footprint',()=>{
 for(const file of files){const d=load(file) as Layout,before=structuredClone(d),pin=pins.find((p:{layoutId:string})=>p.layoutId===d.metadata.layoutId),result=sourceGeometryIdealLine(d,pin),feature=sourceGeometryIdealFeature(d,pin);
  assert.deepEqual(d,before);assert.deepEqual(d.features.find(f=>f.properties.role==='ideal'),feature);assert.equal(feature.properties.role,'ideal');if(feature.properties.role!=='ideal')throw Error();assert.equal(feature.properties.qualification,'unverified-source-geometry');
  const ps=result.coordinates.map(result.project.to);for(let i=1;i<ps.length;i++)assert.ok(groundSegmentClearanceM(result.footprint,ps[i-1],ps[i])>=2.05/2+.5+.019);
  const track=load(join(dirname(dirname(file)),'track.json'));validateLayout(d,track,d.metadata.layoutId);const missing=structuredClone(d),f=missing.features.find(f=>f.properties.role==='ideal')!;if(f.properties.role!=='ideal')throw Error();delete f.properties.qualification;assert.throws(()=>validateLayout(missing,track,d.metadata.layoutId),/qualified independent review/);
 }
});
test('qualified estimates reject stale source geometry, rights, deletions and relaxed trust limits',()=>{
 const d=load(files[0]) as Layout,pin=pins.find((p:{layoutId:string})=>p.layoutId===d.metadata.layoutId);
 for(const field of ['sourceBorderSha256','traceSha256'])assert.throws(()=>sourceGeometryIdealLine(d,{...pin,[field]:'0'.repeat(64)}),/changed/);
 assert.throws(()=>sourceGeometryIdealLine(d,{...pin,sourceSearchLimitM:20}));assert.throws(()=>sourceGeometryIdealLine(d,{...pin,lateralOptimizationLimitM:10}));
 assert.throws(()=>sourceGeometryIdealLine(d,{...pin,removed:[...pin.removed,...pin.removed]}),/duplicated/);
 const bad=structuredClone(pin);bad.removed[0].coordinate[0]+=.00001;assert.throws(()=>sourceGeometryIdealLine(d,bad),/original unique vertex/);
 const rights=structuredClone(d);rights.features.find(f=>f.properties.role==='outer')!.properties={role:'outer',sourceIds:[],license:'LicenseRef-Component-Borders'};assert.throws(()=>sourceGeometryIdealLine(rights,pin),/rights changed/);
});
test('Road Atlanta composition carries the qualified component and rejects altered child lines',()=>{
 const dir='data/united-states/road-atlanta-9292566',d=load(dir+'/layouts/road-atlanta-combo.geojson') as Layout,sources=d.metadata.borderComposition!.map(c=>load(dir+'/layouts/'+c.sourceLayoutId+'.geojson') as Layout),feature=composeIdealLine(d,sources);
 assert.deepEqual(d.features.find(f=>f.properties.role==='ideal'),feature);assert.equal(feature!.properties.qualification,'unverified-source-geometry');assert.equal(feature!.properties.sourceGeometryReviews![0].layoutId,'road-atlanta-short');assert.equal(feature!.geometry.coordinates.length,3);assert.equal(serializeLayout(layoutSchema.parse(d)),readFileSync(dir+'/layouts/road-atlanta-combo.geojson','utf8'));
 const changed=structuredClone(sources),short=changed.find(d=>d.metadata.layoutId==='road-atlanta-short')!,ideal=short.features.find(f=>f.properties.role==='ideal')!;if(ideal.properties.role!=='ideal')throw Error();delete ideal.properties.qualification;assert.equal(composeIdealLine(d,changed),undefined);
});
test('every indexed layout with both boundaries has exactly one stored calculated ideal feature',async()=>{
 const index=load('data/index.json'),report=load('data/ideal-lines-coverage.json'),records=new Map(report.records.map((r:{file:string})=>[r.file,r]));let count=0;
 assert.equal(records.size,report.records.length);assert.equal(report.unavailable,0);
 for(const entry of index.tracks){const track=load('data/'+entry.file),dir=dirname('data/'+entry.file);for(const layout of track.layouts){if(!layout.file)continue;const file=join(dir,layout.file),d=JSON.parse(await readFile(file,'utf8')) as Layout;if(!['inner','outer'].every(role=>d.features.some(f=>f.properties.role===role)))continue;
  count++;const row=records.get(file) as {status:string}|undefined;assert.equal(row?.status,'generated',file);const ideal=d.features.filter(f=>f.properties.role==='ideal');assert.equal(ideal.length,1,file);assert.ok(geometryPaths(ideal[0].geometry).every(path=>path.length>=2&&path.every(p=>p.every(Number.isFinite))),file);
 }}assert.equal(report.borderedLayouts,count);assert.equal(report.generated,count);assert.equal(records.size,count);
});
