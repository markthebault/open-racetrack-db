import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {XMLParser} from 'fast-xml-parser';
import type {Position} from '../src/geo';
export const timingXmlSuffix='/Start Finish Database/StartFinishDataBase.xml';
export type TimingRecord={id:string;country:string;name:string;nominalLengthM?:number;gates:{role:'start_finish'|'start'|'finish';point:Position}[]};
export function parseTimingXml(xml:string):TimingRecord[]{
 const parsed=new XMLParser({ignoreAttributes:false,attributeNamePrefix:''}).parse(xml),result:TimingRecord[]=[];
 const root:any=Object.values(parsed).find((v:any)=>v?.country);if(!root)throw new Error('Timing XML has no country records');
 for(const country of [root.country].flat())for(const circuit of [country.circuits.circuit].flat()){
  const name=String(circuit.name).trim(),separate=Boolean(circuit.splitinfo?.Finish);
  const gates=[{role:separate?'start':'start_finish',value:circuit.splitinfo?.startFinish},...(separate?[{role:'finish',value:circuit.splitinfo.Finish}]:[])].map(({role,value})=>{
   const point:Position=[Number(value?.long)/60,Number(value?.lat)/60];
   if(!point.every(Number.isFinite)||Math.abs(point[0])>180||Math.abs(point[1])>90)throw new Error(`${name}: invalid timing GPS`);
   return {role:role as TimingRecord['gates'][number]['role'],point};
  });
  const nominal=Number(circuit.length);
  result.push({id:`${country.name}/${name}`,country:country.name,name,gates,...(Number.isFinite(nominal)&&nominal>0&&nominal<100000?{nominalLengthM:nominal}:{})});
 }
 if(new Set(result.map(r=>r.id)).size!==result.length)throw new Error('Duplicate country/layout record names');
 return result;
}
export function readTimingArchive(archive:string){
 // This exact whitelist is the only archive entry opened. Do not inspect CIR or boundary files.
 const entries=execFileSync('unzip',['-Z1',archive],{maxBuffer:4e6}).toString('utf8').split('\n').filter(name=>name.endsWith(timingXmlSuffix));
 if(entries.length!==1)throw new Error('Archive must contain exactly one timing XML at the supported suffix');
 const xml=execFileSync('unzip',['-p',archive,entries[0]],{maxBuffer:2e6}).toString('utf8');
 return {records:parseTimingXml(xml),xmlSha256:createHash('sha256').update(xml).digest('hex')};
}
