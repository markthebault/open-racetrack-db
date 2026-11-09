import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {reviewedNetworkGround,networkGroundIdealLine} from '../scripts/ideal-network-ground';
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
