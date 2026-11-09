import {readFile,writeFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import type {Layout} from '../schemas/data';
import {idealNetworkReviewSchema} from '../schemas/ideal-network-review';
import {networkGroundIdealLine} from './ideal-network-ground';
import {serializeLayout} from './layout-borders';
const load=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const pins=(await load('sources/research/ideal-network-reviews.json') as unknown[]).map(p=>idealNetworkReviewSchema.parse(p));
const check=process.argv.includes('--check'),[shard,count]=(process.argv[2]??'0/1').split('/').map(Number);
const rows=check?(await load('data/ideal-lines-coverage.json')).records:await load('.local/ideal-generation/final-unavailable.json'),report=[];
for(const [i,row] of rows.entries()){
 if(!check&&i%count!==shard)continue;
 const d=await load(row.file) as Layout,existing=d.features.find(f=>f.properties.role==='ideal'),pin=pins.find(p=>p.trackId===d.metadata.trackId&&p.layoutId===d.metadata.layoutId);
 if(check&&(existing?.properties.role!=='ideal'||!existing.properties.networkReview))continue;
 if(!pin){if(check)throw Error('Stored network ideal lacks a canonical review');report.push({...row,status:'unavailable'});continue;}
 try{
  const result=networkGroundIdealLine(d,pin),ideal:Layout['features'][number]={type:'Feature',id:'ideal',properties:{role:'ideal',sourceIds:[],estimated:true,method:'bounded-minimum-curvature-local-time-v1',edgeMarginM:.5,boundaryModel:'reviewed-network-ground-v1',networkReview:pin,borderLicenses:[...new Set([...d.features.filter(f=>f.properties.role==='inner'||f.properties.role==='outer').map(f=>'license' in f.properties?f.properties.license:''),pin.imagery.license])]},geometry:{type:'MultiLineString',coordinates:result.branches}};
  if(check){if(!isDeepStrictEqual(existing,ideal))throw Error('Stored network ideal differs from its pinned reconstruction');}else{d.features=d.features.filter(f=>f.properties.role!=='ideal');d.features.push(ideal);await writeFile(row.file,serializeLayout(d));}
  report.push({file:row.file,status:'generated'});
 }catch(e){if(check)throw e;report.push({file:row.file,status:'unavailable',reason:String(e)});}
}
if(!check)await writeFile(`.local/ideal-generation/network-${shard}.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
