import { z } from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/);

/** Source identity only. Imagery must separately establish the shared paved surface. */
export const sharedSourceNodeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  snapshotSha256: hash,
  traceGeometrySha256: hash,
  nodeId: z.number().int().positive(),
  coordinate: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  traceIndices: z.array(z.number().int().nonnegative()).min(2).max(32),
  ways: z.array(z.strictObject({
    wayId: z.number().int().positive(), wayVersion: z.number().int().positive(),
  })).min(1).max(32),
}).superRefine((value, ctx) => {
  if (value.traceIndices.some((p, i) => i > 0 && p <= value.traceIndices[i - 1]) ||
      value.ways.some((p, i) => i > 0 && p.wayId <= value.ways[i - 1].wayId))
    ctx.addIssue({ code: "custom", message: "Shared source visits and way references must increase uniquely" });
});

export type SharedSourceNode = z.infer<typeof sharedSourceNodeSchema>;
