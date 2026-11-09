import {z} from 'zod';
import {borderInferenceSchema} from './border-inference';
const hash=z.string().regex(/^[a-f0-9]{64}$/),index=z.number().int().nonnegative();
/** Exact source slices interpreted as separate islands; no new measured vertices. */
export const idealNetworkReviewV1Schema=z.strictObject({
 schemaVersion:z.literal(1),method:z.literal('image-reviewed-network-islands-v1'),
 trackId:z.string(),layoutId:z.string(),sourceBorderSha256:hash,traceSha256:hash,
 innerRings:z.array(z.array(z.tuple([index,index])).min(1).max(16)).min(2).max(16),
 discardedInnerVertices:z.array(index).max(8),imagery:borderInferenceSchema.shape.imagery,
 nativeImageViewed:z.literal(true),junctionOverlayViewed:z.literal(true),completeOverlayViewed:z.literal(true),
 note:z.string().trim().min(40),
});
const range=z.tuple([index,index]);
export const idealNetworkReviewV2Schema=z.strictObject({
 schemaVersion:z.literal(2),method:z.literal('image-reviewed-network-pavement-v2'),
 trackId:z.string(),layoutId:z.string(),sourceBorderSha256:hash,traceSha256:hash,
 outerRing:z.array(range).min(1).max(16),
 islands:z.array(z.strictObject({edge:z.enum(['inner','outer']),ranges:z.array(range).min(1).max(16)})).min(2).max(16),
 discarded:z.array(z.strictObject({edge:z.enum(['inner','outer']),index,kind:z.enum(['duplicate-junction','pavement-stitch','paint-line-spur'])})).max(32),
 imagery:borderInferenceSchema.shape.imagery,
 nativeImageViewed:z.literal(true),junctionOverlayViewed:z.literal(true),completeOverlayViewed:z.literal(true),
 sourceJunctionCrossingsConfirmed:z.literal(true),note:z.string().trim().min(40),
});
export const idealNetworkReviewSchema=z.discriminatedUnion('method',[idealNetworkReviewV1Schema,idealNetworkReviewV2Schema]);
export type IdealNetworkReview=z.infer<typeof idealNetworkReviewSchema>;
