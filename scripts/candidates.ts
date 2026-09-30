import {length,type Position} from '../src/geo';
import {assemble,type Segment,type Way} from './route';

export function exclusion(way:Way){
 const t=way.tags??{},name=[t.name,t['name:en'],t.service,t.description].filter(Boolean).join(' ').toLowerCase();
 if(t.area==='yes')return 'area representation, no reusable course trace';
 if(t['disused:highway']||t.disused==='yes'||t.abandoned==='yes')return 'disused or abandoned';
 if(/kart|карт|мотокрос|автокрос|sand dune|off[- ]road|カート|卡丁|카트|ピット|维修通道|motocr[oòóô]s|motorcross|go[ -]?cart|\bmx\b|trial|autocross|^paddock$|pit[ _-]?(lane|road|entry|exit)|boxen(gasse|ausfahrt)|box(es|e)?\b|^stand$|safety car|long[ _-]?lap|penalty|dragstrip|quartermile/i.test(name)||/kart|motocross|bmx|cycling|running|horse/.test(t.sport??''))return 'karting, motocross, service lane or unrelated facility';
 if(t.service==='pit_lane'||t.raceway==='pit_lane')return 'pit lane';
 return undefined;
}

export function components(ways:Way[]){
 const owners=new Map<number,Way[]>();for(const w of ways)for(const node of new Set(w.nodes)){const list=owners.get(node)??[];list.push(w);owners.set(node,list);}
 const seen=new Set<number>(),groups:Way[][]=[];
 for(const seed of ways){if(seen.has(seed.id))continue;const group:Way[]=[],queue=[seed];seen.add(seed.id);
  for(let i=0;i<queue.length;i++){const way=queue[i];group.push(way);for(const node of way.nodes)for(const other of owners.get(node)??[])if(!seen.has(other.id)){seen.add(other.id);queue.push(other);}}
  groups.push(group.sort((a,b)=>a.id-b.id));
 }return groups;
}

type Edge=Segment&{a:number;b:number;lengthM:number};
export function candidateLoops(ways:Way[],limit=400,minimumLengthM=1000){
 const owners=new Map<number,Set<number>>();for(const w of ways)for(const node of w.nodes){const set=owners.get(node)??new Set();set.add(w.id);owners.set(node,set);}
 const adjacency=new Map<number,Edge[]>();
 for(const w of ways){const indices=w.nodes.map((n,i)=>i===0||i===w.nodes.length-1||owners.get(n)!.size>1?i:-1).filter(i=>i>=0);
  for(let j=1;j<indices.length;j++){const a=indices[j-1],b=indices[j],coordinates=w.geometry.slice(a,b+1).map(p=>[p.lon,p.lat] as Position),size=length(coordinates),direction=w.tags?.oneway;
   for(const [fromIndex,toIndex] of direction==='yes'?[[a,b]]:direction==='-1'?[[b,a]]:[[a,b],[b,a]]){
    const e={wayId:w.id,wayVersion:w.version,fromIndex,toIndex,a:w.nodes[fromIndex],b:w.nodes[toIndex],lengthM:size};const list=adjacency.get(e.a)??[];list.push(e);adjacency.set(e.a,list);
   }
  }
 }
 const loops:{segments:Segment[];lengthM:number;directionKnown:boolean}[]=[],keys=new Set<string>();let steps=0,truncated=false;
 function walk(start:number,node:number,path:Edge[],seen:Set<number>,size:number){
  if(++steps>150000||loops.length>=limit){truncated=true;return;}
  for(const e of adjacency.get(node)??[]){if(e.b<start||size+e.lengthM>30000)continue;
   const previous=path.at(-1);if(previous?.wayId===e.wayId&&previous.fromIndex===e.toIndex&&previous.toIndex===e.fromIndex)continue;
   if(e.b===start){const route=[...path,e];if(size+e.lengthM<minimumLengthM)continue;
    // Remove reverse duplicates while preserving the pinned direction chosen for the recipe.
    const tokens=route.map(e=>`${e.wayId}:${Math.min(e.fromIndex,e.toIndex)}:${Math.max(e.fromIndex,e.toIndex)}`).sort();const key=tokens.join('|');if(keys.has(key))continue;keys.add(key);
    const segments:Segment[]=[];for(const edge of route){const {wayId,wayVersion,fromIndex,toIndex}=edge,previous=segments.at(-1);if(previous?.wayId===wayId&&previous.toIndex===fromIndex&&(previous.toIndex-previous.fromIndex)*(toIndex-fromIndex)>0)previous.toIndex=toIndex;else segments.push({wayId,wayVersion,fromIndex,toIndex});}
    const coords=assemble(ways,segments,true);loops.push({segments,lengthM:length(coords),directionKnown:route.every(e=>['yes','-1'].includes(ways.find(w=>w.id===e.wayId)!.tags?.oneway??''))});
   }else if(!seen.has(e.b)&&path.length<200)walk(start,e.b,[...path,e],new Set([...seen,e.b]),size+e.lengthM);
  }
 }
 for(const node of [...adjacency.keys()].sort((a,b)=>a-b)){walk(node,node,[],new Set([node]),0);if(truncated)break;}
 return {loops:loops.sort((a,b)=>b.lengthM-a.lengthM),truncated};
}
