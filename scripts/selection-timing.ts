import {distance, equal, nearestEdge, type Position} from '../src/geo';
import type {TimingRecord} from './reference-timing';

export function validateNetworkTiming(record:TimingRecord,paths:Position[][]){
 if(paths.length<2||paths.some(p=>p.length<2))throw new Error('Network requires multiple nonempty paths');
 if(record.gates.some(g=>Math.min(...paths.map(p=>nearestEdge(g.point,p).displacementM))>30))throw new Error('Network fails timing-location check');
 if(record.gates.length===1&&record.gates[0].role==='start_finish')return 'shared' as const;
 if(record.gates.length===2&&record.gates.some(g=>g.role==='start')&&record.gates.some(g=>g.role==='finish'))return 'separate' as const;
 throw new Error('Network requires complete shared or separate timing roles');
}

// Open drafts must end at independently mapped nodes near the two timing gates.
// Being near a gate somewhere along a longer road is insufficient.
export function validateSelectionTiming(record: TimingRecord, trace: Position[], closed: boolean, endpointToleranceM = 30, openSharedTimingEvidence?: string) {
 if (!Number.isFinite(endpointToleranceM) || endpointToleranceM < 0 || endpointToleranceM > 50) throw new Error('Invalid documented endpoint tolerance');
 if (trace.length < 2) throw new Error('Selected course has no route');
 if (openSharedTimingEvidence !== undefined && (closed || !openSharedTimingEvidence.trim() || record.gates.length !== 1 || record.gates[0].role !== 'start_finish')) throw new Error('Open shared timing requires an open course, one supplied marker and identification evidence');
 if (record.gates.some(g => nearestEdge(g.point, trace).displacementM > 30)) throw new Error('Selected course fails timing-location check');
 if (closed) {
  if (record.gates.length !== 1 || record.gates[0].role !== 'start_finish' || !equal(trace[0], trace.at(-1)!)) throw new Error('Closed course requires shared timing');
  return 'shared' as const;
 }
 // Some supplied open courses contain only one shared marker. Keep that marker
 // without treating either mapped endpoint as a verified timed finish.
 if (openSharedTimingEvidence && !equal(trace[0], trace.at(-1)!)) return 'shared' as const;
 const start = record.gates.find(g => g.role === 'start'), finish = record.gates.find(g => g.role === 'finish');
 if (record.gates.length !== 2 || !start || !finish || equal(trace[0], trace.at(-1)!)) throw new Error('Open course requires separate timing and distinct endpoints');
 if (distance(start.point, trace[0]) > endpointToleranceM || distance(finish.point, trace.at(-1)!) > endpointToleranceM) throw new Error('Open source endpoints do not agree with timing positions');
 return 'separate' as const;
}
