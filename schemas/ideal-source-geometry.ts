import {z} from 'zod';
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const properties=z.strictObject({role:z.enum(['inner','outer']),sourceIds:z.array(z.string()),license:z.literal('LicenseRef-Track-Borders')});
/** This is a calculation on draft source geometry, not a physical pavement review. */
export const idealSourceGeometryReviewSchema=z.strictObject({
 schemaVersion:z.literal(1),method:z.literal('source-geometry-constraint-v1'),
 trackId:z.string(),layoutId:z.string(),sourceBorderSha256:hash,traceSha256:hash,
 borderProperties:z.tuple([properties,properties]),
 removed:z.array(z.strictObject({edge:z.enum(['inner','outer']),index:z.number().int().nonnegative(),coordinate:z.tuple([z.number(),z.number()])})).min(1).max(8),
 sourceSearchLimitM:z.literal(2),lateralOptimizationLimitM:z.literal(1),maximumSourceStationDistanceM:z.literal(3),
 qualification:z.literal('unverified-source-geometry'),
 evidence:z.array(z.strictObject({url:z.url(),note:z.string().min(20)})).min(1),
 note:z.string().trim().min(60),
});
