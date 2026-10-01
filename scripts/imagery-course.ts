import {z} from 'zod';
import {bounds,distance,equal,length,type Position} from '../src/geo';
import {validateLayout,type Track} from '../schemas/data';

const pixel=z.tuple([z.number().finite().nonnegative(),z.number().finite().nonnegative()]);
export const imageryCourseSchema=z.strictObject({
 schemaVersion:z.literal(1),sourceKind:z.literal('georeferenced-imagery'),
 sourceId:z.string().min(1),attribution:z.string().min(1),license:z.enum(['public-domain','Etalab-2.0']),
 imageryFile:z.string().regex(/^[a-z0-9][a-z0-9-]*\.png$/),imagerySha256:z.string().regex(/^[a-f0-9]{64}$/),
 sourceUrl:z.url(),reuseEvidenceUrl:z.url(),retrievedAt:z.iso.datetime(),
 width:z.number().int().positive(),height:z.number().int().positive(),
 extent:z.strictObject({xmin:z.number().finite(),ymin:z.number().finite(),xmax:z.number().finite(),ymax:z.number().finite(),spatialReference:z.literal(3857)}),
 pixels:z.array(pixel).min(3),closed:z.boolean(),identificationUrl:z.url(),evidence:z.string().min(1)
});
export type ImageryCourse=z.infer<typeof imageryCourseSchema>;

export function validateImageryRaster(input:unknown,bytes:Uint8Array){
 const source=imageryCourseSchema.parse(input),png=Buffer.from(bytes);
 if(png.length<33||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||png.toString('ascii',12,16)!=='IHDR')throw new Error('Imagery source must be a PNG raster');
 if(png.readUInt32BE(16)!==source.width||png.readUInt32BE(20)!==source.height)throw new Error('Imagery raster dimensions disagree with georeferencing');
}

// Pixel centers use the exact exported Web Mercator extent. No external timing or
// reference geometry enters this conversion; the input is a pinned aerial image.
export function imageryCoordinates(input:unknown):Position[]{
 const source=imageryCourseSchema.parse(input),{extent:e,width,height,pixels}=source;
 if(e.xmin>=e.xmax||e.ymin>=e.ymax)throw new Error('Imagery extent is inverted');
 for(const [x,y]of pixels)if(x>=width||y>=height)throw new Error('Imagery vertex outside raster');
 const coordinates=pixels.map(([x,y]):Position=>{
  const mx=e.xmin+(x+.5)/width*(e.xmax-e.xmin),my=e.ymax-(y+.5)/height*(e.ymax-e.ymin);
  return [Number((mx/6378137*180/Math.PI).toFixed(7)),Number((Math.atan(Math.sinh(my/6378137))*180/Math.PI).toFixed(7))];
 });
 if(source.closed!==equal(coordinates[0],coordinates.at(-1)!))throw new Error('Imagery route closure mismatch');
 for(let i=1;i<coordinates.length;i++){
  if(equal(coordinates[i-1],coordinates[i]))throw new Error('Imagery duplicate vertex');
  if(distance(coordinates[i-1],coordinates[i])>80)throw new Error('Imagery route requires closer centerline vertices');
 }
 return coordinates;
}

export function buildImageryCourse(recipe:any,input:unknown,track:Track){
 const source=imageryCourseSchema.parse(input),coordinates=imageryCoordinates(source);
 if(recipe.geometrySource!=='imagery'||recipe.sourceId!==source.sourceId||recipe.closed!==source.closed)throw new Error('Imagery recipe/source mismatch');
 if(!track.sources.some(s=>s.id===source.sourceId&&s.type==='imagery'&&s.license===source.license&&s.url===source.sourceUrl))throw new Error('Imagery source rights are not registered');
 if(recipe.gates?.length)throw new Error('Imagery timing needs a separate independently documented recipe');
 return validateLayout({type:'FeatureCollection',bbox:bounds(coordinates),metadata:{schemaVersion:1,trackId:track.id,layoutId:recipe.layoutId,license:'ODbL-1.0',attribution:source.attribution,closed:source.closed,geometryStatus:'draft',timingStatus:'missing',timingMode:recipe.timingMode,lengthM:length(coordinates),reviewedAt:null,notes:recipe.notes},features:[{type:'Feature',id:'trace',properties:{role:'trace',sourceIds:[source.sourceId]},geometry:{type:'LineString',coordinates}}]},track,recipe.layoutId);
}
