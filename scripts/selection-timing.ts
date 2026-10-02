import {distance, equal, nearestEdge, type Position} from '../src/geo';
import type {TimingRecord} from './reference-timing';

export type GeoreferencingAccuracy = {
 horizontalM:number; confidencePercent:95; evidenceUrl:string; evidenceNote:string;
};

// This checks an independently identified full runway, not the extent of a timed
// run. Source validation separately requires the complete, unchanged runway way.
export function validateSupportingRunwayTiming(record:TimingRecord,trace:Position[],evidence:string){
 const start=record.gates.find(g=>g.role==='start'),finish=record.gates.find(g=>g.role==='finish');
 if(!evidence.trim()||trace.length<2||equal(trace[0],trace.at(-1)!)||record.gates.length!==2||!start||!finish)throw new Error('Supporting runway requires separate timing and identification evidence');
 const a=nearestEdge(start.point,trace),b=nearestEdge(finish.point,trace);
 if(a.displacementM>30||b.displacementM>30)throw new Error('Supporting runway fails timing-location check');
 if(a.index+a.t>=b.index+b.t)throw new Error('Supporting runway reverses the timed direction');
 return 'separate' as const;
}

export function validateNetworkTiming(record:TimingRecord,paths:Position[][]){
 if(paths.length<2||paths.some(p=>p.length<2))throw new Error('Network requires multiple nonempty paths');
 if(record.gates.some(g=>Math.min(...paths.map(p=>nearestEdge(g.point,p).displacementM))>30))throw new Error('Network fails timing-location check');
 if(record.gates.length===1&&record.gates[0].role==='start_finish')return 'shared' as const;
 if(record.gates.length===2&&record.gates.some(g=>g.role==='start')&&record.gates.some(g=>g.role==='finish'))return 'separate' as const;
 throw new Error('Network requires complete shared or separate timing roles');
}

// Open drafts must end at independently mapped nodes near the two timing gates.
// Being near a gate somewhere along a longer road is insufficient.
export function validateSelectionTiming(record: TimingRecord, trace: Position[], closed: boolean, endpointToleranceM = 30, openSharedTimingEvidence?: string, georeferencingAccuracy?:GeoreferencingAccuracy) {
 if (!Number.isFinite(endpointToleranceM) || endpointToleranceM < 0 || endpointToleranceM > 50) throw new Error('Invalid documented endpoint tolerance');
 if (trace.length < 2) throw new Error('Selected course has no route');
 if (openSharedTimingEvidence !== undefined && (closed || !openSharedTimingEvidence.trim() || record.gates.length !== 1 || record.gates[0].role !== 'start_finish')) throw new Error('Open shared timing requires an open course, one supplied marker and identification evidence');
 // Historical orthophotos can resolve pavement clearly while their absolute
 // positions remain less accurate. Preserve the source coordinates and marker;
 // account only for a bounded, independently documented provider uncertainty.
 if(georeferencingAccuracy){
  const a=georeferencingAccuracy;
  if(!closed||!Number.isFinite(a.horizontalM)||a.horizontalM<=0||a.horizontalM>20||a.confidencePercent!==95||!a.evidenceNote.trim()||!/^https?:\/\//.test(a.evidenceUrl))throw new Error('Invalid documented closed-course georeferencing accuracy');
 }
 const proximityM=30+(georeferencingAccuracy?.horizontalM??0);
 if (record.gates.some(g => nearestEdge(g.point, trace).displacementM > proximityM)) throw new Error('Selected course fails timing-location check');
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
