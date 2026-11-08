import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {exclusion} from './candidates';
import assert from 'node:assert/strict';
import {europeanCountries} from './europe-countries';
import {worldCountries} from './world-countries';
import {validateTrack} from '../schemas/data';
import {buildLicensedImageryRoute} from './licensed-imagery-route';
const worldwide=process.argv.includes('--world'),region=worldwide?'world':'europe',countries=worldwide?worldCountries:europeanCountries;
const json=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
const coverage=await json(`data/${region}-coverage.json`),index=await json('data/index.json');
assert.equal(coverage.schemaVersion,1);assert.equal(coverage.countries.length,countries.length);
for(const country of countries){
 const report=coverage.countries.find((c:any)=>c.country.code===country.code);assert.ok(report);
 if(!['fetched','area-unavailable'].includes(report.status))continue;
 const dir=`sources/${report.sourceRegion??region}/${country.code.toLowerCase()}`,manifest=await json(`${dir}/import.json`),snapshot=await readFile(`${dir}/osm.json`);
 assert.equal(manifest.country.code,country.code);
 assert.equal(createHash('sha256').update(snapshot).digest('hex'),manifest.snapshotSha256);assert.equal(report.snapshotSha256,manifest.snapshotSha256);
 assert.equal(report.pending,coverage.candidates.filter((c:any)=>c.country===country.code&&c.status==='pending').length);
}
for(const candidate of coverage.candidates){
 assert.ok(countries.some(c=>c.code===candidate.country));
 if(candidate.status==='imported-draft')assert.ok(index.tracks.some((t:any)=>t.id===candidate.trackId),`Missing imported track ${candidate.trackId}`);
 if(candidate.status==='existing')for(const id of candidate.trackIds)assert.ok(index.tracks.some((t:any)=>t.id===id));
}
const bootstrap=await json(`sources/${region}/bootstrap.json`);assert.equal(new Set(bootstrap.map((t:any)=>t.id)).size,bootstrap.length);
for(const track of bootstrap){
 assert.ok(index.tracks.some((t:any)=>t.id===track.id));
 if(worldwide){const recipe=await json(`sources/${track.id}/layouts/main.json`),sourceBytes=await readFile(`sources/${track.id}/${recipe.snapshotFile??'osm.json'}`),snapshot=JSON.parse(sourceBytes.toString());
  if(recipe.geometrySource==='licensed-imagery'){
   assert.equal(createHash('sha256').update(sourceBytes).digest('hex'),recipe.snapshotSha256);
   const entry=index.tracks.find((t:any)=>t.id===track.id),current=validateTrack(await json(`data/${entry.file}`)),built=buildLicensedImageryRoute(recipe,snapshot,current),item=current.layouts.find(l=>l.id==='main')!,file=`data/${entry.file.replace(/track.json$/,'')}${item.file}`;
   assert.deepEqual((await json(file)).features.find((f:any)=>f.properties.role==='trace'),built.features[0]);
  }else for(const segment of recipe.segments){const way=snapshot.elements.find((e:any)=>e.type==='way'&&e.id===segment.wayId);assert.ok(way);assert.equal(exclusion(way),undefined,`${track.id}: selected excluded source way ${way.id}`);}}
}
console.log(`Validated ${coverage.countries.length} country acquisition records and the ${region} inventory.`);
