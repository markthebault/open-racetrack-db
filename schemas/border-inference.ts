import { z } from "zod";
import { imageryTilesSchema } from "./imagery-tiles";
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
  "LicenseRef-MapTiler-Derived-Borders",
]);
export const borderInferenceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  method: z.enum([
    "rgb-cross-sections-v1",
    "rgb-cross-sections-v2",
    "rgb-road-appearance-v3",
  ]),
  status: z.literal("estimated"),
  reviewedAt: z.null(),
  edgeConvention: z.enum(["inner-outer", "left-right-along-trace"]).optional(),
  traceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  imagery: z
    .strictObject({
      sourceId: z.string().min(1),
      url: httpUrl,
      reuseEvidenceUrl: httpUrl.optional(),
      rightsBasis: z.literal("source-specific-agreement").optional(),
      termsUrl: httpUrl.optional(),
      tiles: imageryTilesSchema.optional(),
      license: inferredBorderLicenses,
      attribution: z.string().min(1),
      retrievedAt: z.iso.datetime(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      encoding: z.literal("xyz-jpeg-manifest-v1").optional(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      extent3857: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      groundPixelSizeM: z.number().positive().max(1.5),
    })
    .superRefine((image, ctx) => {
      if (
        image.encoding &&
        (!image.tiles ||
          image.license !== "LicenseRef-MapTiler-Derived-Borders")
      )
        ctx.addIssue({
          code: "custom",
          message: "Tile manifest evidence needs licensed XYZ imagery",
        });
      if (image.license === "LicenseRef-MapTiler-Derived-Borders") {
        if (image.rightsBasis !== "source-specific-agreement" || !image.tiles)
          ctx.addIssue({
            code: "custom",
            message:
              "Licensed imagery needs its agreement basis and tile reference",
          });
      } else if (!image.reuseEvidenceUrl)
        ctx.addIssue({
          code: "custom",
          message: "Open imagery needs reuse evidence",
        });
      for (const value of [image.url, image.reuseEvidenceUrl, image.termsUrl])
        if (value && /[?&](key|token|access_token|api_key)=/i.test(value))
          ctx.addIssue({
            code: "custom",
            message: "Do not store imagery credentials",
          });
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
    searchRangeM: z.tuple([z.number().min(-25), z.number().positive()]),
  }),
  note: z.string().min(1),
});
export type BorderInference = z.infer<typeof borderInferenceSchema>;
