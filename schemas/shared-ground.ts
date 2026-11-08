import { z } from "zod";
import { sharedSourceNodeSchema } from "./shared-source";
import { borderInferenceSchema } from "./border-inference";

/** Original vertices plus licensed image pins, never a saved mesh or invented junction. */
export const sharedGroundSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sourceNode: sharedSourceNodeSchema,
  borderSha256: z.string().regex(/^[a-f0-9]{64}$/),
  imagery: borderInferenceSchema.shape.imagery,
  innerRings: z.array(z.array(z.union([
    z.number().int().nonnegative(),
    z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  ])).min(4).max(2000)).min(2).max(32),
  note: z.string().min(20),
});
export type SharedGround = z.infer<typeof sharedGroundSchema>;
