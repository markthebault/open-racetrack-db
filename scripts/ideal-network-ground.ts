import {reviewedNetworkPavement} from './reviewed-network-pavement';
import type {MultiPolygon} from 'polygon-clipping';
import {createHash} from 'node:crypto';
import type {Layout} from '../schemas/data';
import {idealNetworkReviewSchema} from '../schemas/ideal-network-review';
import {plane,equal,R,rad,type Position} from '../src/geo';
import {assertSeparateSimpleRings,insideRing} from '../src/boundary-path';
import {groundFootprintFromRings,groundClearanceM,groundSegmentClearanceM} from '../src/ribbon-surface';
import {pathCrossings} from '../src/path-crossings';
import {borderPairHash} from './refine-image-borders';
import {idealLocalRoute} from './ideal-local-route';
import {optimizeLine} from './ideal-line-solver';
import {IDEAL_CAR} from '../src/ideal-line-model';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function reviewedNetworkGround(layout:Layout,input:unknown){
 const pin=idealNetworkReviewSchema.parse(input);
 if(pin.method==='image-reviewed-network-pavement-v2')return reviewedNetworkPavement(layout,pin);
 const trace=layout.features.find(f=>f.properties.role==='trace')!.geometry;
 if(layout.metadata.geometryKind!=='network'||layout.metadata.closed||trace.type!=='MultiLineString'||pin.trackId!==layout.metadata.trackId||pin.layoutId!==layout.metadata.layoutId||hash(trace)!==pin.traceSha256)throw Error('Network ground source route changed');
 const pair=Object.fromEntries(['inner','outer'].map(role=>{const f=layout.features.find(f=>f.properties.role===role);if(f?.geometry.type!=='LineString'||!equal(f.geometry.coordinates[0],f.geometry.coordinates.at(-1)!))throw Error('Network ground requires single closed source contours');return [role,f.geometry.coordinates];})) as {inner:Position[];outer:Position[]};
 if(borderPairHash(pair)!==pin.sourceBorderSha256)throw Error('Network ground source boundaries changed');
 const project=plane(trace.coordinates[0][0]),inner=pair.inner.map(project.to),outer=pair.outer.map(project.to),seen=new Set<number>(),discarded=new Set(pin.discardedInnerVertices);
 if(discarded.size!==pin.discardedInnerVertices.length||!pathCrossings(inner,true).some(c=>c.kind==='crossing'))throw Error('Network island review requires unique deletions and an actual source crossing');
 const islands=pin.innerRings.map(ranges=>{
  const indices:number[]=[];
  for(const [start,end] of ranges){if(start>end||end>=inner.length-1)throw Error('Network island source range is invalid');for(let i=start;i<=end;i++){if(seen.has(i)||discarded.has(i))throw Error('Network island source index is duplicated or discarded');seen.add(i);indices.push(i);}}
  if(indices.length<3)throw Error('Network island needs three source vertices');
  for(let i=0;i<indices.length;i++){const a=indices[i],b=indices[(i+1)%indices.length];if(b!==(a+1)%(inner.length-1)&&Math.hypot(inner[a][0]-inner[b][0],inner[a][1]-inner[b][1])>2)throw Error('Network island new join exceeds two metres');}
  return [...indices.map(i=>inner[i]),inner[indices[0]]];
 });
 if(discarded.size+seen.size!==inner.length-1||[...discarded].some(i=>i>=inner.length-1||seen.has(i)))throw Error('Network island review must account for every unique original vertex');
 assertSeparateSimpleRings([outer,...islands]);
 if(islands.some(r=>r.some(p=>!insideRing(p,outer)))||islands.some((r,i)=>islands.some((s,j)=>i!==j&&insideRing(r[0],s))))throw Error('Network islands must be disjoint and nested in the original outer edge');
 const footprint=groundFootprintFromRings([outer],islands);
 for(const i of discarded)if(Math.abs(groundClearanceM(footprint,inner[i]))>1)throw Error('Discarded network artifact is more than one metre from a retained edge');
 return {pin,project,footprint,source:trace.coordinates};
}
/** Source branch order and open endpoints remain independent; no network lap is invented. */
export function networkGroundIdealLine(layout:Layout,input:unknown){
 const ground=reviewedNetworkGround(layout,input);
 return {...ground,branches:networkFootprintBranches(ground.source,ground.project,ground.footprint,ground.pin.method==='image-reviewed-network-pavement-v2')};
}
export function networkFootprintBranches(source:Position[][],project:ReturnType<typeof plane>,footprint:MultiPolygon,reviewedSourceJunctions=false,constraints:{sourceSearchM?:number;maximumOffsetM?:number;maximumSourceDistanceM?:number}={}){
 const margin=IDEAL_CAR.widthM/2+.5+.02;
 const branches=source.map((path,branchIndex)=>{
  const ps=path.map(project.to),closed=equal(path[0],path.at(-1)!),samples:{p:Position;n:Position}[]=[];
  for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),count=Math.ceil(length/3);for(let j=0;j<count;j++)samples.push({p:[a[0]+j/count*dx,a[1]+j/count*dy],n:[-dy/length,dx/length]});}
  const expected=pathCrossings(ps,closed);
  if(expected.length&&!reviewedSourceJunctions)throw Error('Network source crossings require junction review');
  const length=(p:Position[])=>p.slice(1).reduce((sum,q,i)=>sum+Math.hypot(q[0]-p[i][0],q[1]-p[i][1]),0);
  const assertTopology=(points:Position[])=>{
   if(!expected.length){assertSeparateSimpleRings([points],closed);return;}
   const crossings=pathCrossings(points,closed),a=length(ps),b=length(points);
   if(crossings.length!==expected.length||crossings.some((c,i)=>c.kind!=='crossing'||expected[i].kind!=='crossing'||Math.hypot(c.point[0]-expected[i].point[0],c.point[1]-expected[i].point[1])>20||c.stations.some((s,j)=>Math.abs(s/b-expected[i].stations[j]/a)*a>50)))throw Error('Network ideal changed the reviewed source junction crossing or travel order');
  };
  if(samples.length<3)throw Error('Network branch has insufficient source stations');
  if(!closed)samples.push({p:ps.at(-1)!,n:samples.at(-1)!.n});
  const seed=samples.map(s=>{let best:Position|undefined,offset=Infinity;for(let o=-(constraints.sourceSearchM??20);o<=(constraints.sourceSearchM??20);o+=.25){const q:Position=[s.p[0]+o*s.n[0],s.p[1]+o*s.n[1]];if(Math.abs(o)<offset&&groundClearanceM(footprint,q)>=margin+.005){best=q;offset=Math.abs(o);}}if(!best)throw Error('Network branch station lacks vehicle clearance within 20 metres');return best;});
  const routed:Position[]=[];
  for(let i=0;i<(closed?seed.length:seed.length-1);i++){
   const a=seed[i],b=seed[(i+1)%seed.length];routed.push(a);if(groundSegmentClearanceM(footprint,a,b)>=margin)continue;
   let repair;try{repair=idealLocalRoute({x:a[0],z:a[1],y:0},{x:b[0],z:b[1],y:0},(x,z)=>groundClearanceM(footprint,[x,z])>=margin+.005,(a,b)=>groundSegmentClearanceM(footprint,[a.x,a.z],[b.x,b.z])>=margin,20);}catch(e){throw Error(`Network branch ${branchIndex} segment ${i} cannot route between ${JSON.stringify(a)} and ${JSON.stringify(b)}: ${e}`);}
   routed.push(...repair.slice(1,-1).map(p=>[p.x,p.z] as Position));
  }
  if(!closed)routed.push(seed.at(-1)!);
  let points=routed.filter((p,i)=>!i||Math.hypot(p[0]-routed[i-1][0],p[1]-routed[i-1][1])>1e-6);if(closed)points.push(points[0]);
  for(let pass=0;pass<10;pass++){const all=pathCrossings(points,closed),c=all.find(c=>c.kind==='crossing'&&c.stations[1]-c.stations[0]<=10);if(!c)break;points=[...points.slice(0,c.segments[0]+1),c.point,...points.slice(c.segments[1]+1)];}
  assertTopology(points);
  const core=closed?points.slice(0,-1):points,clear=core.map((p,i)=>i===core.length-1&&!closed?Infinity:groundSegmentClearanceM(footprint,p,core[(i+1)%core.length]));
  const stations=core.map((p,i)=>{const prev=core[closed?(i+core.length-1)%core.length:Math.max(0,i-1)],next=core[closed?(i+1)%core.length:Math.min(core.length-1,i+1)],dx=next[0]-prev[0],dy=next[1]-prev[1],length=Math.hypot(dx,dy);return{x:p[0],z:-p[1],y:0,nx:-dy/length,nz:-dx/length,halfWidth:Math.min(IDEAL_CAR.widthM/2+.52+(constraints.maximumOffsetM??Infinity),clear[i],clear[closed?(i+clear.length-1)%clear.length:Math.max(0,i-1)])};});
  const result=optimizeLine(stations,closed,IDEAL_CAR,100,.52),pathPoints=result.points.map(p=>[p.x,-p.z] as Position);if(closed)pathPoints.push(pathPoints[0]);
  assertTopology(pathPoints);
  if(pathPoints.slice(1).some((p,i)=>groundSegmentClearanceM(footprint,pathPoints[i],p)<margin))throw Error('Optimized network segment lacks continuous clearance');
  // Every retained reference station must still have a nearby point on this branch.
  if(samples.some(s=>Math.min(...pathPoints.map(p=>Math.hypot(p[0]-s.p[0],p[1]-s.p[1])))>(constraints.maximumSourceDistanceM??20)))throw Error('Network line lost a source branch section');
  return pathPoints.map(p=>[Number((source[0][0][0]+p[0]/(R*rad*Math.cos(source[0][0][1]*rad))).toFixed(10)),Number((source[0][0][1]+p[1]/(R*rad)).toFixed(10))] as Position);
 });
 return branches;
}
