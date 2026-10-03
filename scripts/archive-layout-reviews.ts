import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Track,Layout} from '../schemas/data';

const fingerprint=z.string().regex(/^[a-f0-9]{64}$/);
export const archiveLayoutReviewsSchema=z.strictObject({
 schemaVersion:z.literal(1),policy:z.string().min(1),
 records:z.array(z.strictObject({
  country:z.string().min(1),name:z.string().min(1),trackId:z.string().min(1),layoutId:z.string().min(1),
  courseFileSha256:fingerprint,diagramSha256:fingerprint,geometrySha256:fingerprint,
  reviewedAt:z.iso.date(),identificationUrl:z.url(),evidence:z.string().min(1)
 }))
});
type Review=z.infer<typeof archiveLayoutReviewsSchema>['records'][number];
export const geometryFingerprint=(layout:Layout)=>createHash('sha256').update(JSON.stringify(layout.features.find(f=>f.properties.role==='trace')!.geometry)).digest('hex');

export function verifyArchiveLayoutReview(review:Review,track:Track,layout:Layout,archiveHashes?:{courseFileSha256:string;diagramSha256:string}){
 const entry=track.layouts.find(l=>l.id===review.layoutId);
 if(track.id!==review.trackId||!entry?.file||layout.metadata.trackId!==review.trackId||layout.metadata.layoutId!==review.layoutId||geometryFingerprint(layout)!==review.geometrySha256)throw new Error(`Reviewed archive layout needs reassessment: ${review.name}`);
 if(archiveHashes&&(archiveHashes.courseFileSha256!==review.courseFileSha256||archiveHashes.diagramSha256!==review.diagramSha256))throw new Error(`Reviewed archive member changed: ${review.name}`);
}
