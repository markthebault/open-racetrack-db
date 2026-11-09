import type {Position} from '../src/geo';
import {borderPairHash} from './refine-image-borders';
import type {measuredImageBorders} from './measured-image-borders';
/** Stored geometry remains hash-exact. Only opposite roundings at a 7-decimal tie may differ. */
export function assertMeasuredBorderReplay(pair:{inner:Position[];outer:Position[]},expectedHash:string,replay:ReturnType<typeof measuredImageBorders>){
 if(borderPairHash(pair)!==expectedHash)throw Error('Stored measured border hash mismatch');
 if(replay.measurement.resultSha256===expectedHash)return;
 for(const edge of ['inner','outer'] as const){
  if(pair[edge].length!==replay.result[edge].length)throw Error('Measured reconstruction point count changed');
  for(let i=0;i<pair[edge].length;i++)for(let axis=0;axis<2;axis++){
   const stored=pair[edge][i][axis],rebuilt=replay.result[edge][i][axis];if(stored===rebuilt)continue;
   const exact=replay.unrounded[edge][i][axis]*1e7,lower=Math.floor(exact),a=Math.round(stored*1e7),b=Math.round(rebuilt*1e7);
   if(Math.abs(exact-lower-.5)>1e-5||Math.abs(a-b)!==1||Math.min(a,b)!==lower||Math.max(a,b)!==lower+1||Math.abs(stored*1e7-a)>1e-5||Math.abs(rebuilt*1e7-b)>1e-5)throw Error('Measured reconstruction changed beyond a seven-decimal rounding tie');
  }
 }
}
