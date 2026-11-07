import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assemble} from '../scripts/route';
import {imageryCoordinates,validateImageryRaster} from '../scripts/imagery-course';
import {buildComponentNetwork} from '../scripts/component-network';
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8')),hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
test('Ruapuna Eastern corrects the false Northern OSM spur with independently pinned imagery and preserves other layouts',async()=>{
 const root='sources/nz-ruapuna-e0b8962a',dir='data/new-zealand/nz-ruapuna-e0b8962a',proof=await read('sources/research/ruapuna-eastern-route-correction.json'),track=await read(dir+'/track.json'),recipe=await read(root+'/layouts/ruapuna-eastern-course.json'),source=await read(root+'/'+recipe.snapshotFile),raster=await readFile(root+'/'+source.imageryFile);
 assert.equal(createHash('sha256').update(raster).digest('hex'),source.imagerySha256);validateImageryRaster(source,raster);assert.equal(source.license,'CC-BY-4.0');assert.match(source.attribution,/Environment Canterbury/);
 const eastern=await read(dir+'/layouts/ruapuna-eastern-course.geojson'),trace=imageryCoordinates(source),oldSource=await read(root+'/'+proof.previousEasternRecipe.snapshotFile),old=assemble(oldSource.elements,proof.previousEasternRecipe.segments,true);
 assert.notDeepEqual(trace,old);assert.deepEqual(eastern.features.find((f:any)=>f.properties.role==='trace').geometry.coordinates,trace);assert.deepEqual(trace[0],trace.at(-1));assert.ok(eastern.metadata.lengthM>1050&&eastern.metadata.lengthM<1150);assert.equal(eastern.metadata.timingStatus,'missing');assert.equal(eastern.metadata.timing,undefined);
 const networkRecipe=await read(root+'/layouts/ruapuna.json'),network=await buildComponentNetwork(networkRecipe,track),coordinates=network.features[0].geometry.coordinates;
 assert.equal(networkRecipe.components.length,5);assert.equal(coordinates.length,5);
 for(const saved of proof.preservedLayouts){
  const d=await read(dir+'/layouts/'+saved.layoutId+'.geojson'),g=d.features.find((f:any)=>f.properties.role==='trace').geometry;
  assert.equal(hash(g),saved.traceSha256);assert.equal(hash(d.features.filter((f:any)=>['inner','outer'].includes(f.properties.role))),saved.borderFeaturesSha256);assert.equal(hash(d.metadata.model3d),saved.modelSha256);assert.equal(d.metadata.timingStatus,saved.timingStatus);assert.deepEqual(coordinates[networkRecipe.components.findIndex((c:any)=>c.layoutId===saved.layoutId)],g.coordinates);
 }
 assert.deepEqual(coordinates[4],trace);
});
