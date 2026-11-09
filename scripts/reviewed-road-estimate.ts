import { createHash } from "node:crypto";
import { roadEstimateReviewSchema } from "../schemas/estimate-replacement";
import type { Layout } from "../schemas/data";
import { borderReplacement } from "./border-replacement";
import { borderPairHash } from "./refine-image-borders";
import type { Position } from "../src/geo";

const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
function verifySource(layout:Layout,input:unknown,imageSha256:string){
  const pin=roadEstimateReviewSchema.parse(input),trace=layout.features.find(f=>f.properties.role==="trace")!.geometry;
  if(layout.metadata.trackId!==pin.trackId||layout.metadata.layoutId!==pin.targetLayoutId||!layout.metadata.closed||layout.metadata.geometryKind==="network"||trace.type!=="LineString")
    throw new Error("Reviewed road estimate requires its exact closed independent source route");
  if(hash(trace)!==pin.traceSha256||imageSha256!==pin.imageSha256)
    throw new Error("Reviewed road estimate source trace or image changed");
  return pin;
}
function pair(layout:Layout){
  return Object.fromEntries((["inner","outer"] as const).map(role=>{
    const edge=layout.features.find(f=>f.properties.role===role);
    if(edge?.geometry.type!=="LineString")throw new Error("Reviewed road estimate requires one line per edge");
    return[role,edge.geometry.coordinates];
  })) as {inner:Position[];outer:Position[]};
}
export function reviewedRoadEstimateReplacement(layout:Layout,input:unknown,imageSha256:string){
  const pin=verifySource(layout,input,imageSha256),borders=pair(layout);
  if(layout.features.filter(f=>f.properties.role==="inner"||f.properties.role==="outer").some(f=>!("license"in f.properties)||f.properties.license!=="LicenseRef-Track-Borders"))
    throw new Error("Reviewed road estimate replacement requires original border rights");
  if(pin.defectVertices.some(d=>d.index>=borders[d.edge].length))throw new Error("Reviewed defect vertex is outside the pinned old borders");
  return{pin,replacement:{...borderReplacement(layout,pin.originalBorderSha256,pin.note),imageReview:pin}};
}
export function verifyReviewedRoadEstimateResult(layout:Layout,input:unknown){
  const inference=layout.metadata.borderInference;
  if(!inference)throw new Error("Reviewed road estimate result is missing inference evidence");
  const pin=verifySource(layout,input,inference.imagery.sha256);
  if(inference.method!==(pin.estimatorMethod??"rgb-road-appearance-v3"))throw new Error("Reviewed road estimate estimator changed");
  if(inference.supersedes?.borderSha256!==pin.originalBorderSha256||borderPairHash(pair(layout))!==pin.resultBorderSha256)
    throw new Error("Reviewed road estimate result border hash changed");
  for(const role of ["inner","outer"]){const edge=layout.features.find(f=>f.properties.role===role)!;
    if(!("license"in edge.properties)||edge.properties.license!==inference.imagery.license)throw new Error("Reviewed road estimate result rights changed");}
  return pin;
}
