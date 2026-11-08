import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {z} from 'zod';
import {indexSchema,validateTrack,validateLayout,type Layout,type Track} from '../schemas/data';
import {roadRings} from '../src/boundary-path';

export const originalBorderReuseSchema=z.strictObject({
 sourceLayoutId:z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
 traceSha256:z.string().regex(/^[a-f0-9]{64}$/),
 bordersSha256:z.string().regex(/^[a-f0-9]{64}$/),
 sourceTrackId:z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
});
export const geometryHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const borders=(layout:Layout)=>['inner','outer'].flatMap(role=>layout.features.filter(f=>f.properties.role===role));

// Resolve cross-entry aliases through the catalogue, never through a recipe-supplied path.
export async function originalBorderSource(track:Track,trackFile:string,reference:unknown){
 const pin=originalBorderReuseSchema.parse(reference),json=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
 let sourceTrack=track,sourceFile=trackFile;
 if(pin.sourceTrackId&&pin.sourceTrackId!==track.id){
  const catalogue=indexSchema.parse(await json('data/index.json')),entry=catalogue.tracks.find(t=>t.id===pin.sourceTrackId);
  if(!entry)throw new Error('Original border source track is not registered');
  sourceFile=`data/${entry.file}`;sourceTrack=validateTrack(await json(sourceFile));
  if(sourceTrack.id!==pin.sourceTrackId)throw new Error('Original border source track identity changed');
 }
 const entry=sourceTrack.layouts.find(l=>l.id===pin.sourceLayoutId);
 if(!entry?.file)throw new Error('Original border source is not a registered mapped layout');
 return validateLayout(await json(`${dirname(sourceFile)}/${entry.file}`),sourceTrack,entry.id);
}

// Reuse is deliberately exact: no phase changes, fitting, nearest-route matching or inferred chains.
export function reuseOriginalBorders(target:Layout,source:Layout,reference:unknown){
 const pin=originalBorderReuseSchema.parse(reference);
 if(source.metadata.trackId!==(pin.sourceTrackId??target.metadata.trackId)||source.metadata.layoutId!==pin.sourceLayoutId||
  (target.metadata.trackId===source.metadata.trackId&&target.metadata.layoutId===source.metadata.layoutId))
  throw new Error('Original border reuse requires a distinct layout with the pinned source identity');
 for(const layout of [target,source]){
  if(!layout.metadata.closed||layout.metadata.geometryKind==='network'||layout.metadata.borderInference||layout.metadata.borderComposition)
   throw new Error('Original border reuse requires closed routes without inference or composition');
 }
 if(source.metadata.notes.some(note=>note.startsWith('Original borders reused from ')))throw new Error('Original border reuse cannot chain through another reused layout');
 const trace=(layout:Layout)=>layout.features.find(f=>f.properties.role==='trace')?.geometry;
 if(trace(source)?.type!=='LineString'||trace(target)?.type!=='LineString'||geometryHash(trace(source))!==pin.traceSha256||JSON.stringify(trace(target))!==JSON.stringify(trace(source)))
  throw new Error('Original border reuse requires the pinned identical trace, direction and phase');
 const pair=borders(source);
 if(pair.length!==2||pair[0].properties.role!=='inner'||pair[1].properties.role!=='outer'||pair.some(f=>{
  if(f.geometry.type!=='LineString'||!('license'in f.properties)||f.properties.license!=='LicenseRef-Track-Borders')return true;
  const points=f.geometry.coordinates;
  return points.length<4||JSON.stringify(points[0])!==JSON.stringify(points.at(-1));
 }))throw new Error('Original border reuse requires exactly one closed pair with original border rights');
 if(geometryHash(pair)!==pin.bordersSha256)throw new Error('Original border reuse: pinned border features or rights changed');
 if(source.metadata.trackId!==target.metadata.trackId)roadRings(source);
 const existing=borders(target);
 if(existing.length&&JSON.stringify(existing)!==JSON.stringify(pair))throw new Error('Original border reuse would replace different existing borders');
 const identity=source.metadata.trackId===target.metadata.trackId?source.metadata.layoutId:`${source.metadata.trackId}/${source.metadata.layoutId}`;
 return {borders:structuredClone(pair),note:`Original borders reused from ${identity}; exact trace SHA-256 ${pin.traceSha256}; border features SHA-256 ${pin.bordersSha256}. Border rights remain LicenseRef-Track-Borders; timing is not inherited.`};
}
