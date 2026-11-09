import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {sourceSpurReviewSchema} from "../schemas/estimate-replacement";
import {borderInferenceSchema,type BorderInference} from "../schemas/border-inference";
import type {Layout} from "../schemas/data";
import {bounds,distance,plane,type Position} from "../src/geo";
import {roadRings,assertSeparateSimpleRings} from "../src/boundary-path";
import {borderPairHash} from "./refine-image-borders";
import {borderReplacement} from "./border-replacement";
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const roles=["inner","outer"] as const;
function pair(layout:Layout){return Object.fromEntries(roles.map(role=>{
  const edges=layout.features.filter(f=>f.properties.role===role);
  if(edges.length!==1||edges[0].geometry.type!=="LineString")throw new Error("Source-spur correction needs one line per edge");
  return[role,edges[0].geometry.coordinates];
})) as {inner:Position[];outer:Position[]};}
function source(layout:Layout,input:unknown,imageSha256:string){
  const pin=sourceSpurReviewSchema.parse(input),trace=layout.features.find(f=>f.properties.role==="trace")!.geometry;
  if(!layout.metadata.closed||layout.metadata.geometryKind==="network"||pin.trackId!==layout.metadata.trackId||pin.targetLayoutId!==layout.metadata.layoutId||hash(trace)!==pin.traceSha256||pin.imageSha256!==imageSha256)
    throw new Error("Source-spur correction route or image changed");
  if(new Set(pin.removed.map(p=>p.edge+"/"+p.index)).size!==pin.removed.length)throw new Error("Duplicate source-spur deletion");
  for(const [i,role] of roles.entries())if(!isDeepStrictEqual(layout.features.find(f=>f.properties.role===role)!.properties,pin.borderProperties[i]))throw new Error("Source-spur correction must preserve original border properties and rights");
  return pin;
}
function checkRemoved(original:ReturnType<typeof pair>,pin:ReturnType<typeof source>){
  for(const p of pin.removed){const ring=original[p.edge];
    if(p.index>=ring.length-1||!isDeepStrictEqual(ring[p.index],p.coordinate))throw new Error("Source-spur vertex differs from its original coordinate or is a closure endpoint");
  }
  for(const role of roles){
    const entries=pin.removed.filter(p=>p.edge===role).sort((a,b)=>a.index-b.index),groups:typeof entries[]=[];
    for(const p of entries){const previous=groups.at(-1);if(previous&&p.index===previous.at(-1)!.index+1&&(p.kind??"paint-line-spur")===(previous[0].kind??"paint-line-spur"))previous.push(p);else groups.push([p]);}
    for(const group of groups){
      const ring=original[role],first=group[0].index,last=group.at(-1)!.index,a=ring[first-1],c=ring[last+1],join=distance(a,c),project=plane(a),end=project.to(c),lengthSquared=end[0]**2+end[1]**2;
      let detour=-join,maxDeviation=0;for(let i=first;i<=last+1;i++)detour+=distance(ring[i-1],ring[i]);
      for(const point of group){const p=project.to(point.coordinate),t=Math.max(0,Math.min(1,(p[0]*end[0]+p[1]*end[1])/(lengthSquared||1)));maxDeviation=Math.max(maxDeviation,Math.hypot(p[0]-t*end[0],p[1]-t*end[1]));}
      if(group[0].kind==="sub-metre-self-crossing"){
        if(join>2||maxDeviation>.1)throw new Error("Numerical-loop correction exceeds its two-metre chord or ten-centimetre deviation bound");
        let crossed=false;try{assertSeparateSimpleRings([ring.slice(first-1,last+2).map(project.to)],false);}catch{crossed=true;}
        if(!crossed)throw new Error("Numerical-loop correction requires an actual local source self-crossing");
      }else if(join>1||detour<5||detour>100||maxDeviation>45)
        throw new Error("Source-spur deletion requires a return within one metre, five to 100 metres of excess detour and a local excursion within 45 metres");
    }
  }
}

export function applySourceSpurCorrection(layout:Layout,input:unknown,imagery:BorderInference["imagery"]){
  const pin=source(layout,input,imagery.sha256),original=pair(layout);
  const replacement=borderReplacement(layout,pin.originalBorderSha256,pin.note);checkRemoved(original,pin);
  const result=structuredClone(layout);result.features=result.features.filter(f=>f.properties.role!=="ideal");
  for(const role of roles){const edge=result.features.find(f=>f.properties.role===role)!;if(edge.geometry.type!=="LineString")throw new Error("Expected line");
    const indices=new Set(pin.removed.filter(p=>p.edge===role).map(p=>p.index));edge.geometry.coordinates=edge.geometry.coordinates.filter((_,i)=>!indices.has(i));}
  if(borderPairHash(pair(result))!==pin.resultBorderSha256)throw new Error("Source-spur result hash changed");
  roadRings(result);
  result.metadata.borderInference=borderInferenceSchema.parse({schemaVersion:1,method:pin.method,status:"estimated",reviewedAt:null,traceSha256:pin.traceSha256,supersedes:{...replacement,sourceSpurReview:pin},imagery,note:"Reviewed deletion of the pinned source vertices only. Every retained coordinate and original border property is unchanged. Each paint-line group has a near return and bounded local excursion. Any numerical-loop group replaces an actual self-crossing with a chord at most two metres long and at most ten centimetres from every deleted point. The image supports local pavement interpretation but cannot resolve subpixel loops; this is not a new edge extraction or validation of the remaining source geometry."});
  result.bbox=bounds(result.features.flatMap(f=>f.geometry.type==="LineString"?f.geometry.coordinates:f.geometry.coordinates.flat()));
  return result;
}
export function verifySourceSpurResult(layout:Layout){
  const inference=borderInferenceSchema.parse(layout.metadata.borderInference),pin=source(layout,inference.supersedes?.sourceSpurReview,inference.imagery.sha256),current=pair(layout);
  if(borderPairHash(current)!==pin.resultBorderSha256)throw new Error("Source-spur result hash changed");
  const original=structuredClone(current);
  for(const role of roles)for(const p of pin.removed.filter(p=>p.edge===role).sort((a,b)=>a.index-b.index)){
    if(p.index>=original[role].length)throw new Error("Source-spur restored vertex index is invalid");original[role].splice(p.index,0,p.coordinate);}
  if(borderPairHash(original)!==pin.originalBorderSha256)throw new Error("Source-spur original reconstruction hash changed");
  checkRemoved(original,pin);roadRings(layout);return{pin,original};
}
