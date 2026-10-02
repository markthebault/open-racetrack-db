import {z} from 'zod';

const reviewSchema=z.strictObject({
 referenceId:z.string().min(1),trackId:z.string().min(1),layoutId:z.string().min(1),
 sourcePath:z.string().nullable(),expectedReason:z.string().min(1),nextStep:z.string().trim().min(1),publicExplanation:z.string().trim().min(1).optional(),
 research:z.strictObject({reviewedAt:z.iso.date(),evidenceUrls:z.array(z.url()).min(1),geometryRecovered:z.literal(false)})
});
export const gapReviewsSchema=z.strictObject({
 schemaVersion:z.literal(1),xmlSha256:z.string().regex(/^[a-f0-9]{64}$/),
 policy:z.string().trim().min(1),records:z.array(reviewSchema)
});
type GapRow={referenceId:string;trackId:string;layoutId:string;sourcePath:string|null;reason:string;nextStep:string};

export function applyGapReviews<T extends GapRow>(rows:T[],input:unknown,xmlSha256:string){
 const manifest=gapReviewsSchema.parse(input);
 if(manifest.xmlSha256!==xmlSha256)throw new Error('Gap reviews belong to a different timing catalogue');
 const byId=new Map<string,z.infer<typeof reviewSchema>>();
 for(const review of manifest.records){
  if(byId.has(review.referenceId))throw new Error('Duplicate gap review');
  byId.set(review.referenceId,review);
 }
 return rows.map(row=>{
  const review=byId.get(row.referenceId);
  if(!review)return row;
  if(review.trackId!==row.trackId||review.layoutId!==row.layoutId||review.sourcePath!==row.sourcePath||review.expectedReason!==row.reason)throw new Error(`Gap review needs reassessment: ${row.referenceId}`);
  return {...row,nextStep:review.nextStep,publicExplanation:review.publicExplanation,research:review.research};
 });
}
