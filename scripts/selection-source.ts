import {length} from '../src/geo';
import {slice, type Segment, type Way} from './route';

type StartApproach = {segment:Segment; identificationUrl:string; evidence:string};
type Selection = {closed:boolean; segments:Segment[]; identificationUrl:string; startApproach?:StartApproach};

const pit = (way:Way) => /^pit[_ -]?lane$/i.test(way.tags?.service??'') || /^pit[_ -]?lane$/i.test(way.tags?.raceway??'') || /^boxes$|pit[ /_-]?(lane|road|entry|exit)/i.test(way.tags?.name??'');

// Some sprints start at a pit exit. Permit only the documented initial section,
// never a pit detour chosen to make a closed course's distance match.
export function validateSelectionSource(ways:Way[], selection:Selection) {
 const approach=selection.startApproach;
 if(approach) {
  const first=selection.segments[0], way=ways.find(w=>w.id===first?.wayId);
  let url:URL;
  try {url=new URL(approach.identificationUrl);} catch {throw new Error('Invalid start-approach identification URL');}
  if(selection.closed || !way || !pit(way) || approach.identificationUrl!==selection.identificationUrl || !['https:','http:'].includes(url.protocol) || !approach.evidence?.trim()) throw new Error('Start approach requires an open course and matching identification evidence');
  if(['wayId','wayVersion','fromIndex','toIndex'].some(k=>first[k as keyof Segment]!==approach.segment?.[k as keyof Segment])) throw new Error('Start approach does not identify the initial source segment');
  if((way.tags?.oneway==='yes' && first.toIndex<first.fromIndex) || (way.tags?.oneway==='-1' && first.toIndex>first.fromIndex)) throw new Error('Start approach reverses its mapped direction');
  if(length(slice(way,first).map(p=>p.point))>250) throw new Error('Start approach exceeds 250 m');
 }
 for(const [i,segment] of selection.segments.entries()) {
  const way=ways.find(w=>w.id===segment.wayId);
  if(!way) throw new Error('Selected course source is absent');
  if(way.tags?.area==='yes' || (pit(way) && !(i===0 && approach))) throw new Error('Selected course includes an area or undocumented pit/service lane');
 }
}
