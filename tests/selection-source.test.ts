import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateSelectionSource} from '../scripts/selection-source';
import type {Segment,Way} from '../scripts/route';

const first:Segment={wayId:1,wayVersion:2,fromIndex:0,toIndex:1};
const next:Segment={wayId:2,wayVersion:3,fromIndex:0,toIndex:1};
const ways:Way[]=[{id:1,version:2,nodes:[10,11],geometry:[{lon:0,lat:50},{lon:.001,lat:50}],tags:{name:'Pit Lane',oneway:'yes'}},{id:2,version:3,nodes:[11,12],geometry:[{lon:.001,lat:50},{lon:.01,lat:50}]}];
const selection={closed:false,segments:[first,next],identificationUrl:'https://example.org/sprint-regulations',startApproach:{segment:first,identificationUrl:'https://example.org/sprint-regulations',evidence:'Organizer regulations identify the sprint start at the pit exit.'}};

test('a documented short sprint start does not allow closed-course or later pit detours',()=>{
 assert.doesNotThrow(()=>validateSelectionSource(ways,selection));
 assert.doesNotThrow(()=>validateSelectionSource(ways,{closed:true,segments:[next],identificationUrl:selection.identificationUrl}));
 assert.throws(()=>validateSelectionSource(ways,{...selection,closed:true}),/open course/);
 assert.throws(()=>validateSelectionSource(ways,{...selection,startApproach:undefined}),/undocumented pit/);
 assert.throws(()=>validateSelectionSource(ways,{...selection,segments:[first,next,first]}),/undocumented pit/);
});

test('start approach evidence must identify the actual pinned segment and reference',()=>{
 assert.throws(()=>validateSelectionSource(ways,{...selection,startApproach:{...selection.startApproach,segment:next}}),/initial source segment/);
 assert.throws(()=>validateSelectionSource(ways,{...selection,startApproach:{...selection.startApproach,segment:{...first,wayVersion:1}}}),/initial source segment/);
 assert.throws(()=>validateSelectionSource(ways,{...selection,startApproach:{...selection.startApproach,evidence:' '}}),/evidence/);
 assert.throws(()=>validateSelectionSource(ways,{...selection,startApproach:{...selection.startApproach,identificationUrl:'https://example.org/other'}}),/evidence/);
 assert.throws(()=>validateSelectionSource(ways,{...selection,startApproach:{...selection.startApproach,identificationUrl:'invalid'}}),/URL/);
 assert.throws(()=>validateSelectionSource(ways,{...selection,segments:[next]}),/open course/);
});

test('source areas, long approaches and reversed mapped approaches remain rejected',()=>{
 const long=[{...ways[0],geometry:[{lon:0,lat:50},{lon:.01,lat:50}]},ways[1]];
 assert.throws(()=>validateSelectionSource(long,selection),/250 m/);
 assert.throws(()=>validateSelectionSource([{...ways[0],tags:{...ways[0].tags,area:'yes'}},ways[1]],selection),/area/);
 const reversed={...first,fromIndex:1,toIndex:0};
 assert.throws(()=>validateSelectionSource(ways,{...selection,segments:[reversed,next],startApproach:{...selection.startApproach,segment:reversed}}),/mapped direction/);
 assert.throws(()=>validateSelectionSource([],{closed:false,segments:[next],identificationUrl:selection.identificationUrl}),/absent/);
});
