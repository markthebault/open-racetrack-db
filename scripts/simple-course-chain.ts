import {type Segment,type Way} from './route';

// Use only a complete, unbranched source-node chain. Never bridge nearby endpoints.
export function simpleCourseChain(ways:Way[]):Segment[]|undefined{
 if(!ways.length||new Set(ways.map(w=>w.id)).size!==ways.length)return;
 const adjacency=new Map<number,Way[]>(),occurrences=new Map<number,{way:Way;index:number}[]>();
 for(const way of ways){
  if(way.tags?.area==='yes'||way.nodes.length<2||way.nodes[0]===way.nodes.at(-1))return;
  for(const [index,node] of way.nodes.entries()){const list=occurrences.get(node)??[];list.push({way,index});occurrences.set(node,list);}
  for(const node of [way.nodes[0],way.nodes.at(-1)!]){const list=adjacency.get(node)??[];list.push(way);adjacency.set(node,list);}
 }
 if([...occurrences.values()].some(list=>list.length>1&&(list.length!==2||list[0].way.id===list[1].way.id||list.some(({way,index})=>index!==0&&index!==way.nodes.length-1))))return;
 const ends=[...adjacency].filter(([,links])=>links.length===1).map(([node])=>node);
 if(ends.length!==2||[...adjacency.values()].some(links=>links.length>2))return;
 const used=new Set<number>(),segments:Segment[]=[];let node=ends[0];
 while(used.size<ways.length){
  const way=adjacency.get(node)?.find(w=>!used.has(w.id));if(!way)return;
  const forward=way.nodes[0]===node;
  segments.push({wayId:way.id,wayVersion:way.version,fromIndex:forward?0:way.nodes.length-1,toIndex:forward?way.nodes.length-1:0});
  used.add(way.id);node=forward?way.nodes.at(-1)!:way.nodes[0];
 }
 return node===ends[1]?segments:undefined;
}
