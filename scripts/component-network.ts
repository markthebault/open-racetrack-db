import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {bounds,networkLength,type Position} from '../src/geo';
import {validateLayout,type Track} from '../schemas/data';
import {assemble,type Way} from './route';
import {isPitLane} from './selection-source';
import {buildImageryCourse,imageryCourseSchema,validateImageryRaster} from './imagery-course';

const id=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),file=z.string().regex(/^[a-z0-9][a-z0-9-]*\.json$/),sha=z.string().regex(/^[a-f0-9]{64}$/);
const component=z.strictObject({layoutId:id,snapshotFile:file,snapshotSha256:sha,traceSha256:sha});
export const componentNetworkSchema=z.strictObject({
 schemaVersion:z.literal(2),geometryKind:z.literal('network'),geometrySource:z.literal('components'),
 trackId:id,layoutId:id,sourceId:id,snapshotFile:file,snapshotSha256:sha,
 geometryStatus:z.literal('draft'),timingMode:z.enum(['shared','separate']),reviewedAt:z.null(),
 notes:z.array(z.string()),gates:z.tuple([]),components:z.array(component).min(2)
});
const snapshotSchema=z.strictObject({schemaVersion:z.literal(1),sourceKind:z.literal('component-network'),trackId:id,layoutId:id,components:z.array(component).min(2)});
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export const traceHash=(trace:Position[])=>hash(JSON.stringify(trace));

// Rebuild each pinned leaf independently. Close but different source coordinates
// remain different: there is no snapping, connector or implicit node join here.
export async function buildComponentNetwork(input:unknown,track:Track,sourcesRoot='sources'){
 const recipe=componentNetworkSchema.parse(input),root=join(sourcesRoot,recipe.trackId);
 if(recipe.trackId!==track.id||!track.layouts.some(l=>l.id===recipe.layoutId&&l.file))throw new Error('Component network identity mismatch');
 const parentBytes=await readFile(join(root,recipe.snapshotFile));
 if(hash(parentBytes)!==recipe.snapshotSha256)throw new Error('Component network snapshot changed');
 const parent=snapshotSchema.parse(JSON.parse(parentBytes.toString()));
 if(parent.trackId!==recipe.trackId||parent.layoutId!==recipe.layoutId||!isDeepStrictEqual(parent.components,recipe.components))throw new Error('Component network snapshot/recipe mismatch');
 if(new Set(recipe.components.map(c=>c.layoutId)).size!==recipe.components.length)throw new Error('Duplicate component identity');
 const paths:Position[][]=[],sourceIds=new Set<string>(),attributions=new Set<string>();
 for(const pin of recipe.components){
  if(pin.layoutId===recipe.layoutId||!track.layouts.some(l=>l.id===pin.layoutId&&l.file))throw new Error('Component must be a registered distinct mapped leaf');
  const leaf=JSON.parse(await readFile(join(root,'layouts',`${pin.layoutId}.json`),'utf8'));
  if(leaf.trackId!==track.id||leaf.layoutId!==pin.layoutId||leaf.geometryKind==='network'||leaf.geometrySource==='components')throw new Error('Component must be an identified leaf route');
  if(leaf.gates?.length)throw new Error('Component timing gates require explicit trace trimming support');
  if(leaf.snapshotFile!==pin.snapshotFile||leaf.snapshotSha256!==pin.snapshotSha256)throw new Error('Component source pin changed');
  const bytes=await readFile(join(root,pin.snapshotFile));
  if(hash(bytes)!==pin.snapshotSha256)throw new Error('Component snapshot changed');
  let trace:Position[];
  if(leaf.geometrySource==='imagery'){
   const source=imageryCourseSchema.parse(JSON.parse(bytes.toString())),raster=await readFile(join(root,source.imageryFile));
   if(hash(raster)!==source.imagerySha256)throw new Error('Component imagery raster changed');
   validateImageryRaster(source,raster);
   const data=buildImageryCourse(leaf,source,track),feature=data.features[0];
   if(feature.geometry.type!=='LineString')throw new Error('Component imagery must be a single route');
   trace=feature.geometry.coordinates;attributions.add(source.attribution);
  }else{
   if(leaf.geometrySource!==undefined&&leaf.geometrySource!=='osm')throw new Error('Unsupported component geometry source');
   if(!track.sources.some(s=>s.id===leaf.sourceId&&s.type==='osm'&&s.license==='ODbL-1.0'))throw new Error('Component OSM rights are not registered');
   const ways:Way[]=JSON.parse(bytes.toString()).elements.filter((w:any)=>w.type==='way');
   for(const segment of leaf.segments){const tags=ways.find(w=>w.id===segment.wayId)?.tags??{};if(isPitLane({tags}))throw new Error('Component includes a pit lane');}
   trace=assemble(ways,leaf.segments,leaf.closed);attributions.add('© OpenStreetMap contributors');
  }
  if(traceHash(trace)!==pin.traceSha256)throw new Error('Component trace selection changed');
  paths.push(trace);sourceIds.add(leaf.sourceId);
 }
 const keys=paths.map(p=>p.slice(1).map((v,i)=>[p[i].join(','),v.join(',')].sort().join('|')).sort().join(';'));
 if(new Set(keys).size!==keys.length)throw new Error('Component network contains duplicate paths');
 return validateLayout({type:'FeatureCollection',bbox:bounds(paths.flat()),metadata:{schemaVersion:2,geometryKind:'network',trackId:track.id,layoutId:recipe.layoutId,license:'ODbL-1.0',attribution:[...attributions].join('; '),closed:false,geometryStatus:'draft',timingStatus:'missing',timingMode:recipe.timingMode,lengthM:networkLength(paths),reviewedAt:null,notes:recipe.notes},features:[{type:'Feature',id:'trace',properties:{role:'trace',sourceIds:[...sourceIds]},geometry:{type:'MultiLineString',coordinates:paths}}]},track,recipe.layoutId);
}
