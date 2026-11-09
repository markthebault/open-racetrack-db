import { z } from "zod";
const id=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const reviewedEstimateSchema=z.strictObject({
  schemaVersion:z.literal(1),method:z.literal("image-reviewed-same-cycle-reestimate-v1"),
  trackId:id,targetLayoutId:id,sourceLayoutId:id,
  originalBorderSha256:hash,sourceBorderSha256:hash,sourceTraceSha256:hash,
  imageSha256:hash,resultBorderSha256:hash,
  targetCycle:z.strictObject({sourceStartIndex:z.number().int().nonnegative(),direction:z.union([z.literal(1),z.literal(-1)])}),
  nativeImageViewed:z.literal(true),completeOverlayViewed:z.literal(true),defectCropViewed:z.literal(true),
  note:z.string().trim().min(30),
});

export const roadEstimateReviewSchema=z.strictObject({
  schemaVersion:z.literal(1),method:z.literal("image-reviewed-road-reestimate-v1"),
  trackId:id,targetLayoutId:id,
  originalBorderSha256:hash,traceSha256:hash,imageSha256:hash,resultBorderSha256:hash,
  defectVertices:z.array(z.strictObject({edge:z.enum(["inner","outer"]),index:z.number().int().nonnegative()})).min(1).max(20),
  nativeImageViewed:z.literal(true),completeOverlayViewed:z.literal(true),defectCropViewed:z.literal(true),
  sourceRouteMatchesPavement:z.literal(true),
  estimatorMethod:z.enum(["rgb-road-appearance-v3","rgb-road-local-appearance-v4"]).optional(),
  note:z.string().trim().min(30),
});

const originalBorderProperties=z.strictObject({role:z.enum(["inner","outer"]),sourceIds:z.array(z.string()),license:z.literal("LicenseRef-Track-Borders")});
export const sourceSpurReviewSchema=z.strictObject({
  schemaVersion:z.literal(1),method:z.literal("image-reviewed-source-spur-removal-v1"),
  trackId:id,targetLayoutId:id,originalBorderSha256:hash,traceSha256:hash,imageSha256:hash,resultBorderSha256:hash,
  borderProperties:z.tuple([originalBorderProperties,originalBorderProperties]),
  removed:z.array(z.strictObject({edge:z.enum(["inner","outer"]),index:z.number().int().positive(),coordinate:z.tuple([z.number().min(-180).max(180),z.number().min(-90).max(90)]),kind:z.enum(["paint-line-spur","sub-metre-self-crossing"]).optional()})).min(1).max(256),
  defectCropViewed:z.literal(true),remainingCoordinatesPreserved:z.literal(true),note:z.string().trim().min(30),
});
