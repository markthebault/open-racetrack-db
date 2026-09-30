import {test} from 'node:test';import assert from 'node:assert/strict';
import {worldQuery,splitCountries} from '../scripts/world-discovery';
const marker=(code:string,id:number)=>({type:'area',id,tags:{'ISO3166-1':code}});
test('country markers partition geometry without assigning absent areas to a neighbour',()=>{
 const way={type:'way',id:4,nodes:[1,2]};const result=splitCountries([marker('US',10),way,marker('CA',20)],['US','CA','AQ']);
 assert.equal(result.get('US')!.length,2);assert.equal(result.get('CA')!.length,1);assert.deepEqual(result.get('AQ'),[]);
});
test('objects without a recognised country marker cannot be saved',()=>{
 assert.throws(()=>splitCountries([{type:'way',id:4}],['US']),/no country/);assert.throws(()=>splitCountries([marker('CA',20)],['US']),/Unrecognised/);
});
test('batch output merges identical repeated objects and rejects conflicting versions',()=>{
 const way={type:'way',id:4,version:1};assert.equal(splitCountries([marker('US',10),way,marker('US',10),way],['US']).get('US')!.length,2);
 assert.throws(()=>splitCountries([marker('US',10),way,{...way,version:2}],['US']),/Conflicting/);
});
test('country query accepts only bounded distinct ISO-style identifiers',()=>{
 assert.ok(worldQuery(['US','CA']).includes('foreach.countries'));
 assert.throws(()=>worldQuery(['US','US']));assert.throws(()=>worldQuery(['US;out;']));assert.throws(()=>worldQuery([]));
});
