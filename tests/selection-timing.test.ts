import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateSelectionTiming} from '../scripts/selection-timing';
import type {TimingRecord} from '../scripts/reference-timing';
import type {Position} from '../src/geo';

const trace: Position[] = [[0,50],[.005,50],[.01,50]];
const open: TimingRecord = {id:'test',country:'test',name:'test',gates:[{role:'start',point:trace[0]},{role:'finish',point:trace[2]}]};
test('open timing accepts exact source endpoints and rejects reversed or extended roads',()=>{
 assert.equal(validateSelectionTiming(open,trace,false),'separate');
 assert.throws(()=>validateSelectionTiming(open,[...trace].reverse(),false),/endpoints/);
 assert.throws(()=>validateSelectionTiming(open,[[-.001,50],...trace],false),/endpoints/);
 assert.throws(()=>validateSelectionTiming(open,[...trace,trace[0]],false),/distinct endpoints/);
});
test('course closure and timing roles must agree',()=>{
 const shared: TimingRecord = {...open,gates:[{role:'start_finish',point:trace[1]}]};
 assert.equal(validateSelectionTiming(shared,[...trace,trace[0]],true),'shared');
 assert.throws(()=>validateSelectionTiming(shared,trace,false),/separate timing/);
 assert.throws(()=>validateSelectionTiming(open,[...trace,trace[0]],true),/shared timing/);
 assert.throws(()=>validateSelectionTiming(shared,trace,true),/shared timing/);
});
