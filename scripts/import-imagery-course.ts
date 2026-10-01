import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,basename} from 'node:path';
import {imageryCourseSchema,imageryCoordinates,validateImageryRaster} from './imagery-course';
import {readTimingArchive} from './reference-timing';
import {validateSelectionTiming} from './selection-timing';
import {bounds,length} from '../src/geo';

const args=process.argv.slice(2),get=(key:string)=>args.includes(key)?args[args.indexOf(key)+1]:undefined;
const archive=get('--archive'),referenceId=get('--reference'),file=get('--source'),allowance=Number(get('--distance-tolerance'));
if(!archive||!referenceId||!file||!/^sources\/[a-z0-9-]+\/[a-z0-9-]+\.json$/.test(file)||!Number.isFinite(allowance)||allowance<0)throw new Error('Use --archive path --reference catalogue-entry --source sources/venue/imagery-course.json --distance-tolerance meters');
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8')),save=async(p:string,value:unknown)=>writeFile(p,JSON.stringify(value,null,2)+'\n'),sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const catalogue=await read('sources/reference/catalogue.json'),registration=catalogue.records.find((r:any)=>r.referenceId===referenceId);
if(!registration||dirname(file)!==`sources/${registration.trackId}`)throw new Error('Imagery source does not belong to the registered venue');
const bytes=await readFile(file),source=imageryCourseSchema.parse(JSON.parse(bytes.toString())),root=dirname(file),image=await readFile(`${root}/${source.imageryFile}`);
if(sha(image)!==source.imagerySha256)throw new Error('Imagery image hash mismatch');
validateImageryRaster(source,image);
const trace=imageryCoordinates(source),measured=length(trace),record=readTimingArchive(archive).records.find(r=>r.id===referenceId);
if(!record)throw new Error('Catalogue timing record is absent');
const timingMode=validateSelectionTiming(record,trace,source.closed);
if(!record.nominalLengthM||Math.abs(measured-record.nominalLengthM)>allowance)throw new Error(`Imagery course distance ${measured} m exceeds documented allowance`);
const index=await read('data/index.json'),entry=index.tracks.find((t:any)=>t.id===registration.trackId),trackPath=`data/${entry.file}`,track=await read(trackPath),layout=track.layouts.find((l:any)=>l.id===registration.layoutId),hash=sha(bytes),retrievedAt=(await stat(file)).mtime.toISOString();
let manifest:any;try{manifest=await read(`${root}/import.json`);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;manifest={schemaVersion:1,trackId:track.id,sourceId:source.sourceId,snapshotFile:basename(file),snapshotSha256:hash,fetchedAt:retrievedAt,endpoint:source.sourceUrl,bbox:bounds(trace)};}
manifest.snapshots??=[];manifest.snapshots=manifest.snapshots.filter((s:any)=>s.file!==basename(file));manifest.snapshots.push({file:basename(file),sha256:hash,sourceId:source.sourceId,url:source.sourceUrl,retrievedAt});
if(manifest.snapshotFile===basename(file)){manifest.snapshotSha256=hash;manifest.sourceId=source.sourceId;manifest.fetchedAt=retrievedAt;}
await mkdir(`${root}/layouts`,{recursive:true});await save(`${root}/import.json`,manifest);
try{await stat(`${root}/review.md`);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await writeFile(`${root}/review.md`,`# ${track.name}\n\nThe centerline is independently digitized from pinned public-domain NAIP imagery. The source raster, Web Mercator extent, pixel vertices, reuse evidence and hashes are preserved. Course identity is checked against operator documentation. Timing positions remain in the private preview overlay. Geometry and direction are draft.\n`);}
const note=`${source.evidence} Independently digitized aerial centerline: ${measured.toFixed(1)} m. Direction, historical configuration and fine corner alignment remain draft; no course coordinates come from the comparison catalogue.`;
if(!track.sourceIds.includes(source.sourceId))track.sourceIds.push(source.sourceId);
for(const s of [{id:source.sourceId,type:'imagery',title:'Independent georeferenced aerial imagery',url:source.sourceUrl,license:source.license,retrievedAt:source.retrievedAt,evidenceNote:`Reuse evidence: ${source.reuseEvidenceUrl}. Pinned raster hash ${source.imagerySha256}; reproducible pixel-to-coordinate conversion. ${source.evidence}`},{id:`imagery-identity-${layout.id}`,type:'reference',title:'Course identification',url:source.identificationUrl,license:'reference-only',retrievedAt:source.retrievedAt,evidenceNote:'Course identity only. No operator diagram coordinates are traced or imported.'}]){track.sources=track.sources.filter((v:any)=>v.id!==s.id);track.sources.push(s);}
if(!track.location){const b=bounds(trace);track.location=[(b[0]+b[2])/2,(b[1]+b[3])/2];}
layout.file=`layouts/${layout.id}.geojson`;layout.description=note;delete layout.missingGeometryReason;
await save(`${root}/layouts/${layout.id}.json`,{schemaVersion:1,trackId:track.id,layoutId:layout.id,sourceId:source.sourceId,snapshotFile:basename(file),snapshotSha256:hash,geometrySource:'imagery',closed:source.closed,timingMode,geometryStatus:'draft',reviewedAt:null,notes:[note],gates:[]});
registration.geometryAvailable=true;await save(trackPath,track);await save('sources/reference/catalogue.json',catalogue);
const selectionPath='sources/reference/imagery-course-selections.json';let selections:any;try{selections=await read(selectionPath);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;selections={schemaVersion:1,policy:'Course coordinates are independently digitized from licensed georeferenced aerial imagery. Pinned raster and source hashes reproduce each draft centerline. Timing GPS remains private.',records:[]};}
selections.records=selections.records.filter((s:any)=>s.referenceId!==referenceId);selections.records.push({referenceId,sourcePath:file,snapshotSha256:hash,imagerySha256:source.imagerySha256,expectedLengthM:measured,maximumDistanceDifferenceM:allowance,identificationUrl:source.identificationUrl,evidence:source.evidence});await save(selectionPath,selections);
console.log(referenceId,measured.toFixed(1),'m from pinned reusable imagery');
