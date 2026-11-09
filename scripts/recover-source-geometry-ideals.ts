import {readFile,writeFile} from 'node:fs/promises';import {dirname,join} from 'node:path';import {isDeepStrictEqual} from 'node:util';
import type {Layout} from '../schemas/data';import {idealSourceGeometryReviewSchema} from '../schemas/ideal-source-geometry';import {sourceGeometryIdealFeature} from './ideal-source-geometry';import {composeIdealLine} from './compose-ideal-lines';import {serializeLayout} from './layout-borders';
const load=async(p:string)=>JSON.parse(await readFile(p,'utf8')),pins=(await load('sources/research/ideal-source-geometry-reviews.json') as unknown[]).map(p=>idealSourceGeometryReviewSchema.parse(p)),check=process.argv.includes('--check'),[shard,count]=(process.argv[2]??'0/1').split('/').map(Number),rows=check?(await load('data/ideal-lines-coverage.json')).records:await load('.local/ideal-generation/final-unavailable.json'),report=[];
for(const [i,row] of rows.entries()){
 if(!check&&i%count!==shard)continue;const d=await load(row.file) as Layout,pin=pins.find(p=>p.trackId===d.metadata.trackId&&p.layoutId===d.metadata.layoutId),related=pin||d.metadata.borderComposition?.some(c=>pins.some(p=>p.trackId===d.metadata.trackId&&p.layoutId===c.sourceLayoutId));
 if(check&&!related)continue;if(!pin&&!check){report.push({...row,status:'unavailable'});continue;}
 try{
  let ideal;
  if(pin)ideal=sourceGeometryIdealFeature(d,pin);else{
   const dir=dirname(dirname(row.file)),track=await load(join(dir,'track.json')),sources=await Promise.all(d.metadata.borderComposition!.map(async c=>load(join(dir,track.layouts.find((l:{id:string})=>l.id===c.sourceLayoutId).file))));ideal=composeIdealLine(d,sources);if(!ideal)throw Error('Qualified component composition is unavailable');
  }
  if(check){if(!isDeepStrictEqual(d.features.find(f=>f.properties.role==='ideal'),ideal))throw Error('Qualified source ideal differs from its exact review/component replay');}else{d.features=d.features.filter(f=>f.properties.role!=='ideal');d.features.push(ideal);await writeFile(row.file,serializeLayout(d));}
  report.push({file:row.file,status:'generated'});
 }catch(e){if(check)throw e;report.push({file:row.file,status:'unavailable',reason:String(e)});}
}
if(!check)await writeFile(`.local/ideal-generation/source-geometry-${shard}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
