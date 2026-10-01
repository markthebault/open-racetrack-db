import {test} from 'node:test';
import assert from 'node:assert/strict';
import {candidateLoops,components,exclusion} from '../scripts/candidates';
import type {Way} from '../scripts/route';
const loop:Way={id:1,version:3,nodes:[10,11,12,10],geometry:[{lon:0,lat:0},{lon:0.01,lat:0},{lon:0.01,lat:0.01},{lon:0,lat:0}],tags:{oneway:'yes'}};
test('course discovery retains source versions and honors reverse one-way travel',()=>{
 const forward=candidateLoops([loop]);assert.equal(forward.loops.length,1);assert.equal(forward.loops[0].directionKnown,true);assert.equal(forward.loops[0].segments[0].wayVersion,3);
 const reverse=candidateLoops([{...loop,tags:{oneway:'-1'}}]);assert.equal(reverse.loops[0].segments[0].fromIndex,3);assert.equal(reverse.loops[0].segments[0].toIndex,0);
});
test('coincident coordinates do not connect separate source node identities',()=>{
 const other={...loop,id:2,nodes:[20,21,22,20]};assert.equal(components([loop,other]).length,2);
});
test('a repeated junction within one source way exposes both joined loops',()=>{
 const joined:Way={id:9,version:2,nodes:[1,2,3,2,4,1],geometry:[{lon:0,lat:0},{lon:.01,lat:0},{lon:.015,lat:.01},{lon:.01,lat:0},{lon:0,lat:.01},{lon:0,lat:0}],tags:{oneway:'yes'}};
 const found=candidateLoops([joined]);assert.equal(found.truncated,false);assert.equal(found.loops.length,2);
 assert.ok(found.loops.some(l=>l.segments.length===1&&l.segments[0].fromIndex===1&&l.segments[0].toIndex===3));
 assert.ok(found.loops.some(l=>l.segments.length===2&&l.segments[0].toIndex===1&&l.segments[1].fromIndex===3));
});
test('duplicate ways do not exhaust discovery or hide a distinct branch',()=>{
 const copies=Array.from({length:10},(_,i)=>({...loop,id:i+1}));
 const branch:Way={id:20,version:1,nodes:[11,13,10],geometry:[{lon:.01,lat:0},{lon:0,lat:.01},{lon:0,lat:0}],tags:{oneway:'yes'}};
 const found=candidateLoops([...copies,branch],4);assert.equal(found.truncated,false);assert.equal(found.loops.length,2);assert.ok(found.loops.some(l=>l.segments.some(s=>s.wayId===20)));
 const distinctNodes={...loop,id:30,nodes:[20,21,22,20]};assert.equal(candidateLoops([loop,distinctNodes]).loops.length,2);
});
test('filter retains a named racing corner and excludes pit lanes and karting',()=>{
 assert.equal(exclusion({...loop,tags:{name:'Paddock Hill Bend'}}),undefined);
 for(const value of ['pitlane','pit_lane','pit lane'])for(const key of ['service','raceway'])assert.ok(exclusion({...loop,tags:{[key]:value}}));
 assert.ok(exclusion({...loop,tags:{name:'Pit lane'}}));assert.ok(exclusion({...loop,tags:{name:'Pit Road'}}));assert.ok(exclusion({...loop,tags:{name:'Сочинский картодром'}}));assert.ok(exclusion({...loop,tags:{name:'Sand Dune Course'}}));assert.ok(exclusion({...loop,tags:{sport:'karting'}}));assert.ok(exclusion({...loop,tags:{area:'yes'}}));
});
test('unknown travel direction remains explicit and bounded enumeration reports truncation',()=>{
 assert.equal(candidateLoops([{...loop,tags:{}}]).loops[0].directionKnown,false);
 assert.equal(candidateLoops([loop],0).truncated,true);
});

test('short permanent circuits can be selected with a scope-specific threshold',()=>{
 const short={...loop,geometry:loop.geometry.map(p=>({lon:p.lon/5,lat:p.lat/5}))};
 assert.equal(candidateLoops([short]).loops.length,0);assert.equal(candidateLoops([short],400,500).loops.length,1);
});

test('long road circuits are not silently excluded by a 30 km ceiling',()=>{
 const long={...loop,geometry:loop.geometry.map(p=>({lon:p.lon*20,lat:p.lat*20}))};
 const found=candidateLoops([long]);assert.equal(found.truncated,false);assert.equal(found.loops.length,1);assert.ok(found.loops[0].lengthM>30000);
});
