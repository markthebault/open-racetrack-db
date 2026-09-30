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
test('filter retains a named racing corner and excludes pit lanes and karting',()=>{
 assert.equal(exclusion({...loop,tags:{name:'Paddock Hill Bend'}}),undefined);
 assert.ok(exclusion({...loop,tags:{name:'Pit lane'}}));assert.ok(exclusion({...loop,tags:{sport:'karting'}}));assert.ok(exclusion({...loop,tags:{area:'yes'}}));
});
test('unknown travel direction remains explicit and bounded enumeration reports truncation',()=>{
 assert.equal(candidateLoops([{...loop,tags:{}}]).loops[0].directionKnown,false);
 assert.equal(candidateLoops([loop],0).truncated,true);
});
