import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyGapReviews} from '../scripts/gap-reviews';

const hash='a'.repeat(64);
const row={referenceId:'Example/Course',trackId:'example',layoutId:'course',sourcePath:'sources/example/osm.json',reason:'independent-geometry-missing',nextStep:'Search public sources',candidateCount:0};
const review={referenceId:row.referenceId,trackId:row.trackId,layoutId:row.layoutId,sourcePath:row.sourcePath,expectedReason:row.reason,publicExplanation:'The event turns are not shown in the available imagery.',nextStep:'Obtain an event-date survey; the existing image predates the temporary turns.',research:{reviewedAt:'2026-10-02',evidenceUrls:['https://example.org/survey'],geometryRecovered:false as const}};
const manifest={schemaVersion:1,xmlSha256:hash,policy:'Independent source review',records:[review]};

test('gap regeneration keeps source findings without changing classification or mapping status',()=>{
 const [result]=applyGapReviews([row],manifest,hash);
 assert.equal(result.nextStep,review.nextStep);
 assert.equal('publicExplanation'in result?result.publicExplanation:undefined,review.publicExplanation);
 assert.deepEqual('research'in result?result.research:undefined,review.research);
 assert.equal(result.reason,row.reason);
 assert.equal(result.candidateCount,0);
 assert.equal(row.nextStep,'Search public sources');
 assert.deepEqual(applyGapReviews([],manifest,hash),[]);
 assert.deepEqual(applyGapReviews([{...row,referenceId:'Example/Other'}],manifest,hash),[{...row,referenceId:'Example/Other'}]);
});

test('stale identities, classifications and timing catalogues require reassessment',()=>{
 assert.throws(()=>applyGapReviews([row],manifest,'b'.repeat(64)),/different timing catalogue/);
 for(const changed of [{trackId:'other'},{layoutId:'other'},{sourcePath:'sources/other/osm.json'},{reason:'candidate-awaiting-association'}]){
  assert.throws(()=>applyGapReviews([{...row,...changed}],manifest,hash),/needs reassessment/);
 }
 assert.throws(()=>applyGapReviews([row],{...manifest,records:[review,review]},hash),/Duplicate gap review/);
});

test('reviews cannot declare recovered geometry or inject unreviewed source fields',()=>{
 for(const changed of [{geometryRecovered:true},{coordinates:[[1,2],[3,4]]}]){
  assert.throws(()=>applyGapReviews([row],{...manifest,records:[{...review,research:{...review.research,...changed}}]},hash));
 }
});
