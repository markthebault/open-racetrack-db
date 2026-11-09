import { createHash } from "node:crypto";
import { reviewedEstimateSchema } from "../schemas/estimate-replacement";
export { reviewedEstimateSchema } from "../schemas/estimate-replacement";
import type { Layout } from "../schemas/data";
import { equal } from "../src/geo";
import { borderReplacement } from "./border-replacement";
import { borderPairHash } from "./refine-image-borders";
const geometryHash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");

/** Permit a fresh estimate only for an exactly identical ordered source-node cycle. */
function verifyEstimateSource(target:Layout,source:Layout,input:unknown,imageSha256:string) {
  const pin=reviewedEstimateSchema.parse(input),inference=source.metadata.borderInference;
  if(target.metadata.trackId!==pin.trackId||source.metadata.trackId!==pin.trackId||
    target.metadata.layoutId!==pin.targetLayoutId||source.metadata.layoutId!==pin.sourceLayoutId||
    pin.targetLayoutId===pin.sourceLayoutId)
    throw new Error("Reviewed estimate source identity differs from its pin");
  if(!source.metadata.closed||source.metadata.geometryKind==="network"||
    inference?.method!=="rgb-road-appearance-v3"||inference.refinement||inference.measurement||inference.gradeSeparation||
    !source.features.some(f=>f.properties.role==="ideal"))
    throw new Error("Reviewed estimate needs an existing independent appearance estimate with an ideal line");
  if(inference.imagery.sha256!==pin.imageSha256||imageSha256!==pin.imageSha256)
    throw new Error("Reviewed estimate image differs from its pin");
  const sourceTrace=source.features.find(f=>f.properties.role==="trace")!.geometry;
  const targetTrace=target.features.find(f=>f.properties.role==="trace")!.geometry;
  if(sourceTrace.type!=="LineString"||targetTrace.type!=="LineString"||
    !equal(sourceTrace.coordinates[0],sourceTrace.coordinates.at(-1)!)||
    !equal(targetTrace.coordinates[0],targetTrace.coordinates.at(-1)!)||
    geometryHash(sourceTrace)!==pin.sourceTraceSha256||inference.traceSha256!==pin.sourceTraceSha256)
    throw new Error("Reviewed estimate source trace differs from its pin");
  const a=sourceTrace.coordinates.slice(0,-1),b=targetTrace.coordinates.slice(0,-1),{sourceStartIndex:start,direction}=pin.targetCycle;
  if(a.length!==b.length||start>=a.length||b.some((p,i)=>!equal(p,a[(start+direction*i+a.length*2)%a.length])))
    throw new Error("Reviewed estimate requires exactly the same source-node cycle; no fitting or inferred joins");
  const pair={} as {inner:[number,number][];outer:[number,number][]};
  for(const role of ["inner","outer"] as const){
    const f=source.features.find(f=>f.properties.role===role);
    if(f?.geometry.type!=="LineString"||!("license" in f.properties)||f.properties.license!==inference.imagery.license)
      throw new Error("Reviewed estimate source border rights changed");
    pair[role]=f.geometry.coordinates;
  }
  if(borderPairHash(pair)!==pin.sourceBorderSha256)throw new Error("Reviewed estimate source borders changed");
  return pin;
}

export function reviewedEstimateReplacement(target:Layout,source:Layout,input:unknown,imageSha256:string) {
  const pin=verifyEstimateSource(target,source,input,imageSha256);
  if(target.features.filter(f=>f.properties.role==="inner"||f.properties.role==="outer").some(f=>!("license" in f.properties)||f.properties.license!=="LicenseRef-Track-Borders"))
    throw new Error("Reviewed estimate replacement requires original border rights");
  return {pin,replacement:{...borderReplacement(target,pin.originalBorderSha256,pin.note),sameCycleReview:pin}};
}
export function verifyReviewedEstimateResult(target:Layout,source:Layout,input:unknown) {
  const inference=target.metadata.borderInference;
  if(!inference)throw new Error("Reviewed estimate result is missing its inference metadata");
  const pin=verifyEstimateSource(target,source,input,inference.imagery.sha256);
  const pair=Object.fromEntries(["inner","outer"].map(role=>[role,(target.features.find(f=>f.properties.role===role)!.geometry as {coordinates:[number,number][]}).coordinates])) as {inner:[number,number][];outer:[number,number][]};
  if(inference.supersedes?.borderSha256!==pin.originalBorderSha256||borderPairHash(pair)!==pin.resultBorderSha256)
    throw new Error("Reviewed estimate result border hashes differ from their pin");
  return pin;
}
