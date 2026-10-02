import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateSelectionTiming,validateNetworkTiming} from '../scripts/selection-timing';
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

test('documented sparse endpoint allowance keeps the route-neighborhood check strict',()=>{
 const sparse:Position[]=[trace[0],trace[1],[.01055,50]];
 assert.throws(()=>validateSelectionTiming(open,sparse,false),/endpoints/);
 assert.equal(validateSelectionTiming(open,sparse,false,40),'separate');
 assert.throws(()=>validateSelectionTiming(open,sparse,false,51),/Invalid documented/);
 assert.throws(()=>validateSelectionTiming(open,sparse,false,NaN),/Invalid documented/);
 const away:TimingRecord={...open,gates:[open.gates[0],{role:'finish',point:[.01055,50.00035]}]};
 assert.throws(()=>validateSelectionTiming(away,sparse,false,50),/location/);
 assert.throws(()=>validateSelectionTiming(open,[...trace,[.011,50]],false,50),/endpoints/);
});

test('network timing checks each real path and rejects a gate on the gap between them',()=>{
 const paths:Position[][]=[[[0,50],[.001,50]],[[.01,50],[.011,50]]];
 const shared:TimingRecord={...open,gates:[{role:'start_finish',point:[.0105,50]}]};
 assert.equal(validateNetworkTiming(shared,paths),'shared');
 assert.equal(validateNetworkTiming({...open,gates:[{role:'start',point:paths[0][0]},{role:'finish',point:paths[1][1]}]},paths),'separate');
 assert.throws(()=>validateNetworkTiming({...shared,gates:[{role:'start_finish',point:[.005,50]}]},paths),/location/);
 assert.throws(()=>validateNetworkTiming({...shared,gates:[]},paths),/complete shared or separate/);
 assert.throws(()=>validateNetworkTiming({...shared,gates:[{role:'finish',point:paths[1][0]}]},paths),/complete shared or separate/);
 assert.throws(()=>validateNetworkTiming(shared,[paths[0]]),/multiple nonempty/);
});
