import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildCourseNetwork,type NetworkRecipe} from '../scripts/course-network';
import {networkLength,type Position} from '../src/geo';
import {validateLayout,type Track} from '../schemas/data';
import type {Way} from '../scripts/route';
const way=(id:number,nodes:number[]):Way=>({id,version:3,nodes,geometry:nodes.map(n=>({lon:n/1000,lat:50}))});
const track:Track={schemaVersion:1,id:'test',name:'Test',aliases:[],country:{code:'GB',name:'UK',slug:'uk'},location:[0,50],sourceIds:['osm'],defaultLayoutId:'combo',layouts:[{id:'combo',name:'Combo',file:'layouts/combo.geojson'}],sources:[{id:'osm',type:'osm',title:'Independent map',url:'https://www.openstreetmap.org/',license:'ODbL-1.0',retrievedAt:'2026-01-01T00:00:00Z',evidenceNote:'Exact source nodes'}]};
const recipe:NetworkRecipe={schemaVersion:2,geometryKind:'network',trackId:'test',layoutId:'combo',sourceId:'osm',geometryStatus:'draft',timingMode:'shared',reviewedAt:null,notes:[],gates:[],paths:[{closed:false,segments:[{wayId:1,wayVersion:3,fromIndex:0,toIndex:1}]},{closed:false,segments:[{wayId:2,wayVersion:3,fromIndex:0,toIndex:1}]}]};
test('a network preserves disconnected source paths without inventing a connecting edge',()=>{
 const data=buildCourseNetwork(recipe,[way(1,[1,2]),way(2,[10,11])],track);
 assert.equal(data.features[0].geometry.type,'MultiLineString');assert.equal(data.metadata.closed,false);
 assert.deepEqual(data.features[0].geometry.coordinates,[[[.001,50],[.002,50]],[[.01,50],[.011,50]]]);
 assert.ok(data.metadata.lengthM<150);assert.throws(()=>validateLayout({...data,metadata:{...data.metadata,schemaVersion:1}},track,'combo'),/schema 2/);
});
test('shared source edges count once and duplicate paths or pits cannot inflate a network',()=>{
 const paths:Position[][]=[[[0,50],[.001,50],[.002,50]],[[.002,50],[.001,50],[0,50]]];
 assert.equal(networkLength(paths),networkLength([paths[0]]));
 assert.throws(()=>buildCourseNetwork({...recipe,paths:[recipe.paths[0],recipe.paths[0]]},[way(1,[1,2])],track),/duplicate paths/);
 assert.throws(()=>buildCourseNetwork(recipe,[{...way(1,[1,2]),tags:{raceway:'pit_lane'}},way(2,[10,11])],track),/pit lane/);
 assert.throws(()=>buildCourseNetwork(recipe,[way(1,[1,2]),{...way(2,[10,11]),version:4}],track),/version mismatch/);
});
