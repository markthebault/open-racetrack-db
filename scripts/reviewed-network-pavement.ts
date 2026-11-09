import {createHash} from 'node:crypto';
import type {Layout} from '../schemas/data';
import {idealNetworkReviewV2Schema} from '../schemas/ideal-network-review';
import {plane,equal,type Position} from '../src/geo';
import {assertSeparateSimpleRings,insideRing} from '../src/boundary-path';
import {groundFootprintFromRings,groundClearanceM} from '../src/ribbon-surface';
import {pathCrossings} from '../src/path-crossings';
import {borderPairHash} from './refine-image-borders';
const distance=(a:Position,b:Position)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function segmentDistance(p:Position,a:Position,b:Position){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
/** Image-reviewed source-slice reconstruction; the original GeoJSON remains intact. */
export function reviewedNetworkPavement(layout:Layout,input:unknown){
 const pin=idealNetworkReviewV2Schema.parse(input),trace=layout.features.find(f=>f.properties.role==='trace')!.geometry;
 if(layout.metadata.geometryKind!=='network'||layout.metadata.closed||trace.type!=='MultiLineString'||pin.trackId!==layout.metadata.trackId||pin.layoutId!==layout.metadata.layoutId||createHash('sha256').update(JSON.stringify(trace)).digest('hex')!==pin.traceSha256)throw Error('Network pavement source route changed');
 const pair=Object.fromEntries(['inner','outer'].map(role=>{const f=layout.features.find(f=>f.properties.role===role);if(f?.geometry.type!=='LineString'||!equal(f.geometry.coordinates[0],f.geometry.coordinates.at(-1)!))throw Error('Network pavement requires single closed source contours');return [role,f.geometry.coordinates];})) as {inner:Position[];outer:Position[]};
 if(borderPairHash(pair)!==pin.sourceBorderSha256)throw Error('Network pavement source boundaries changed');
 const project=plane(trace.coordinates[0][0]),paths={inner:pair.inner.map(project.to),outer:pair.outer.map(project.to)},seen=new Set<string>(),discarded=new Set(pin.discarded.map(p=>p.edge+'/'+p.index));
 if(discarded.size!==pin.discarded.length||!Object.values(paths).some(r=>pathCrossings(r,true).some(c=>c.kind==='crossing')))throw Error('Network pavement needs unique omissions and actual source crossings');
 const joins:{edge:string;from:number;to:number;lengthM:number;supportDeviationM:number}[]=[];
 function ring(edge:'inner'|'outer',ranges:[number,number][]){
  const source=paths[edge],indices:number[]=[];
  for(const [start,end] of ranges){if(start>end||end>=source.length-1)throw Error('Network pavement source range is invalid');for(let i=start;i<=end;i++){const key=edge+'/'+i;if(seen.has(key)||discarded.has(key))throw Error('Network pavement source vertex is duplicated or omitted');seen.add(key);indices.push(i);}}
  if(indices.length<3)throw Error('Network pavement ring needs three source vertices');
  for(let i=0;i<indices.length;i++){const a=indices[i],b=indices[(i+1)%indices.length];if(b===(a+1)%(source.length-1))continue;
   const lengthM=distance(source[a],source[b]),supportDeviationM=lengthM<=2?0:Math.min(...source.slice(1).map((q,j)=>Math.max(segmentDistance(source[a],source[j],q),segmentDistance(source[b],source[j],q))));
   // The ten-centimetre capsule of a straight segment is convex, so this endpoint
   // bound also bounds every point of the new chord against that source edge.
   if(lengthM>60||supportDeviationM>.1)throw Error('Network pavement join exceeds two metres without ten-centimetre source-edge support, or exceeds 60 metres');
   joins.push({edge,from:a,to:b,lengthM,supportDeviationM});
  }
  return [...indices.map(i=>source[i]),source[indices[0]]];
 }
 const outer=ring('outer',pin.outerRing),islands=pin.islands.map(p=>ring(p.edge,p.ranges));
 for(const edge of ['inner','outer'] as const)for(let i=0;i<paths[edge].length-1;i++)if(!seen.has(edge+'/'+i)&&!discarded.has(edge+'/'+i))throw Error('Network pavement must account for every source vertex');
 assertSeparateSimpleRings([outer,...islands]);
 if(islands.some(r=>r.some(p=>!insideRing(p,outer)))||islands.some((r,i)=>islands.some((s,j)=>i!==j&&insideRing(r[0],s))))throw Error('Network pavement islands must be disjoint and nested');
 const footprint=groundFootprintFromRings([outer],islands),sourceSegments=trace.coordinates.flatMap(p=>{const q=p.map(project.to);return q.slice(1).map((b,i)=>[q[i],b] as const);});
 for(const p of pin.discarded){const source=paths[p.edge],point=source[p.index];if(p.index>=source.length-1||!point)throw Error('Network pavement omission index is invalid');
  const c=groundClearanceM(footprint,point);
  if(p.kind==='duplicate-junction'){if(Math.abs(c)>2)throw Error('Duplicate junction must be within two metres of a retained edge');}
  else if(p.kind==='pavement-stitch'){
   if(c< -1||c>15||Math.min(...sourceSegments.map(([a,b])=>segmentDistance(point,a,b)))>20)throw Error('Omitted stitch must lie in the reviewed pavement, within 15 metres of an edge and 20 metres of a source branch');
  }else{
   const a=source[(p.index+source.length-2)%(source.length-1)],b=source[(p.index+1)%(source.length-1)],detour=distance(a,point)+distance(point,b)-distance(a,b);
   if(!seen.has(p.edge+'/'+((p.index+source.length-2)%(source.length-1)))||!seen.has(p.edge+'/'+((p.index+1)%(source.length-1)))||distance(a,b)>2||detour<5||detour>100||segmentDistance(point,a,b)>15)throw Error('Omitted paint spur exceeds its two-metre return or bounded local excursion');
  }
 }
 return {pin,project,footprint,source:trace.coordinates,joins};
}
