import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {geometryPaths,type Layout} from '../schemas/data';
import {buildRoad} from '../src/lap-simulation';
import {plane,type Position} from '../src/geo';
import {pathCrossings} from '../src/path-crossings';
import {assertGradeRibbon} from '../src/grade-separation';
import {auditGradeCrossings} from './audit-grade-crossings';
import {verifyGradeSource} from './verify-grade-source';
import {verifySharedGroundSource} from './shared-source-junctions';

export type SourceCrossing=ReturnType<typeof auditGradeCrossings>[number];
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');

/** Inspect the rendered road, rather than assuming a saved model separates its levels. */
export function runtimeCrossingLevels(layout:Layout,crossing:Position){
 const model=layout.metadata.model3d;
 if(!model||model.kind==='surface')return undefined;
 const road=buildRoad(layout),projection=plane(road.origin),point=projection.to(crossing),planar=road.points.map((p):Position=>[p.x,-p.z]);
 const hits=pathCrossings(planar,model.kind!=='run').filter(hit=>hit.kind==='crossing'&&Math.hypot(hit.point[0]-point[0],hit.point[1]-point[1])<=25);
 if(hits.length!==1)return{status:'unresolved-runtime-crossing' as const,matchingCrossings:hits.length};
 const hit=hits[0],levels=hit.segments.map((index,j)=>{
  const a=road.points[index],b=road.points[(index+1)%road.points.length],t=hit.fractions[j];
  return{heightM:Number((a.y+(b.y-a.y)*t).toFixed(3)),widthM:Number((a.left+a.right+(b.left+b.right-a.left-a.right)*t).toFixed(3))};
 });
 return{status:'sampled' as const,levels,verticalSeparationM:Number(Math.abs(levels[0].heightM-levels[1].heightM).toFixed(3)),repairedSections:road.interpolatedSections};
}

export function modelCrossingStatus(layout:Layout,crossing:SourceCrossing){
 const model=layout.metadata.model3d,grade=layout.metadata.borderInference?.gradeSeparation;
 if(grade)return'source-profile-present';
 if(model&&model.kind!=='surface'&&model.sharedGround&&crossing.kind==='touch'&&crossing.status==='unexplained'&&
   crossing.bridgeCandidates.length===0&&crossing.coordinate.every((v,i)=>Math.abs(v-model.sharedGround!.sourceNode.coordinate[i])<1e-9))return'shared-ground-junction';
 if(crossing.status!=='source-bridge-needs-profile')return'unexplained-source-crossing';
 return !model?'bridge-profile-missing-no-model':model.kind==='surface'?'bridge-profile-missing-surface':'bridge-profile-missing-playable-model';
}

export async function collectModelCrossingAudit(dataRoot='data',sourcesRoot='sources'){
 const read=async(p:string)=>JSON.parse(await readFile(p,'utf8')),index=await read(`${dataRoot}/index.json`),records=[],summary={mappedLayouts:0,singlePathsAudited:0,networksDelegatedToComponents:0,networksWithoutComposition:0,layoutsWithCrossings:0,crossings:0,sourceProfilesPresent:0,sharedGroundJunctions:0,bridgeProfilesMissingInPlayableModels:0,bridgeProfilesMissingWithoutPlayback:0,unexplainedSourceCrossings:0,runtimeCrossingsBelowThreeMetres:0,runtimeCrossingsUnresolved:0},layoutSet=[];
 for(const entry of index.tracks){
  const track=await read(`${dataRoot}/${entry.file}`);
  for(const item of track.layouts){
   if(!item.file)continue;
   const file=`${dataRoot}/${dirname(entry.file)}/${item.file}`,bytes=await readFile(file),layout=JSON.parse(bytes.toString()) as Layout,trace=layout.features.find(f=>f.properties.role==='trace')!,paths=geometryPaths(trace.geometry);summary.mappedLayouts++;
   if(layout.metadata.trackId!==track.id||layout.metadata.layoutId!==item.id)throw new Error('Crossing audit: layout identity mismatch');
   layoutSet.push({trackId:track.id,layoutId:item.id,sha256:hash(bytes)});
   if(paths.length!==1){if(layout.metadata.borderComposition){if(layout.metadata.borderComposition.some(c=>!track.layouts.some((l:{id:string;file:string|null})=>l.id===c.sourceLayoutId&&l.file)))throw new Error('Crossing audit: unregistered network component');summary.networksDelegatedToComponents++;}else summary.networksWithoutComposition++;continue;}
   summary.singlePathsAudited++;
   const recipeFile=`${sourcesRoot}/${track.id}/layouts/${item.id}.json`,recipeBytes=await readFile(recipeFile),recipe=JSON.parse(recipeBytes.toString()),root=resolve(sourcesRoot,track.id),sourceName=recipe.snapshotFile??(await read(`${root}/import.json`)).snapshotFile??'osm.json',snapshotFile=resolve(root,sourceName);
   if(recipe.trackId!==track.id||recipe.layoutId!==item.id)throw new Error('Crossing audit: recipe identity mismatch');
   if(dirname(snapshotFile)!==root)throw new Error('Crossing audit: unsafe source snapshot');
   const snapshotBytes=await readFile(snapshotFile),snapshotSha256=hash(snapshotBytes);
   if(snapshotSha256!==recipe.snapshotSha256)throw new Error(`Crossing audit: source snapshot changed for ${track.id}/${item.id}`);
   const source=JSON.parse(snapshotBytes.toString()),crossings=auditGradeCrossings(paths[0],layout.metadata.closed,source.elements??[],recipe.segments??[]);
   if(!crossings.length)continue;
   const grade=layout.metadata.borderInference?.gradeSeparation;
   const ground=layout.metadata.model3d?.kind!=='surface'?layout.metadata.model3d?.sharedGround:undefined;
   if(ground){await verifySharedGroundSource(layout,ground,sourcesRoot);buildRoad(layout);}
   if(grade){
    await verifyGradeSource(layout,grade,sourcesRoot);
    const pair=Object.fromEntries(['inner','outer'].map(role=>[role,geometryPaths(layout.features.find(f=>f.properties.role===role)!.geometry)[0]])) as {inner:Position[];outer:Position[]};assertGradeRibbon(pair,grade);
   }
   summary.layoutsWithCrossings++;
   const findings=crossings.map(crossing=>{
    const status=modelCrossingStatus(layout,crossing);summary.crossings++;
    if(status==='source-profile-present')summary.sourceProfilesPresent++;
    else if(status==='shared-ground-junction')summary.sharedGroundJunctions++;
    else if(status==='bridge-profile-missing-playable-model')summary.bridgeProfilesMissingInPlayableModels++;
    else if(status==='unexplained-source-crossing')summary.unexplainedSourceCrossings++;
    else summary.bridgeProfilesMissingWithoutPlayback++;
    let runtime:ReturnType<typeof runtimeCrossingLevels>|{status:'runtime-error';reason:string};
    try{runtime=crossing.kind==='crossing'?runtimeCrossingLevels(layout,crossing.coordinate):undefined;}catch(error){runtime={status:'runtime-error',reason:(error as Error).message};}
    if(runtime?.status==='sampled'&&runtime.verticalSeparationM<3)summary.runtimeCrossingsBelowThreeMetres++;
    if(runtime&&runtime.status!=='sampled')summary.runtimeCrossingsUnresolved++;
    return{...crossing,profileStatus:status,...(runtime?{runtime}:{})};
   });
   records.push({trackId:track.id,layoutId:item.id,file,traceSha256:hash(JSON.stringify(trace.geometry)),hasBorders:['inner','outer'].every(role=>layout.features.some(f=>f.properties.role===role)),modelKind:layout.metadata.model3d?(layout.metadata.model3d.kind??'lap'):null,source:{recipeFile,recipeSha256:hash(recipeBytes),snapshotFile:`${sourcesRoot}/${track.id}/${sourceName}`,snapshotSha256},crossings:findings});
  }
 }
 return{schemaVersion:1,mappedLayoutSetSha256:hash(JSON.stringify(layoutSet)),note:'Diagnostic audit of every mapped single-path trace, including layouts with existing borders and models. Composed networks delegate to their independently audited component layouts; uncomposed networks remain unverified. Runtime crossing levels measure the saved reconstruction, not the physical bridge or vehicle clearance. A three-metre difference is only a diagnostic threshold. Missing source profiles, unexplained intersections and runtime errors remain unresolved; model availability does not establish accurate bridge elevations. No source geometry, borders, timing or models are changed.',summary,records};
}
async function main(){
 const i=process.argv.indexOf('--output'),output=i<0?undefined:process.argv[i+1];if(!output||output.startsWith('--'))throw new Error('Use --output /path/to/model-crossing-audit.json');
 const report=await collectModelCrossingAudit(),bytes=JSON.stringify(report,null,2)+'\n';
 if(process.argv.includes('--check')){if(await readFile(output,'utf8')!==bytes)throw new Error('Model crossing audit is stale; regenerate before publishing');}else await writeFile(output,bytes);
 console.log(report.summary);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
