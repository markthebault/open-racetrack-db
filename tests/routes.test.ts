import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assemble,type Way} from '../scripts/route';
import {localGate} from '../src/local-timing';
import type {Position} from '../src/geo';

test('nearby endpoints cannot bridge disconnected OSM node IDs',()=>{
 const ways:Way[]=[{id:1,version:1,nodes:[10,11],geometry:[{lon:7,lat:48},{lon:7.001,lat:48}]},{id:2,version:1,nodes:[12,10],geometry:[{lon:7.001,lat:48},{lon:7,lat:48}]}];
 assert.throws(()=>assemble(ways,[{wayId:1,wayVersion:1,fromIndex:0,toIndex:1},{wayId:2,wayVersion:1,fromIndex:0,toIndex:1}],true),/disconnected/);
});
test('stale source versions cannot silently change a recipe',()=>{
 const way:Way={id:1,version:2,nodes:[10,11],geometry:[{lon:7,lat:48},{lon:7.001,lat:48}]};
 assert.throws(()=>assemble([way],[{wayId:1,wayVersion:1,fromIndex:0,toIndex:1}],false),/version mismatch/);
});
test('private timing keeps the supplied GPS center without changing the public trace',()=>{
 const trace:Position[]=[[7,48],[7.01,48]],point:Position=[7.005,48.0001],before=structuredClone(trace);
 const gate=localGate(point,trace);assert.ok(gate.coordinates);
 const center=gate.coordinates.reduce((s,p)=>[s[0]+p[0]/2,s[1]+p[1]/2] as Position,[0,0] as Position);
 assert.ok(Math.abs(center[0]-point[0])<1e-7&&Math.abs(center[1]-point[1])<1e-7);
 assert.deepEqual(trace,before);
});
test('misaligned private timing is omitted while the trace remains usable',()=>{
 const trace:Position[]=[[7,48],[7.01,48]];
 const gate=localGate([7.005,48.01],trace);assert.equal(gate.coordinates,null);assert.ok(gate.anchor.displacementM>100);
});

test('reference sources cannot supply coordinates even with a permissive license label',async()=>{
 const {validateTrack,validateLayout}=await import('../schemas/data');
 const track=validateTrack({schemaVersion:1,id:'fixture',name:'Fixture',aliases:[],country:{code:'US',name:'United States',slug:'united-states'},location:[0,0],sourceIds:['reference'],defaultLayoutId:'main',layouts:[{id:'main',name:'Fixture',file:'layouts/main.geojson'}],sources:[{id:'reference',type:'reference',title:'Identity only',url:'https://example.org/',license:'ODbL-1.0',retrievedAt:'2026-09-30T00:00:00Z',evidenceNote:'Identity-only reference'}]});
 assert.throws(()=>validateLayout({type:'FeatureCollection',bbox:[0,0,0.01,0.01],metadata:{schemaVersion:1,trackId:'fixture',layoutId:'main',license:'ODbL-1.0',attribution:'Fixture',closed:true,geometryStatus:'draft',timingStatus:'missing',timingMode:'shared',lengthM:1,reviewedAt:null,notes:[]},features:[{type:'Feature',id:'trace',properties:{role:'trace',sourceIds:['reference']},geometry:{type:'LineString',coordinates:[[0,0],[0.01,0],[0.01,0.01],[0,0]]}}]},track,'main'),/reference-only/);
});
