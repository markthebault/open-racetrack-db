import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {layoutSchema} from '../schemas/data';
import {auditGradeCrossings} from '../scripts/audit-grade-crossings';
import {modelCrossingStatus,runtimeCrossingLevels,collectModelCrossingAudit} from '../scripts/audit-model-crossings';
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));

test('an existing model does not hide a missing source bridge profile or flattened road levels',async()=>{
 const layout=layoutSchema.parse(await read('data/new-zealand/nz-highlands-motorsports-park-full-2952eb45/layouts/highlands-motorsports-park-full.geojson'));
 const recipe=await read('sources/nz-highlands-motorsports-park-full-2952eb45/layouts/highlands-motorsports-park-full.json'),snapshot=await read('sources/nz-highlands-motorsports-park-full-2952eb45/'+(recipe.snapshotFile??'osm.json'));
 const trace=layout.features.find(f=>f.properties.role==='trace')!;assert.equal(trace.geometry.type,'LineString');if(trace.geometry.type!=='LineString')throw Error('Expected one route');
 const crossings=auditGradeCrossings(trace.geometry.coordinates,true,snapshot.elements,recipe.segments);assert.equal(crossings.length,1);assert.equal(crossings[0].status,'source-bridge-needs-profile');
 const flat=structuredClone(layout);delete flat.metadata.borderInference?.gradeSeparation;
 if(!flat.metadata.model3d||flat.metadata.model3d.kind==='surface'||flat.metadata.model3d.kind==='run')throw Error('Fixture needs a closed-lap model');
 const end=flat.metadata.model3d.referenceLengthM;flat.metadata.model3d.elevation=[[0,200],[end/2,200],[end,200]];
 assert.equal(modelCrossingStatus(flat,crossings[0]),'bridge-profile-missing-playable-model');
 const runtime=runtimeCrossingLevels(flat,crossings[0].coordinate);assert.equal(runtime?.status,'sampled');if(runtime?.status!=='sampled')throw Error('Expected a crossing in the runtime road');assert.equal(runtime.verticalSeparationM,0);assert.equal(runtime.levels.length,2);
 flat.metadata.model3d.elevation=[[0,200],[end*.3,200],[end*.45,200],[end*.65,208],[end*.85,208],[end,200]];
 const raised=runtimeCrossingLevels(flat,crossings[0].coordinate);assert.equal(raised?.status,'sampled');if(raised?.status==='sampled')assert.ok(raised.verticalSeparationM>7.9);
 assert.equal(modelCrossingStatus(flat,crossings[0]),'bridge-profile-missing-playable-model');
 delete flat.metadata.model3d;assert.equal(modelCrossingStatus(flat,crossings[0]),'bridge-profile-missing-no-model');assert.equal(runtimeCrossingLevels(flat,crossings[0].coordinate),undefined);
});

test('unexplained crossings are not promoted to bridge claims',()=>{
 const trace:[number,number][]=[[-.0001,-.0001],[.0001,.0001],[-.0001,.0001],[.0001,-.0001],[-.0001,-.0001]],crossing=auditGradeCrossings(trace,true)[0];
 assert.equal(crossing.status,'unexplained');const layout={metadata:{}} as Parameters<typeof modelCrossingStatus>[0];assert.equal(modelCrossingStatus(layout,crossing),'unexplained-source-crossing');
});

test('the audit includes already bordered models and missing layouts without modifying either',async t=>{
 const base=await mkdtemp(join(tmpdir(),'model-crossing-audit-'));t.after(()=>rm(base,{recursive:true,force:true}));const data=join(base,'data'),sources=join(base,'sources'),id='nz-highlands-motorsports-park-full-2952eb45';
 const original=await read(`data/new-zealand/${id}/layouts/highlands-motorsports-park-full.geojson`),recipe=await read(`sources/${id}/layouts/highlands-motorsports-park-full.json`),snapshot=await readFile(`sources/${id}/${recipe.snapshotFile??'osm.json'}`),sha256=createHash('sha256').update(snapshot).digest('hex');
 await mkdir(join(data,id,'layouts'),{recursive:true});await mkdir(join(sources,id,'layouts'),{recursive:true});const save=async(p:string,v:unknown)=>writeFile(p,JSON.stringify(v));
 await save(join(data,'index.json'),{tracks:[{file:`${id}/track.json`}]});await save(join(data,id,'track.json'),{id,layouts:['with-model','without-model'].map(id=>({id,file:`layouts/${id}.geojson`}))});await writeFile(join(sources,id,'source.json'),snapshot);
 const files=[];
 for(const layoutId of ['with-model','without-model']){
  const layout=structuredClone(original);layout.metadata.layoutId=layoutId;
  if(layoutId==='without-model'){layout.features=layout.features.filter((f:any)=>!['inner','outer'].includes(f.properties.role));delete layout.metadata.model3d;}
  const file=join(data,id,'layouts',`${layoutId}.geojson`);await save(file,layout);files.push({file,bytes:await readFile(file,'utf8')});
  await save(join(sources,id,'layouts',`${layoutId}.json`),{...recipe,layoutId,snapshotFile:'source.json',snapshotSha256:sha256});
 }
 const report=await collectModelCrossingAudit(data,sources);assert.equal(report.summary.mappedLayouts,2);assert.equal(report.summary.singlePathsAudited,2);assert.equal(report.summary.bridgeProfilesMissingInPlayableModels,1);assert.equal(report.summary.bridgeProfilesMissingWithoutPlayback,1);assert.deepEqual(report.records.map(r=>r.hasBorders),[true,false]);
 for(const f of files)assert.equal(await readFile(f.file,'utf8'),f.bytes);
 await writeFile(join(sources,id,'source.json'),'{}');await assert.rejects(collectModelCrossingAudit(data,sources),/source snapshot changed/);
});
