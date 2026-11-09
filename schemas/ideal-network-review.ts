import {z} from 'zod';
import {borderInferenceSchema} from './border-inference';
const hash=z.string().regex(/^[a-f0-9]{64}$/),index=z.number().int().nonnegative();
/** Exact source slices interpreted as separate islands; no new measured vertices. */
export const idealNetworkReviewSchema=z.strictObject({
 schemaVersion:z.literal(1),method:z.literal('image-reviewed-network-islands-v1'),
 trackId:z.string(),layoutId:z.string(),sourceBorderSha256:hash,traceSha256:hash,
 innerRings:z.array(z.array(z.tuple([index,index])).min(1).max(16)).min(2).max(16),
 discardedInnerVertices:z.array(index).max(8),imagery:borderInferenceSchema.shape.imagery,
 nativeImageViewed:z.literal(true),junctionOverlayViewed:z.literal(true),completeOverlayViewed:z.literal(true),
 note:z.string().trim().min(40),
});
export type IdealNetworkReview=z.infer<typeof idealNetworkReviewSchema>;
