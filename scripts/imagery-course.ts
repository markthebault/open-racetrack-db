import {z} from 'zod';
import {bounds,distance,equal,length,networkLength,type Position} from '../src/geo';
import {validateLayout,type Track} from '../schemas/data';

const pixel=z.tuple([z.number().finite().nonnegative(),z.number().finite().nonnegative()]);
const imagerySourceFields=z.strictObject({
 schemaVersion:z.literal(1),sourceKind:z.literal('georeferenced-imagery'),
 sourceId:z.string().min(1),attribution:z.string().min(1),license:z.enum(['public-domain','Etalab-2.0','LicenseRef-GUGiK-open-data','OGL-3.0','DL-DE-BY-2.0']),
 imageryFile:z.string().regex(/^[a-z0-9][a-z0-9-]*\.png$/),imagerySha256:z.string().regex(/^[a-f0-9]{64}$/),
 sourceUrl:z.url(),reuseEvidenceUrl:z.url(),retrievedAt:z.iso.datetime(),
 width:z.number().int().positive(),height:z.number().int().positive(),
 extent:z.strictObject({xmin:z.number().finite(),ymin:z.number().finite(),xmax:z.number().finite(),ymax:z.number().finite(),spatialReference:z.literal(3857)}),
 identificationUrl:z.url(),evidence:z.string().min(1)
});
const imageryRouteSchema=imagerySourceFields.extend({pixels:z.array(pixel).min(3),closed:z.boolean()});
const imageryNetworkSchema=imagerySourceFields.extend({
 geometryKind:z.literal('network'),closed:z.literal(false),
 paths:z.array(z.strictObject({name:z.string().trim().min(1),pixels:z.array(pixel).min(2),closed:z.boolean(),identificationUrl:z.url(),evidence:z.string().trim().min(1)})).min(2)
});
export const imageryCourseSchema=z.union([imageryRouteSchema,imageryNetworkSchema]);
export type ImageryCourse=z.infer<typeof imageryCourseSchema>;

export function validateImageryRaster(input:unknown,bytes:Uint8Array){
 const source=imageryCourseSchema.parse(input),png=Buffer.from(bytes);
 if(png.length<33||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||png.toString('ascii',12,16)!=='IHDR')throw new Error('Imagery source must be a PNG raster');
 if(png.readUInt32BE(16)!==source.width||png.readUInt32BE(20)!==source.height)throw new Error('Imagery raster dimensions disagree with georeferencing');
}

// Pixel centers use the exact exported Web Mercator extent. No external timing or
// reference geometry enters this conversion; the input is a pinned aerial image.
function pixelCoordinates(source:ImageryCourse,pixels:[number,number][],closed:boolean):Position[]{
 const {extent:e,width,height}=source;
 if(e.xmin>=e.xmax||e.ymin>=e.ymax)throw new Error('Imagery extent is inverted');
 for(const [x,y]of pixels)if(x>=width||y>=height)throw new Error('Imagery vertex outside raster');
 const coordinates=pixels.map(([x,y]):Position=>{
  const mx=e.xmin+(x+.5)/width*(e.xmax-e.xmin),my=e.ymax-(y+.5)/height*(e.ymax-e.ymin);
  return [Number((mx/6378137*180/Math.PI).toFixed(7)),Number((Math.atan(Math.sinh(my/6378137))*180/Math.PI).toFixed(7))];
 });
 if(closed!==equal(coordinates[0],coordinates.at(-1)!))throw new Error('Imagery route closure mismatch');
 if(closed&&new Set(coordinates.map(p=>p.join(','))).size<3)throw new Error('Imagery closed path requires three distinct vertices');
 for(let i=1;i<coordinates.length;i++){
  if(equal(coordinates[i-1],coordinates[i]))throw new Error('Imagery duplicate vertex');
  if(distance(coordinates[i-1],coordinates[i])>80)throw new Error('Imagery route requires closer centerline vertices');
 }
 return coordinates;
}

export function imageryPaths(input:unknown):Position[][]{
 const source=imageryCourseSchema.parse(input);
 if('pixels'in source)return [pixelCoordinates(source,source.pixels,source.closed)];
 if(new Set(source.paths.map(p=>p.name)).size!==source.paths.length)throw new Error('Imagery network requires distinct component names');
 const paths=source.paths.map(p=>pixelCoordinates(source,p.pixels,p.closed));
 const keys=paths.map(p=>p.slice(1).map((v,i)=>[p[i].join(','),v.join(',')].sort().join('|')).sort().join(';'));
 if(new Set(keys).size!==keys.length)throw new Error('Imagery network contains duplicate paths');
 return paths;
}

export function imageryCoordinates(input:unknown):Position[]{
 const paths=imageryPaths(input);
 if(paths.length!==1)throw new Error('Imagery network cannot be flattened into a lap');
 return paths[0];
}

export function buildImageryCourse(recipe:any,input:unknown,track:Track){
 const source=imageryCourseSchema.parse(input),paths=imageryPaths(source),isNetwork='paths'in source,coordinates=paths[0];
 if(recipe.geometrySource!=='imagery'||recipe.sourceId!==source.sourceId||recipe.closed!==source.closed)throw new Error('Imagery recipe/source mismatch');
 if(isNetwork&&(recipe.schemaVersion!==2||recipe.geometryKind!=='network')||!isNetwork&&recipe.geometryKind==='network')throw new Error('Imagery recipe/network mismatch');
 if(!track.sources.some(s=>s.id===source.sourceId&&s.type==='imagery'&&s.license===source.license&&s.url===source.sourceUrl))throw new Error('Imagery source rights are not registered');
 if(recipe.gates?.length)throw new Error('Imagery timing needs a separate independently documented recipe');
 return validateLayout({type:'FeatureCollection',bbox:bounds(paths.flat()),metadata:{schemaVersion:isNetwork?2:1,...(isNetwork?{geometryKind:'network'}:{}),trackId:track.id,layoutId:recipe.layoutId,license:'ODbL-1.0',attribution:source.attribution,closed:source.closed,geometryStatus:'draft',timingStatus:'missing',timingMode:recipe.timingMode,lengthM:isNetwork?networkLength(paths):length(coordinates),reviewedAt:null,notes:recipe.notes},features:[{type:'Feature',id:'trace',properties:{role:'trace',sourceIds:[source.sourceId]},geometry:isNetwork?{type:'MultiLineString',coordinates:paths}:{type:'LineString',coordinates}}]},track,recipe.layoutId);
}
