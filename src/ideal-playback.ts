import {geometryPaths,type Layout} from '../schemas/data';
import {equal,plane,type Position} from './geo';
import {buildRoad,type Road,type RoadPoint} from './lap-simulation';

/** Keep the rendered road intact; use the stored polyline for driving and speed planning. */
export function withIdealPlayback(road:Road,layout:Layout):Road{
 const feature=layout.features.find(f=>f.properties.role==='ideal');
 if(!feature||feature.geometry.type!=='LineString')return road;
 const coordinates=geometryPaths(feature.geometry)[0],closed=road.recipe.kind!=='run';
 if(equal(coordinates[0],coordinates.at(-1)!)!==closed)return road;
 const project=plane(road.origin),raw=coordinates.slice(0,closed?-1:undefined).map(p=>{const q=project.to(p);return [q[0],-q[1]] as Position;});
 const centres=road.points.map(p=>{const offset=road.ground?0:(p.left-p.right)/2;return[p.x+p.nx*offset,p.z+p.nz*offset] as Position;});
 const nearest=(p:Position,a:Position,b:Position)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));return{t,p:[a[0]+t*dx,a[1]+t*dz] as Position};};
 let path=raw;
 if(closed){let best={index:0,t:0,p:raw[0],distance:Infinity};for(let i=0;i<raw.length;i++){const c=nearest(centres[0],raw[i],raw[(i+1)%raw.length]),distance=Math.hypot(c.p[0]-centres[0][0],c.p[1]-centres[0][1]);if(distance<best.distance)best={index:i,...c,distance};}path=[best.p,...raw.slice(best.index+1),...raw.slice(0,best.index+1),best.p];}
 const xy:Position[]=[];
 for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.ceil(length/3);for(let j=0;j<n;j++)xy.push([a[0]+j/n*(b[0]-a[0]),a[1]+j/n*(b[1]-a[1])]);}
 if(!closed)xy.push(path.at(-1)!);
 const lengths=xy.map((p,i)=>i===xy.length-1&&!closed?0:Math.hypot(xy[(i+1)%xy.length][0]-p[0],xy[(i+1)%xy.length][1]-p[1])),total=lengths.reduce((a,b)=>a+b,0);
 if(xy.length<3||total<=0)throw Error('Ideal playback needs a non-degenerate route');
 const cells=new Map<string,number[]>(),size=32,n=road.points.length;
 for(let i=0;i<(closed?n:n-1);i++){const a=centres[i],b=centres[(i+1)%n];for(let x=Math.floor(Math.min(a[0],b[0])/size);x<=Math.floor(Math.max(a[0],b[0])/size);x++)for(let z=Math.floor(Math.min(a[1],b[1])/size);z<=Math.floor(Math.max(a[1],b[1])/size);z++){const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key)!.push(i);}}
 let planarStation=0;
 const points:RoadPoint[]=xy.map((p,i)=>{
  const expected=planarStation/total*road.length,candidates=new Set<number>(),cx=Math.floor(p[0]/size),cz=Math.floor(p[1]/size);for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)for(const j of cells.get((cx+x)+','+(cz+z))??[])candidates.add(j);
  let best:{index:number;t:number;score:number}|undefined;
  for(const j of candidates){const a=road.points[j],c=nearest(p,centres[j],centres[(j+1)%n]);let phase=Math.abs(a.s+c.t*a.ds-expected);if(closed)phase=Math.min(phase,road.length-phase);if(phase>120&&(layout.metadata.borderInference?.gradeSeparation||road.recipe.sourceSequence))continue;const score=(c.p[0]-p[0])**2+(c.p[1]-p[1])**2+phase*phase*1e-6;if(!best||score<best.score)best={index:j,t:c.t,score};}
  if(!best)throw Error('Ideal line cannot be matched to the selected road in source order');
  const a=road.points[best.index],b=road.points[(best.index+1)%n],t=best.t;planarStation+=lengths[i];return{...a,x:p[0],z:p[1],y:a.y+(b.y-a.y)*t,s:0,ds:0,curvature:0,grade:0,elevated:t<.5?a.elevated:b.elevated};
 });
 const at=(i:number)=>points[closed?(i+points.length)%points.length:Math.max(0,Math.min(points.length-1,i))];let travelled=0;
 for(let i=0;i<points.length;i++){const p=points[i],q=at(i+1),a=at(i-4),b=at(i+4),dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);p.nx=dz/(d||1);p.nz=-dx/(d||1);p.s=travelled;p.ds=!closed&&i===points.length-1?0:Math.hypot(q.x-p.x,q.z-p.z,q.y-p.y);travelled+=p.ds;const ab=Math.hypot(p.x-a.x,p.z-a.z),bc=Math.hypot(b.x-p.x,b.z-p.z),ac=Math.hypot(b.x-a.x,b.z-a.z);p.curvature=2*((p.x-a.x)*(b.z-p.z)-(p.z-a.z)*(b.x-p.x))/Math.max(1e-6,ab*bc*ac);}
 for(let i=0;i<points.length;i++){const p=points[i],a=at(i-1),b=at(i+1);p.grade=(b.y-a.y)/Math.max(1e-8,(i===0&&!closed?0:a.ds)+p.ds);}
 return{...road,points,length:travelled,step:travelled/(closed?points.length:points.length-1),surfaceRoad:road,pathSource:'ideal'};
}
export function buildPlaybackRoad(layout:Layout){return withIdealPlayback(buildRoad(layout),layout);}
