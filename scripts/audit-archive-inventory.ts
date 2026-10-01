import {execFileSync} from 'node:child_process';import {writeFile} from 'node:fs/promises';
import {readTimingArchive} from './reference-timing';
const args=process.argv.slice(2),archive=args[args.indexOf('--archive')+1];if(!args.includes('--archive')||!archive)throw new Error('Use --archive /absolute/path/to/archive.zip');
const {records,xmlSha256}=readTimingArchive(archive),normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
// List archive member names only. Never open the course-data sections.
const entries=execFileSync('unzip',['-Z1',archive],{maxBuffer:4e6}).toString('utf8').split('\n').filter(p=>!p.startsWith('__MACOSX/'));
const rows=entries.flatMap(p=>{
 const match=p.match(/\/CIR Files\/(?:(?<country>[^/]+)\/)?(?<name>[^/]+)\.cir$/i);if(!match)return [];
 const {country:folderCountry,name}=match.groups!,exact=records.filter(r=>normalize(r.name)===normalize(name)),sameCountry=exact.filter(r=>r.country===folderCountry),inferred=!folderCountry&&exact.length===1;
 return [{country:folderCountry??(inferred?exact[0].country:null),name,referenceIds:(sameCountry.length?sameCountry:exact).map(r=>r.id),status:inferred?'name-match-country-inferred':sameCountry.length===1?'name-match':sameCountry.length>1||exact.length>1?'ambiguous-name':exact.length===1?'country-alias':'unresolved-file-name'}];
});
const summary:Record<string,number>={};for(const row of rows)summary[row.status]=(summary[row.status]??0)+1;
await writeFile('sources/reference/archive-inventory.json',JSON.stringify({schemaVersion:1,xmlSha256,policy:'Member names are layout metadata only. A name match proposes an alias, not geometric or timing equivalence. Legacy names absent from the timing XML require reconciliation before registering an additional configuration. No course-data sections or archive geometry are imported.',timingRecordCount:records.length,courseFileNameCount:rows.length,summary,records:rows},null,2)+'\n');console.log({courseFileNames:rows.length,summary});
