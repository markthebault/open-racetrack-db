import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Layout} from '../schemas/data';

export const originalBorderReuseSchema=z.strictObject({
 sourceLayoutId:z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
 traceSha256:z.string().regex(/^[a-f0-9]{64}$/),
 bordersSha256:z.string().regex(/^[a-f0-9]{64}$/),
});
export const geometryHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const borders=(layout:Layout)=>['inner','outer'].flatMap(role=>layout.features.filter(f=>f.properties.role===role));

// Reuse is deliberately exact: no phase changes, fitting, nearest-route matching or inferred chains.
export function reuseOriginalBorders(target:Layout,source:Layout,reference:unknown){
 const pin=originalBorderReuseSchema.parse(reference);
 if(target.metadata.trackId!==source.metadata.trackId||source.metadata.layoutId!==pin.sourceLayoutId||target.metadata.layoutId===source.metadata.layoutId)
  throw new Error('Original border reuse requires a distinct registered layout at the same venue');
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
 const existing=borders(target);
 if(existing.length&&JSON.stringify(existing)!==JSON.stringify(pair))throw new Error('Original border reuse would replace different existing borders');
 return {borders:structuredClone(pair),note:`Original borders reused from ${source.metadata.layoutId}; exact trace SHA-256 ${pin.traceSha256}; border features SHA-256 ${pin.bordersSha256}. Border rights remain LicenseRef-Track-Borders; timing is not inherited.`};
}
