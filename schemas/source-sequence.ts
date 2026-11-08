import { z } from "zod";
import { borderInferenceSchema } from "./border-inference";

const coordinate = z.tuple([
  z.number().min(-180).max(180), z.number().min(-90).max(90),
]);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const profile = z.array(z.tuple([z.number().nonnegative(), z.number().min(-12000).max(9000)]))
  .min(3).max(50000).superRefine((values, ctx) => {
    if (values[0][0] !== 0 || values.some((p, i) => i && p[0] <= values[i - 1][0]))
      ctx.addIssue({ code: "custom", message: "Sequence elevations must increase from zero" });
  });

/** A measured approach followed by literal, ordered repetitions of source coordinates. */
export const sourceSequencePlanSchema = z.strictObject({
  cycleStartIndex: z.number().int().positive(),
  cycleEndIndex: z.number().int().positive(),
  traceSha256: hash,
  borderSha256: hash,
  approach: z.strictObject({
    imagery: borderInferenceSchema.shape.imagery,
    sections: z.array(z.strictObject({
      left: coordinate,
      right: coordinate,
      kind: z.enum(["image-measured", "source-border-join"]),
    })).min(3).max(2000),
    note: z.string().min(20),
  }),
}).superRefine((plan, ctx) => {
  if (plan.cycleEndIndex - plan.cycleStartIndex < 3)
    ctx.addIssue({ code: "custom", message: "Sequence needs a complete source cycle" });
  if (plan.approach.sections.some((p, i, a) =>
    p.kind !== (i === a.length - 1 ? "source-border-join" : "image-measured")))
    ctx.addIssue({ code: "custom", message: "Only the last approach section may inherit the source border join" });
});

export const sourceSequenceSchema = z.strictObject({
  plan: sourceSequencePlanSchema,
  cycleElevation: profile,
  approachElevation: profile,
}).superRefine((value, ctx) => {
  if (value.cycleElevation[0][1] !== value.cycleElevation.at(-1)![1] ||
      value.approachElevation.at(-1)![1] !== value.cycleElevation[0][1])
    ctx.addIssue({ code: "custom", message: "Repeated road levels must meet at the source join" });
});
export type SourceSequencePlan = z.infer<typeof sourceSequencePlanSchema>;
export type SourceSequence = z.infer<typeof sourceSequenceSchema>;
