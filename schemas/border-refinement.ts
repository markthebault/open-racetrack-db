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
  method: z.enum(["cross-section-image-anchors-v1", "paired-image-edge-anchors-v1"]),
  imageSha256: hash,
  seedSha256: hash,
  patches: z.array(patch).min(1).max(200),
  note: z.string().min(1),
  interpolation: z.literal("edge-linear-v1").optional(),
  sourceContainment: z.literal("complete-source-within-road-v1").optional(),
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
function checkPartial(value: z.infer<typeof recipe>, ctx: z.RefinementCtx) {
  check(value, ctx);
  if (value.method !== "paired-image-edge-anchors-v1") {
    if (value.sourceContainment)
      ctx.addIssue({ code: "custom", message: "Source footprint containment requires paired refinements" });
    if (value.interpolation)
      ctx.addIssue({ code: "custom", message: "Source-frame refinements cannot change interpolation" });
    return;
  }
  const stations = (edge: "inner" | "outer") => value.patches
    .filter(p => p.edge === edge)
    .map(p => p.anchors.map(a => a.station))
    .sort((a, b) => a[0] - b[0]);
  if (value.interpolation !== "edge-linear-v1" ||
      JSON.stringify(stations("inner")) !== JSON.stringify(stations("outer")))
    ctx.addIssue({ code: "custom", message: "Paired refinements require linear interpolation and matching edge patch stations" });
}
export const borderRefinementInputSchema = recipe.superRefine(checkPartial);
export const borderRefinementSchema = recipe
  .extend({ resultSha256: hash })
  .superRefine(checkPartial);
export type BorderRefinementInput = z.infer<typeof borderRefinementInputSchema>;
// Complete image measurements reconstruct independently of an automatic seed.
const completeRecipe = recipe.omit({ seedSha256: true }).extend({
  method: z.enum([
    "cross-section-image-anchors-v1",
    "paired-image-edge-anchors-v1",
  ]),
  interpolation: z.literal("edge-linear-v1").optional(),
  linearIntervals: z.array(z.strictObject({
    edge: z.enum(["inner", "outer"]),
    startStation: z.number().int().min(0).max(199999),
    endStation: z.number().int().min(0).max(199999),
    gapMetric: z.literal("edge-length-v1").optional(),
  })).min(1).max(1000).optional(),
  routeKind: z.literal("run").optional(),
  sourceStationOffset: z.number().int().nonnegative().max(199999).optional(),
});
function checkComplete(
  value: z.infer<typeof completeRecipe>,
  ctx: z.RefinementCtx,
) {
  check(value, ctx);
  if (value.sourceContainment)
    ctx.addIssue({ code: "custom", message: "Source footprint containment is only available for partial paired refinements" });
  if (value.routeKind === "run" && value.sourceStationOffset !== undefined)
    ctx.addIssue({ code: "custom", message: "Open measurements cannot rotate their source station grid" });
  if (value.linearIntervals) {
    if (value.routeKind === "run" && value.linearIntervals.some((r) => r.gapMetric))
      ctx.addIssue({ code: "custom", message: "Edge-length gaps require closed source-frame measurements" });
    if (value.interpolation || value.method !== "cross-section-image-anchors-v1")
      ctx.addIssue({ code: "custom", message: "Local linear intervals require source-frame measurements without global interpolation" });
    for (const edge of ["inner", "outer"] as const) {
      const patch = value.patches.find((p) => p.edge === edge);
      const ranges = value.linearIntervals.filter((r) => r.edge === edge)
        .sort((a, b) => a.startStation - b.startStation);
      for (const [i, range] of ranges.entries()) {
        if (range.startStation >= range.endStation ||
            !patch?.anchors.some((a) => a.station === range.startStation) ||
            !patch.anchors.some((a) => a.station === range.endStation) ||
            (i > 0 && range.startStation < ranges[i - 1].endStation))
          ctx.addIssue({ code: "custom", message: "Local linear intervals need ordered, nonoverlapping existing edge anchors" });
      }
    }
  }
  if (value.method !== "paired-image-edge-anchors-v1") return;
  if (value.routeKind === "run")
    ctx.addIssue({
      code: "custom",
      message: "Open measurements require trace cross-sections",
    });
  const inner = value.patches.find((p) => p.edge === "inner"),
    outer = value.patches.find((p) => p.edge === "outer");
  if (
    value.interpolation !== "edge-linear-v1" ||
    value.patches.length !== 2 ||
    !inner ||
    !outer ||
    JSON.stringify(inner.anchors.map((a) => a.station)) !==
      JSON.stringify(outer.anchors.map((a) => a.station))
  )
    ctx.addIssue({
      code: "custom",
      message:
        "Paired image edges require linear interpolation and matching complete anchor stations",
    });
}
export const borderMeasurementInputSchema =
  completeRecipe.superRefine(checkComplete);
export const borderMeasurementSchema = completeRecipe
  .extend({ resultSha256: hash })
  .superRefine(checkComplete);
export type BorderMeasurementInput = z.infer<
  typeof borderMeasurementInputSchema
>;
