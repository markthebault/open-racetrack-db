import {createHash} from 'node:crypto';import {isDeepStrictEqual} from 'node:util';
import type {Layout} from '../schemas/data';import {idealSourceGeometryReviewSchema} from '../schemas/ideal-source-geometry';
import {plane,equal,type Position} from '../src/geo';import {roadRings} from '../src/boundary-path';import {groundFootprintFromRings} from '../src/ribbon-surface';
import {borderPairHash} from './refine-image-borders';import {networkFootprintBranches} from './ideal-network-ground';
export function sourceGeometryIdealLine(layout:Layout,input:unknown){
 const pin=idealSourceGeometryReviewSchema.parse(input),trace=layout.features.find(f=>f.properties.role==='trace')!.geometry;
 if(!layout.metadata.closed||layout.metadata.geometryKind==='network'||trace.type!=='LineString'||layout.metadata.geometryStatus!=='draft'||pin.trackId!==layout.metadata.trackId||pin.layoutId!==layout.metadata.layoutId||createHash('sha256').update(JSON.stringify(trace)).digest('hex')!==pin.traceSha256)throw Error('Qualified source geometry route changed or is not draft');
 const pair=Object.fromEntries(['inner','outer'].map((role,i)=>{const f=layout.features.find(f=>f.properties.role===role);if(f?.geometry.type!=='LineString'||!equal(f.geometry.coordinates[0],f.geometry.coordinates.at(-1)!)||!isDeepStrictEqual(f.properties,pin.borderProperties[i]))throw Error('Qualified source geometry rights changed');return[role,f.geometry.coordinates];})) as {inner:Position[];outer:Position[]};
 if(borderPairHash(pair)!==pin.sourceBorderSha256)throw Error('Qualified source geometry boundaries changed');
 if(new Set(pin.removed.map(p=>p.edge+'/'+p.index)).size!==pin.removed.length)throw Error('Qualified source deletion is duplicated');
 const cleaned=structuredClone(layout);
 for(const role of ['inner','outer'] as const){const ring=pair[role],n=ring.length-1,removed=pin.removed.filter(p=>p.edge===role).sort((a,b)=>a.index-b.index);
  for(const p of removed)if(p.index>=n||!isDeepStrictEqual(p.coordinate,ring[p.index]))throw Error('Qualified source deletion does not match an original unique vertex');
  const groups:typeof removed[]=[];for(const p of removed){const last=groups.at(-1);if(last&&p.index===last.at(-1)!.index+1)last.push(p);else groups.push([p]);}
  if(groups.length>1&&groups[0][0].index===0&&groups.at(-1)!.at(-1)!.index===n-1){const first=groups.shift()!;groups[groups.length-1]=[...groups.at(-1)!,...first];}
  for(const group of groups){const a=ring[(group[0].index+n-1)%n],b=ring[(group.at(-1)!.index+1)%n],project=plane(a),end=project.to(b),join=Math.hypot(...end),path=[a,...group.map(p=>p.coordinate),b];let detour=-join,maxExcursion=0;
   for(let i=1;i<path.length;i++){const u=project.to(path[i-1]),v=project.to(path[i]);detour+=Math.hypot(u[0]-v[0],u[1]-v[1]);}
   for(const p of group){const q=project.to(p.coordinate),t=Math.max(0,Math.min(1,(q[0]*end[0]+q[1]*end[1])/(join*join||1)));maxExcursion=Math.max(maxExcursion,Math.hypot(q[0]-t*end[0],q[1]-t*end[1]));}
   if(join>1.1||detour<5||detour>100||maxExcursion>45)throw Error('Qualified source repair exceeds its 1.1-metre return or bounded detour/excursion');
  }
  const indices=new Set(removed.map(p=>p.index)),retained=ring.slice(0,-1).filter((_,i)=>!indices.has(i)),feature=cleaned.features.find(f=>f.properties.role===role)!;feature.geometry={type:'LineString',coordinates:[...retained,retained[0]]};
 }
 const {inner,outer,project}=roadRings(cleaned),footprint=groundFootprintFromRings([outer],[inner]);
 const coordinates=networkFootprintBranches([trace.coordinates],project,footprint,false,{sourceSearchM:pin.sourceSearchLimitM,maximumOffsetM:pin.lateralOptimizationLimitM,maximumSourceDistanceM:pin.maximumSourceStationDistanceM})[0];
 return {pin,coordinates,footprint,project};
}
export function sourceGeometryIdealFeature(layout:Layout,input:unknown):Layout['features'][number]{
 const result=sourceGeometryIdealLine(layout,input);return{type:'Feature',id:'ideal',properties:{role:'ideal',sourceIds:[],estimated:true,method:'bounded-minimum-curvature-local-time-v1',edgeMarginM:.5,boundaryModel:'reviewed-source-corridor-v1',qualification:'unverified-source-geometry',sourceGeometryReview:result.pin,borderLicenses:[...new Set(layout.features.filter(f=>f.properties.role==='inner'||f.properties.role==='outer').map(f=>'license'in f.properties?f.properties.license:''))]},geometry:{type:'LineString',coordinates:result.coordinates}};
}
