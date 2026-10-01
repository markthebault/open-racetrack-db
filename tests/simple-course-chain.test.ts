import {test} from 'node:test';import assert from 'node:assert/strict';
import {simpleCourseChain} from '../scripts/simple-course-chain';import {assemble,type Way} from '../scripts/route';
const way=(id:number,nodes:number[]):Way=>({id,version:7,nodes,geometry:nodes.map(n=>({lon:n/1000,lat:50}))});
test('an unordered open course retains exact node connectivity and pinned versions',()=>{
 const ways=[way(2,[3,2]),way(1,[1,2])],segments=simpleCourseChain(ways)!;
 assert.equal(segments.length,2);assert.ok(segments.every(s=>s.wayVersion===7));const trace=assemble(ways,segments,false);assert.equal(trace.length,3);assert.notDeepEqual(trace[0],trace.at(-1));
});
test('branched, disconnected and duplicate source networks are rejected',()=>{
 const a=way(1,[1,2]),b=way(2,[2,3]);assert.equal(simpleCourseChain([a,b,way(3,[2,4])]),undefined);
 assert.equal(simpleCourseChain([a,b,way(3,[4,5]),way(4,[5,4])]),undefined);assert.equal(simpleCourseChain([a,a]),undefined);assert.equal(simpleCourseChain([way(1,[1,2,3]),way(2,[3,2,4])]),undefined);
});
