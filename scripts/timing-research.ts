import type {TimingRecord} from './reference-timing';

export function timingResearchRequirement(record:Pick<TimingRecord,'gates'|'nominalLengthM'>){
 if(record.gates.length===2)return {reason:'open-course-evidence-required',nextStep:'Identify the independent open route and its source-node endpoints; do not substitute a closed venue loop.'};
 if(!record.nominalLengthM)return {reason:'configuration-evidence-required',nextStep:'Identify the catalogue configuration independently; a missing distance does not establish that it is a configuration set.'};
 return null;
}
