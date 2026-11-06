import { z } from "zod";
const httpUrl = z
  .url()
  .refine((v) => /^https?:/.test(v), "Expected HTTP(S) source URL");
export const inferredBorderLicenses = z.enum([
  "public-domain",
  "Etalab-2.0",
  "OGL-3.0",
  "DL-DE-BY-2.0",
  "CC-BY-4.0",
  "LicenseRef-GUGiK-open-data",
]);
export const borderInferenceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  method: z.enum(["rgb-cross-sections-v1", "rgb-cross-sections-v2"]),
  status: z.literal("estimated"),
  reviewedAt: z.null(),
  traceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  imagery: z.strictObject({
    sourceId: z.string().min(1),
    url: httpUrl,
    reuseEvidenceUrl: httpUrl,
    license: inferredBorderLicenses,
    attribution: z.string().min(1),
    retrievedAt: z.iso.datetime(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    extent3857: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    groundPixelSizeM: z.number().positive().max(1.5),
  }),
  evidence: z.strictObject({
    strongEdgeFraction: z.tuple([
      z.number().min(0).max(1),
      z.number().min(0).max(1),
    ]),
    medianInteriorDifference: z.tuple([
      z.number().nonnegative(),
      z.number().nonnegative(),
    ]),
    samplingStepM: z.number().positive(),
    searchRangeM: z.tuple([z.number().positive(), z.number().positive()]),
  }),
  note: z.string().min(1),
});
export type BorderInference = z.infer<typeof borderInferenceSchema>;
