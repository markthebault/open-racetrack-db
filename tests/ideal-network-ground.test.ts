import {reviewedNetworkPavement} from '../scripts/reviewed-network-pavement';
import {pathCrossings} from '../src/path-crossings';
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {reviewedNetworkGround,networkGroundIdealLine,networkFootprintBranches} from '../scripts/ideal-network-ground';
import {groundSegmentClearanceM} from '../src/ribbon-surface';import {assertSeparateSimpleRings} from '../src/boundary-path';import {equal} from '../src/geo';import {validateLayout,type Layout} from '../schemas/data';
const file='data/united-states/us-belle-isle-c12938f2/layouts/belle-isle-gp.geojson',load=()=>JSON.parse(readFileSync(file,'utf8')) as Layout,pin=JSON.parse(readFileSync('sources/research/ideal-network-reviews.json','utf8'))[0];
test('reviewed network islands preserve source data and each stored branch with full segment clearance',()=>{
 const d=load(),before=structuredClone(d),result=networkGroundIdealLine(d,pin),ideal=d.features.find(f=>f.properties.role==='ideal')!;
 assert.deepEqual(d,before);assert.deepEqual(ideal.geometry,{type:'MultiLineString',coordinates:result.branches});
 assert.equal(result.branches.length,2);assert.equal(equal(result.branches[0][0],result.branches[0].at(-1)!),true);assert.equal(equal(result.branches[1][0],result.branches[1].at(-1)!),false);
 for(const [i,path] of result.branches.entries()){const ps=path.map(result.project.to);assertSeparateSimpleRings([ps],i===0);for(let j=1;j<ps.length;j++)assert.ok(groundSegmentClearanceM(result.footprint,ps[j-1],ps[j])>=2.05/2+.5);}
 const track=JSON.parse(readFileSync('data/united-states/us-belle-isle-c12938f2/track.json','utf8'));validateLayout(d,track,d.metadata.layoutId);
 const missing=structuredClone(d),f=missing.features.find(f=>f.properties.role==='ideal')!;if(f.properties.role!=='ideal')throw Error();delete f.properties.networkReview;assert.throws(()=>validateLayout(missing,track,d.metadata.layoutId),/matching branch/);
 const wrongLicense=structuredClone(d),g=wrongLicense.features.find(f=>f.properties.role==='ideal')!;if(g.properties.role!=='ideal')throw Error();g.properties.borderLicenses=['LicenseRef-Track-Borders'];assert.throws(()=>validateLayout(wrongLicense,track,d.metadata.layoutId),/licences disagree/);
});
test('network island proof rejects stale source identity, missing vertices, duplicated indices and long joins',()=>{
 const d=load();for(const field of ['sourceBorderSha256','traceSha256'])assert.throws(()=>reviewedNetworkGround(d,{...pin,[field]:'0'.repeat(64)}),/changed/);
 const duplicate=structuredClone(pin);duplicate.innerRings[1][1]=[0,108];assert.throws(()=>reviewedNetworkGround(d,duplicate),/duplicated|discarded/);
 const missing=structuredClone(pin);missing.innerRings[0][0]=[109,439];assert.throws(()=>reviewedNetworkGround(d,missing),/every unique|two metres/);
 const long=structuredClone(pin);long.innerRings=[[[108,200],[202,439]],[[440,445],[0,106]]];long.discardedInnerVertices=[107,201];assert.throws(()=>reviewedNetworkGround(d,long),/two metres/);
 const unreviewed=structuredClone(pin);unreviewed.junctionOverlayViewed=false;assert.throws(()=>reviewedNetworkGround(d,unreviewed));
});

test('Porsche source-slice reconstruction retains all three walks and the reviewed paved junction crossing',()=>{
 const file='data/germany/de-porsche-leipzig-a-1a7399b8/layouts/porsche-leipzig-a.geojson',d=JSON.parse(readFileSync(file,'utf8')) as Layout,before=structuredClone(d),review=JSON.parse(readFileSync('sources/research/ideal-network-reviews.json','utf8')).find((p:{trackId:string})=>p.trackId===d.metadata.trackId),result=networkGroundIdealLine(d,review),ideal=d.features.find(f=>f.properties.role==='ideal')!;
 assert.deepEqual(d,before);assert.deepEqual(ideal.geometry,{type:'MultiLineString',coordinates:result.branches});assert.equal(result.branches.length,3);
 for(const [i,path] of result.branches.entries()){
  const ps=path.map(result.project.to),expected=pathCrossings(result.source[i].map(result.project.to),i===0),crossings=pathCrossings(ps,i===0);
  assert.equal(equal(path[0],path.at(-1)!),i===0);assert.equal(crossings.length,expected.length);
  if(i===0){assert.equal(crossings.length,1);assert.equal(crossings[0].kind,'crossing');assert.ok(Math.hypot(crossings[0].point[0]-expected[0].point[0],crossings[0].point[1]-expected[0].point[1])<20);}else assertSeparateSimpleRings([ps],false);
  for(let j=1;j<ps.length;j++)assert.ok(groundSegmentClearanceM(result.footprint,ps[j-1],ps[j])>=2.05/2+.5+.019);
 }
 const ground=reviewedNetworkPavement(d,review);assert.equal(ground.pin.islands.length,6);assert.equal(ground.pin.discarded.length,15);assert.ok(ground.joins.some(j=>j.lengthM>30));assert.ok(ground.joins.filter(j=>j.lengthM>2).every(j=>j.supportDeviationM<=.1));
 assert.throws(()=>networkFootprintBranches(result.source,result.project,result.footprint),/junction review/);
});
test('network pavement proof rejects unsupported reconnections, misclassified omissions and stale sources',()=>{
 const d=JSON.parse(readFileSync('data/germany/de-porsche-leipzig-a-1a7399b8/layouts/porsche-leipzig-a.geojson','utf8')) as Layout,review=JSON.parse(readFileSync('sources/research/ideal-network-reviews.json','utf8')).find((p:{trackId:string})=>p.trackId===d.metadata.trackId);
 for(const field of ['sourceBorderSha256','traceSha256'])assert.throws(()=>reviewedNetworkPavement(d,{...review,[field]:'0'.repeat(64)}),/changed/);
 const unsupported=structuredClone(review);unsupported.outerRing[0][1]=30;unsupported.discarded.push({edge:'outer',index:31,kind:'duplicate-junction'});assert.throws(()=>reviewedNetworkPavement(d,unsupported),/source-edge support/);
 const missing=structuredClone(review);missing.discarded=missing.discarded.filter((p:{edge:string;index:number})=>!(p.edge==='outer'&&p.index===34));assert.throws(()=>reviewedNetworkPavement(d,missing),/every source vertex/);
 const wrongKind=structuredClone(review);wrongKind.discarded.find((p:{edge:string;index:number})=>p.edge==='inner'&&p.index===58).kind='duplicate-junction';assert.throws(()=>reviewedNetworkPavement(d,wrongKind),/within two metres/);
 assert.throws(()=>reviewedNetworkPavement(d,{...review,sourceJunctionCrossingsConfirmed:false}));
});
