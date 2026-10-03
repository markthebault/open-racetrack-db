import {length,nearestEdge,type Position} from '../src/geo';
import {assemble,type Segment,type Way} from './route';

type Edge=Segment&{a:number;b:number;size:number};
export type CourseCandidate={segments:Segment[];lengthM:number;displacementM:number};

// Enumerate only cycles passing the timing neighbourhood and matching the declared distance.
// Reverse shortest-path distances prune branches without inventing links or changing coordinates.
export function anchoredCourses(ways:Way[],point:Position,nominal:number,options:{toleranceM?:number;separationM?:number;maximumDisplacementM?:number;maximumSteps?:number;maximumSegments?:number}={}){
 const tolerance=options.toleranceM??Math.max(25,nominal*.0075),separation=options.separationM??Math.max(10,nominal*.0025),near=options.maximumDisplacementM??30,maximum=nominal+tolerance+separation;
 const occurrences=new Map<number,number>();for(const w of ways)for(const n of w.nodes)occurrences.set(n,(occurrences.get(n)??0)+1);
 const adjacency=new Map<number,Edge[]>(),reverse=new Map<number,Edge[]>(),edges:Edge[]=[],sourcePaths=new Set<string>();
 for(const w of ways){if(w.tags?.area==='yes')continue;const indices=w.nodes.map((n,i)=>i===0||i===w.nodes.length-1||occurrences.get(n)!>1?i:-1).filter(i=>i>=0);
  for(let j=1;j<indices.length;j++){const a=indices[j-1],b=indices[j],size=length(w.geometry.slice(a,b+1).map(p=>[p.lon,p.lat] as Position));if(!size)continue;
   for(const [fromIndex,toIndex] of w.tags?.oneway==='yes'?[[a,b]]:w.tags?.oneway==='-1'?[[b,a]]:[[a,b],[b,a]]){const path=w.nodes.slice(a,b+1).map((n,i)=>`${n}:${w.geometry[a+i].lon},${w.geometry[a+i].lat}`);if(fromIndex>toIndex)path.reverse();const identity=path.join('|');if(sourcePaths.has(identity))continue;sourcePaths.add(identity);const e={wayId:w.id,wayVersion:w.version,fromIndex,toIndex,a:w.nodes[fromIndex],b:w.nodes[toIndex],size};edges.push(e);const list=adjacency.get(e.a)??[];list.push(e);adjacency.set(e.a,list);const incoming=reverse.get(e.b)??[];incoming.push(e);reverse.set(e.b,incoming);}
  }
 }
 const anchors=edges.map(edge=>{const w=ways.find(w=>w.id===edge.wayId)!,coordinates=w.geometry.slice(Math.min(edge.fromIndex,edge.toIndex),Math.max(edge.fromIndex,edge.toIndex)+1).map(p=>[p.lon,p.lat] as Position);return {edge,displacement:nearestEdge(point,coordinates).displacementM};}).filter(e=>e.displacement<=near).sort((a,b)=>a.displacement-b.displacement);
 const results:CourseCandidate[]=[],keys=new Set<string>();let steps=0,truncated=false;
 for(const {edge:anchor} of anchors){
  const lower=new Map<number,number>([[anchor.a,0]]),pending=new Set<number>([anchor.a]),done=new Set<number>();
  while(pending.size){let node=-1,best=Infinity;for(const n of pending)if(lower.get(n)!<best){node=n;best=lower.get(n)!;}pending.delete(node);done.add(node);for(const e of reverse.get(node)??[]){const cost=best+e.size;if(cost>maximum||done.has(e.a))continue;if(cost<(lower.get(e.a)??Infinity)){lower.set(e.a,cost);pending.add(e.a);}}}
  function record(route:Edge[]){const key=route.map(e=>`${e.wayId}:${Math.min(e.fromIndex,e.toIndex)}:${Math.max(e.fromIndex,e.toIndex)}`).sort().join('|');if(keys.has(key))return;keys.add(key);const segments:Segment[]=[];for(const e of route){const previous=segments.at(-1);if(previous?.wayId===e.wayId&&previous.toIndex===e.fromIndex&&(previous.toIndex-previous.fromIndex)*(e.toIndex-e.fromIndex)>0)previous.toIndex=e.toIndex;else segments.push({wayId:e.wayId,wayVersion:e.wayVersion,fromIndex:e.fromIndex,toIndex:e.toIndex});}const trace=assemble(ways,segments,true),lengthM=length(trace);if(Math.abs(lengthM-nominal)<=tolerance+separation)results.push({segments,lengthM,displacementM:nearestEdge(point,trace).displacementM});}
  function walk(node:number,path:Edge[],seen:Set<number>,size:number){if(++steps>(options.maximumSteps??500000)){truncated=true;return;}if(size+(lower.get(node)??Infinity)>maximum)return;
   for(const e of adjacency.get(node)??[]){const previous=path.at(-1)!;if(previous.wayId===e.wayId&&previous.fromIndex===e.toIndex&&previous.toIndex===e.fromIndex)continue;const nextSize=size+e.size;if(nextSize>maximum)continue;if(e.b===anchor.a){if(nextSize>=nominal-tolerance-separation)record([...path,e]);}else if(!seen.has(e.b)&&nextSize+(lower.get(e.b)??Infinity)<=maximum){if(path.length>=(options.maximumSegments??2000)){truncated=true;return;}seen.add(e.b);walk(e.b,[...path,e],seen,nextSize);seen.delete(e.b);}if(truncated)return;}
  }
  if(anchor.a===anchor.b)record([anchor]);else walk(anchor.b,[anchor],new Set([anchor.a,anchor.b]),anchor.size);if(truncated)break;
 }
 results.sort((a,b)=>Math.abs(a.lengthM-nominal)-Math.abs(b.lengthM-nominal));
 const best=results[0],unique=!!best&&!truncated&&Math.abs(best.lengthM-nominal)<=tolerance&&(results.length===1||Math.abs(results[1].lengthM-nominal)-Math.abs(best.lengthM-nominal)>=separation);
 return {candidates:results,truncated,steps,unique};
}
