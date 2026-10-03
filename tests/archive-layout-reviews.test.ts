import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {archiveLayoutReviewsSchema,verifyArchiveLayoutReview} from '../scripts/archive-layout-reviews';
import {validateTrack,validateLayout} from '../schemas/data';

const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const review=archiveLayoutReviewsSchema.parse(read('sources/reference/archive-layout-reconciliation.json')).records[0];
const track=validateTrack(read('data/united-kingdom/bedford-autodrome-27782784/track.json'));
const layout=validateLayout(read('data/united-kingdom/bedford-autodrome-27782784/layouts/bedford-autodrome-gt.geojson'),track,review.layoutId);

test('a diagram-reviewed legacy configuration associates an existing trace without claiming XML timing',()=>{
 verifyArchiveLayoutReview(review,track,layout,{courseFileSha256:review.courseFileSha256,diagramSha256:review.diagramSha256});
 const inventory=read('sources/reference/archive-inventory.json');const entry=inventory.records.find((r:{name:string})=>r.name===review.name);
 assert.equal(entry.status,'reviewed-layout-association');assert.equal(entry.trackId,track.id);assert.equal(entry.layoutId,layout.metadata.layoutId);
 assert.deepEqual(entry.referenceIds,[]);assert.equal(entry.timingAssociation,'not-established');assert.equal(inventory.timingRecordCount,1007);
});

test('changed source members or route geometry invalidate the reviewed association',()=>{
 for(const changed of [{courseFileSha256:'0'.repeat(64),diagramSha256:review.diagramSha256},{courseFileSha256:review.courseFileSha256,diagramSha256:'0'.repeat(64)}])assert.throws(()=>verifyArchiveLayoutReview(review,track,layout,changed),/member changed/);
 const changed=structuredClone(layout);const geometry=changed.features[0].geometry;assert.equal(geometry.type,'LineString');
 if(geometry.type==='LineString')geometry.coordinates[2][0]+=.00001;
 assert.throws(()=>verifyArchiveLayoutReview(review,track,changed),/needs reassessment/);
 const missing=structuredClone(track);missing.layouts.find(l=>l.id===review.layoutId)!.file=null;
 assert.throws(()=>verifyArchiveLayoutReview(review,missing,layout),/needs reassessment/);
});
