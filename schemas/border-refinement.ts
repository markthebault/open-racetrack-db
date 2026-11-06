import { z } from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const patch = z.strictObject({
  edge: z.enum(["inner", "outer"]),
  anchors: z
    .array(
      z.strictObject({
        station: z.number().int().min(0).max(199999),
        kind: z.enum(["image-measured", "preserved-seed"]),
        coordinate: z.tuple([
          z.number().min(-180).max(180),
          z.number().min(-90).max(90),
        ]),
      }),
    )
    .min(2)
    .max(1000),
});
const recipe = z.strictObject({
  method: z.literal("cross-section-image-anchors-v1"),
  imageSha256: hash,
  seedSha256: hash,
  patches: z.array(patch).min(1).max(200),
  note: z.string().min(1),
});
function check(
  value: Pick<z.infer<typeof recipe>, "patches">,
  ctx: z.RefinementCtx,
) {
  for (const [i, p] of value.patches.entries()) {
    if (!p.anchors.some((a) => a.kind === "image-measured"))
      ctx.addIssue({
        code: "custom",
        path: ["patches", i],
        message: "Each correction patch needs an image-measured anchor",
      });
    if (
      p.anchors.some((a, j) => j > 0 && a.station <= p.anchors[j - 1].station)
    )
      ctx.addIssue({
        code: "custom",
        path: ["patches", i],
        message: "Refinement anchors must have increasing stations",
      });
  }
  for (const edge of ["inner", "outer"] as const) {
    const ranges = value.patches
      .filter((p) => p.edge === edge)
      .map((p) => [p.anchors[0].station, p.anchors.at(-1)!.station])
      .sort((a, b) => a[0] - b[0]);
    if (ranges.some((r, i) => i > 0 && r[0] <= ranges[i - 1][1]))
      ctx.addIssue({
        code: "custom",
        message: "Refinement patches must not overlap on the same edge",
      });
  }
}
export const borderRefinementInputSchema = recipe.superRefine(check);
export const borderRefinementSchema = recipe
  .extend({ resultSha256: hash })
  .superRefine(check);
export type BorderRefinementInput = z.infer<typeof borderRefinementInputSchema>;
// Complete image measurements reconstruct independently of an automatic seed.
export const borderMeasurementInputSchema = recipe
  .omit({ seedSha256: true })
  .extend({ interpolation: z.literal("edge-linear-v1").optional() })
  .superRefine(check);
export const borderMeasurementSchema = recipe
  .omit({ seedSha256: true })
  .extend({
    interpolation: z.literal("edge-linear-v1").optional(),
    resultSha256: hash,
  })
  .superRefine(check);
export type BorderMeasurementInput = z.infer<
  typeof borderMeasurementInputSchema
>;
