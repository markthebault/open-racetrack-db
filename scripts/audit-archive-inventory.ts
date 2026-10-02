import {execFileSync} from 'node:child_process';import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {readTimingArchive} from './reference-timing';
import {archiveLayoutReviewsSchema,verifyArchiveLayoutReview} from './archive-layout-reviews';
import {validateTrack,validateLayout} from '../schemas/data';
import {dirname} from 'node:path';
const args=process.argv.slice(2),archive=args[args.indexOf('--archive')+1];if(!args.includes('--archive')||!archive)throw new Error('Use --archive /absolute/path/to/archive.zip');
const {records,xmlSha256}=readTimingArchive(archive),normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
// List member names. Fingerprints verify reviewed aliases without parsing course-data sections.
const entries=execFileSync('unzip',['-Z1',archive],{maxBuffer:4e6}).toString('utf8').split('\n').filter(p=>!p.startsWith('__MACOSX/'));
const aliases=JSON.parse(await readFile('sources/reference/archive-name-reconciliation.json','utf8')).records;
const layoutReviews=archiveLayoutReviewsSchema.parse(JSON.parse(await readFile('sources/reference/archive-layout-reconciliation.json','utf8'))).records;
const fingerprint=(member:string)=>createHash('sha256').update(execFileSync('unzip',['-p',archive,member],{maxBuffer:4e6})).digest('hex');
const index=JSON.parse(await readFile('data/index.json','utf8')),reviewKeys=new Set<string>();
for(const review of layoutReviews){
 const key=`${review.country}/${review.name}`;
 if(reviewKeys.has(key)||aliases.some((a:any)=>a.country===review.country&&a.name===review.name))throw new Error('Duplicate archive layout review');reviewKeys.add(key);
 const course=entries.filter(p=>p.includes(`/CIR Files/${review.country}/`)&&p.split('/').at(-1)!.replace(/\.cir$/i,'')===review.name&&/\.cir$/i.test(p));
 const diagrams=entries.filter(p=>p.includes(`/DataBaseTrackmapFiles/${review.country}/PNGIMAGES/`)&&p.split('/').at(-1)!.replace(/\.png$/i,'')===review.name&&/\.png$/i.test(p));
 if(course.length!==1||diagrams.length!==1)throw new Error(`Missing reviewed archive identity: ${review.name}`);
 const entry=index.tracks.find((t:any)=>t.id===review.trackId);if(!entry)throw new Error('Reviewed archive venue missing');
 const track=validateTrack(JSON.parse(await readFile(`data/${entry.file}`,'utf8'))),selected=track.layouts.find(l=>l.id===review.layoutId);if(!selected?.file)throw new Error('Reviewed archive trace missing');
 const layout=validateLayout(JSON.parse(await readFile(`data/${dirname(entry.file)}/${selected.file}`,'utf8')),track,review.layoutId);
 verifyArchiveLayoutReview(review,track,layout,{courseFileSha256:fingerprint(course[0]),diagramSha256:fingerprint(diagrams[0])});
}
for(const alias of aliases){
 const member=(name:string)=>entries.filter(p=>p.includes(`/CIR Files/${alias.country}/`)&&p.split('/').at(-1)!.replace(/\.cir$/i,'')===name&&/\.cir$/i.test(p));
 const alternate=member(alias.name),canonical=member(alias.canonicalName);
 if(alternate.length!==1||canonical.length!==1||!records.some(r=>r.id===alias.referenceId&&r.name===alias.canonicalName&&r.country===alias.country))throw new Error(`Invalid reviewed filename alias: ${alias.name}`);
 if(fingerprint(alternate[0])!==alias.fileSha256||fingerprint(canonical[0])!==alias.fileSha256)throw new Error(`Reviewed filename alias fingerprint changed: ${alias.name}`);
}
type InventoryRow={country:string|null;name:string;referenceIds:string[];status:string;canonicalName?:string;evidence?:string;trackId?:string;layoutId?:string;identificationUrl?:string;timingAssociation?:string};
const rows=entries.flatMap<InventoryRow>(p=>{
 const match=p.match(/\/CIR Files\/(?:(?<country>[^/]+)\/)?(?<name>[^/]+)\.cir$/i);if(!match)return [];
 const {country:folderCountry,name}=match.groups!,exact=records.filter(r=>normalize(r.name)===normalize(name)),sameCountry=exact.filter(r=>r.country===folderCountry),inferred=!folderCountry&&exact.length===1;
 const alias=aliases.find((a:any)=>a.country===folderCountry&&a.name===name);
 const layoutReview=layoutReviews.find(r=>r.country===folderCountry&&r.name===name);
 if(layoutReview)return [{country:folderCountry,name,referenceIds:[],status:'reviewed-layout-association',trackId:layoutReview.trackId,layoutId:layoutReview.layoutId,evidence:layoutReview.evidence,identificationUrl:layoutReview.identificationUrl,timingAssociation:'not-established'}];
 return [{country:folderCountry??(inferred?exact[0].country:null),name,referenceIds:alias?[alias.referenceId]:(sameCountry.length?sameCountry:exact).map(r=>r.id),status:alias?'reviewed-file-alias':inferred?'name-match-country-inferred':sameCountry.length===1?'name-match':sameCountry.length>1||exact.length>1?'ambiguous-name':exact.length===1?'country-alias':'unresolved-file-name',...(alias?{canonicalName:alias.canonicalName,evidence:alias.evidence}:{})}];
});
const summary:Record<string,number>={};for(const row of rows)summary[row.status]=(summary[row.status]??0)+1;
await writeFile('sources/reference/archive-inventory.json',JSON.stringify({schemaVersion:1,xmlSha256,policy:'Member names are layout metadata only. Reviewed aliases require identical whole-file fingerprints and a selected canonical timing identity; fingerprints do not infer timing equivalence. Reviewed layout associations instead require a pinned identity diagram, independent configuration evidence and unchanged reusable trace geometry; they do not establish a timing identity. Other name matches propose aliases, not geometric or timing equivalence. Legacy names absent from the timing XML require reconciliation before registering an additional configuration. No course-data sections are parsed and no archive geometry is imported.',timingRecordCount:records.length,courseFileNameCount:rows.length,summary,records:rows},null,2)+'\n');console.log({courseFileNames:rows.length,summary});
