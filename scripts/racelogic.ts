import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {XMLParser} from 'fast-xml-parser';
import type {Position} from '../src/geo';
export const timingXmlPath='racelogic-tracks-db/Start Finish Database/StartFinishDataBase.xml';
export type TimingRecord={id:string;country:string;name:string;gates:{role:'start_finish'|'start'|'finish';point:Position}[]};
export function parseTimingXml(xml:string):TimingRecord[]{
 const parsed=new XMLParser({ignoreAttributes:false,attributeNamePrefix:''}).parse(xml),result:TimingRecord[]=[];
 for(const country of [parsed.RacelogicStartFinishDatabase.country].flat())for(const circuit of [country.circuits.circuit].flat()){
  const name=String(circuit.name).trim(),separate=Boolean(circuit.splitinfo?.Finish);
  const gates=[{role:separate?'start':'start_finish',value:circuit.splitinfo?.startFinish},...(separate?[{role:'finish',value:circuit.splitinfo.Finish}]:[])].map(({role,value})=>{
   const point:Position=[Number(value?.long)/60,Number(value?.lat)/60];
   if(!point.every(Number.isFinite)||Math.abs(point[0])>180||Math.abs(point[1])>90)throw new Error(`${name}: invalid timing GPS`);
   return {role:role as TimingRecord['gates'][number]['role'],point};
  });
  result.push({id:`${country.name}/${name}`,country:country.name,name,gates});
 }
 if(new Set(result.map(r=>r.id)).size!==result.length)throw new Error('Duplicate country/layout record names');
 return result;
}
export function readTimingArchive(archive:string){
 // This exact whitelist is the only archive entry opened. Do not inspect CIR or boundary files.
 const xml=execFileSync('unzip',['-p',archive,timingXmlPath],{maxBuffer:2e6}).toString('utf8');
 return {records:parseTimingXml(xml),xmlSha256:createHash('sha256').update(xml).digest('hex')};
}
