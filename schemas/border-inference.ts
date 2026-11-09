import { z } from "zod";
import { reviewedEstimateSchema, roadEstimateReviewSchema, sourceSpurReviewSchema } from "./estimate-replacement";
import { imageryTilesSchema } from "./imagery-tiles";
import {
  borderRefinementSchema,
  borderMeasurementSchema,
} from "./border-refinement";
import { gradeSeparationSchema } from "./grade-separation";
const httpUrl = z
  .url()
  .refine((v) => /^https?:/.test(v), "Expected HTTP(S) source URL");
export const inferredBorderLicenses = z.enum([
  "public-domain",
  "Etalab-2.0",
  "OGL-3.0",
  "OGL-ON-1.0",
  "DL-DE-BY-2.0",
  "CC-BY-4.0",
  "LicenseRef-GUGiK-open-data",
  "LicenseRef-NCOneMap-open-data",
  "LicenseRef-MapTiler-Derived-Borders",
]);
export const borderInferenceSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    method: z.enum([
      "image-reviewed-source-spur-removal-v1",
      "rgb-cross-sections-v1",
      "rgb-cross-sections-v2",
      "rgb-road-appearance-v3",
      "rgb-road-local-appearance-v4",
      "rgb-road-source-contained-v5",
      "image-measured-cross-sections-v1",
      "image-measured-paired-edges-v1",
    ]),
    status: z.literal("estimated"),
    reviewedAt: z.null(),
    edgeConvention: z
      .enum(["inner-outer", "left-right-along-trace"])
      .optional(),
    traceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    supersedes: z
      .strictObject({
        borderSha256: z.string().regex(/^[a-f0-9]{64}$/),
        reason: z.string().trim().min(20),
        sameCycleReview: reviewedEstimateSchema.optional(),
        imageReview: roadEstimateReviewSchema.optional(),
        sourceSpurReview: sourceSpurReviewSchema.optional(),
      })
      .optional(),
    refinement: borderRefinementSchema.optional(),
    measurement: borderMeasurementSchema.optional(),
    gradeSeparation: gradeSeparationSchema.optional(),
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
          if (image.rightsBasis !== "source-specific-agreement" ||
              image.tiles?.provider !== "maptiler-satellite-v4")
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
        if (image.tiles?.provider === "gsi-seamless-photo" &&
            (image.license !== "CC-BY-4.0" || image.rightsBasis ||
              image.url !== "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg"))
          ctx.addIssue({
            code: "custom",
            message: "GSI photos need their public tile source and CC BY attribution",
          });
        for (const value of [image.url, image.reuseEvidenceUrl, image.termsUrl])
          if (value && /[?&](key|token|access_token|api_key)=/i.test(value))
            ctx.addIssue({
              code: "custom",
              message: "Do not store imagery credentials",
            });
      }),
    evidence: z
      .strictObject({
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
      })
      .optional(),
    note: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    if (value.method === "rgb-road-source-contained-v5" && (value.gradeSeparation || value.evidence?.searchRangeM[0] !== 0 || value.evidence?.searchRangeM[1] !== 25))
      ctx.addIssue({code: "custom", message: "Source-contained proposals require their zero-to-25m search and no grade separation"});
    const measured =
      value.method === "image-measured-cross-sections-v1" ||
      value.method === "image-measured-paired-edges-v1";
    if (value.supersedes && !measured && !value.supersedes.sameCycleReview && !value.supersedes.imageReview && !value.supersedes.sourceSpurReview)
      ctx.addIssue({
        code: "custom",
        message: "Replacement borders require complete image measurements or a pinned image review",
      });
    const spur=value.supersedes?.sourceSpurReview;
    if ((value.method==="image-reviewed-source-spur-removal-v1") !== !!spur || (spur &&
      (value.supersedes!.sameCycleReview||value.supersedes!.imageReview||value.refinement||value.measurement||value.gradeSeparation||value.evidence||value.edgeConvention||
       spur.originalBorderSha256!==value.supersedes!.borderSha256||spur.note!==value.supersedes!.reason||spur.traceSha256!==value.traceSha256||spur.imageSha256!==value.imagery.sha256)))
      ctx.addIssue({code:"custom",message:"Source-spur removal requires its exact deletion review and cannot claim inferred edges or measurements"});
    const review=value.supersedes?.sameCycleReview;
    const imageReview=value.supersedes?.imageReview;
    if(imageReview && (review||value.method!==(imageReview.estimatorMethod??"rgb-road-appearance-v3")||value.refinement||value.measurement||value.gradeSeparation||
      imageReview.originalBorderSha256!==value.supersedes!.borderSha256||imageReview.note!==value.supersedes!.reason||
      imageReview.imageSha256!==value.imagery.sha256||imageReview.traceSha256!==value.traceSha256))
      ctx.addIssue({code:"custom",message:"Image-reviewed replacement requires its exact pinned appearance estimate, source and image"});
    if(review && (value.method!=="rgb-road-appearance-v3"||value.refinement||value.measurement||value.gradeSeparation||
      review.originalBorderSha256!==value.supersedes!.borderSha256||review.note!==value.supersedes!.reason||review.imageSha256!==value.imagery.sha256))
      ctx.addIssue({code:"custom",message:"Same-cycle replacement requires its pinned appearance estimate and image review"});
    if (
      measured
        ? !value.measurement ||
          value.refinement ||
          value.evidence ||
          (value.gradeSeparation &&
            (value.method !== "image-measured-paired-edges-v1" ||
              value.measurement?.routeKind === "run")) ||
          (value.measurement?.routeKind === "run" || value.gradeSeparation
            ? value.edgeConvention !== "left-right-along-trace"
            : !!value.edgeConvention)
        : spur ? !!value.evidence || !!value.measurement : !value.evidence || value.measurement
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Measured borders require complete measurements; automatic borders require their proposal evidence",
      });
    if (
      value.measurement &&
      (value.method === "image-measured-paired-edges-v1") !==
        (value.measurement.method === "paired-image-edge-anchors-v1")
    )
      ctx.addIssue({
        code: "custom",
        message: "Measured border method must match its reconstruction recipe",
      });
  });
export type BorderInference = z.infer<typeof borderInferenceSchema>;
