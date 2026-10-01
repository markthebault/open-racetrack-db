import {test} from 'node:test';
import assert from 'node:assert/strict';
import {anchoredCourses} from '../scripts/anchored-courses';
import {assemble,type Way} from '../scripts/route';
import {length} from '../src/geo';
const way=(id:number,nodes:number[],coordinates:[number,number][]):Way=>({id,version:1,nodes,geometry:coordinates.map(([lon,lat])=>({lon,lat})),tags:{highway:'raceway',oneway:'yes'}});
const a=way(1,[1,2],[[7,50],[7.001,50]]),b=way(2,[2,3,1],[[7.001,50],[7.0005,50.001],[7,50]]);
test('anchored search returns an exact pinned cycle and deduplicates rotations',()=>{
 const nominal=length(assemble([a,b],[{wayId:1,wayVersion:1,fromIndex:0,toIndex:1},{wayId:2,wayVersion:1,fromIndex:0,toIndex:2}],true));
 const found=anchoredCourses([a,b],[7.0005,50],nominal,{toleranceM:1,separationM:1});assert.equal(found.unique,true);assert.equal(found.candidates.length,1);assert.equal(found.candidates[0].lengthM,nominal);
});
test('equally long distinct configurations remain ambiguous',()=>{
 const c=way(3,[2,4,1],[[7.001,50],[7.0005,49.999],[7,50]]),nominal=length(assemble([a,b],[{wayId:1,wayVersion:1,fromIndex:0,toIndex:1},{wayId:2,wayVersion:1,fromIndex:0,toIndex:2}],true));
 const found=anchoredCourses([a,b,c],[7.0005,50],nominal,{toleranceM:2,separationM:2});assert.equal(found.unique,false);assert.equal(found.candidates.length,2);
});
test('duplicate source labels retain a unique geometric route',()=>{
 const nominal=length(assemble([a,b],[{wayId:1,wayVersion:1,fromIndex:0,toIndex:1},{wayId:2,wayVersion:1,fromIndex:0,toIndex:2}],true));
 const found=anchoredCourses([a,b,{...a,id:10},{...b,id:11}],[7.0005,50],nominal,{toleranceM:1,separationM:1});assert.equal(found.truncated,false);assert.equal(found.unique,true);assert.equal(found.candidates.length,1);
});
test('missing node connectivity, excessive displacement and exhausted search never count as unique',()=>{
 const c={...b,nodes:[20,3,1]};assert.equal(anchoredCourses([a,c],[7.0005,50],310).unique,false);assert.equal(anchoredCourses([a,b],[7.1,50],310).unique,false);assert.equal(anchoredCourses([a,b],[7.0005,50],310,{maximumSteps:0}).unique,false);
});

test('a depth limit marks the search incomplete instead of certifying uniqueness',()=>{
 const c=way(3,[2,4],[[7.001,50],[7.0005,49.999]]),d=way(4,[4,1],[[7.0005,49.999],[7,50]]);
 const nominal=length(assemble([a,b],[{wayId:1,wayVersion:1,fromIndex:0,toIndex:1},{wayId:2,wayVersion:1,fromIndex:0,toIndex:2}],true));
 const found=anchoredCourses([a,b,c,d],[7.0005,50],nominal,{toleranceM:2,separationM:2,maximumSegments:1});assert.equal(found.truncated,true);assert.equal(found.unique,false);
});
