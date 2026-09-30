import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {europeanCountries} from './europe-countries';
const json=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
const coverage=await json('data/europe-coverage.json'),index=await json('data/index.json');
assert.equal(coverage.schemaVersion,1);assert.equal(coverage.countries.length,europeanCountries.length);
for(const country of europeanCountries){
 const report=coverage.countries.find((c:any)=>c.country.code===country.code);assert.ok(report);
 if(report.status!=='fetched')continue;
 const dir=`sources/europe/${country.code.toLowerCase()}`,manifest=await json(`${dir}/import.json`),snapshot=await readFile(`${dir}/osm.json`);
 assert.equal(createHash('sha256').update(snapshot).digest('hex'),manifest.snapshotSha256);assert.equal(report.snapshotSha256,manifest.snapshotSha256);
 assert.equal(report.pending,coverage.candidates.filter((c:any)=>c.country===country.code&&c.status==='pending').length);
}
for(const candidate of coverage.candidates){
 assert.ok(europeanCountries.some(c=>c.code===candidate.country));
 if(candidate.status==='imported-draft')assert.ok(index.tracks.some((t:any)=>t.id===candidate.trackId),`Missing imported track ${candidate.trackId}`);
 if(candidate.status==='existing')for(const id of candidate.trackIds)assert.ok(index.tracks.some((t:any)=>t.id===id));
}
const bootstrap=await json('sources/europe/bootstrap.json');assert.equal(new Set(bootstrap.map((t:any)=>t.id)).size,bootstrap.length);
for(const track of bootstrap)assert.ok(index.tracks.some((t:any)=>t.id===track.id));
console.log(`Validated ${coverage.countries.length} country snapshots and the European inventory.`);
