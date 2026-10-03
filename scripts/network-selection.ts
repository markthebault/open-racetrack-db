import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {assemble,type Way,type Segment} from './route';
import {networkLength} from '../src/geo';
export async function readNetworkSelection(trackId:string,layoutIds:string[]){
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trackId)||!layoutIds.length||layoutIds.some(id=>!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)))throw new Error('Unsafe network selection identity');
 const root=`sources/${trackId}`,ways=new Map<number,Way>(),paths:{closed:boolean;segments:Segment[]}[]=[],keys=new Set<string>(),components=[];
 for(const layoutId of layoutIds){
  const recipe=JSON.parse(await readFile(`${root}/layouts/${layoutId}.json`,'utf8'));
  if(recipe.trackId!==trackId||recipe.layoutId!==layoutId||recipe.geometryKind==='network')throw new Error('Network component must be an identified source route');
  const file=recipe.snapshotFile??'osm.json';if(!/^[a-z0-9][a-z0-9-]*\.json$/.test(file))throw new Error('Unsafe component snapshot');
  const bytes=await readFile(`${root}/${file}`),hash=createHash('sha256').update(bytes).digest('hex');if(hash!==recipe.snapshotSha256)throw new Error('Network component snapshot changed');
  const raw=JSON.parse(bytes.toString()),selected:Way[]=raw.elements.filter((w:Way)=>recipe.segments.some((s:Segment)=>s.wayId===w.id)).map((w:Way)=>({id:w.id,version:w.version,nodes:w.nodes,geometry:w.geometry,...(w.tags?{tags:w.tags}:{})}));
  for(const way of selected){const old=ways.get(way.id);if(old&&!isDeepStrictEqual(old,way))throw new Error(`Network mixes independent versions of source way ${way.id}`);ways.set(way.id,way);}
  const trace=assemble(selected,recipe.segments,recipe.closed),key=trace.slice(1).map((p,i)=>[trace[i].join(','),p.join(',')].sort().join('|')).sort().join(';');
  if(!keys.has(key)){keys.add(key);paths.push({closed:recipe.closed,segments:recipe.segments});components.push({layoutId,snapshotFile:file,snapshotSha256:hash});}
 }
 if(paths.length<2)throw new Error('Network has fewer than two distinct identified routes');
 return {ways:[...ways.values()],paths,components,lengthM:networkLength(paths.map(p=>assemble([...ways.values()],p.segments,p.closed)))};
}
