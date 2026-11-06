import { z } from "zod";
import { elevationSchema } from "./elevation";
import { imageryTilesSchema } from "./imagery-tiles";

const text = z.string().min(1);
const webUrl = z
  .url()
  .refine((url) => /^https?:/.test(url), "Expected an HTTP(S) source URL");
const metres = z.number().nonnegative();
const color = z.string().regex(/^#[\da-fA-F]{6}$/);

/** Optional, versioned layout extension. Parameters only; no meshes, imagery bytes or animation. */
const lapModelSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    kind: z.enum(["lap", "run"]).optional(),
    pathMethod: z
      .enum(["paired-border-midpoints", "boundary-normal-midpoints-v1"])
      .optional(),
    startOffsetM: metres,
    referenceLengthM: z.number().positive(),
    elevationMethod: z.enum(["periodic-monotone-cubic", "monotone-cubic"]),
    elevation: z
      .array(z.tuple([metres, z.number().min(-12000).max(9000)]))
      .min(3)
      .max(50000),
    bankingDeg: z.literal(0),
    quality: z.strictObject({
      stationing: z.enum(["venue-reference", "mapped-trace", "border-midline"]),
      elevation: z.enum(["venue-anchors", "terrain-raster"]),
      curbs: z.enum(["imagery-reviewed", "geometry-estimated"]),
      borders: z.literal("supplemental-unverified"),
    }),
    preparation: z
      .strictObject({
        version: z.union([z.literal(1), z.literal(2)]),
        inputSha256: z.string().regex(/^[a-f0-9]{64}$/),
        elevationToleranceM: z.number().positive(),
        curbMethod: z.literal("curvature-intervals-v1"),
        boundaryPathEvidence: z
          .strictObject({
            imageSha256: z.string().regex(/^[a-f0-9]{64}$/),
            imageRetrievedAt: z.iso.datetime(),
            imageryUrl: webUrl,
          })
          .optional(),
      })
      .optional(),
    corners: z
      .array(z.strictObject({ distanceM: metres, name: text }))
      .max(2000),
    curbs: z
      .array(
        z.strictObject({
          startM: metres,
          endM: metres,
          side: z.enum(["left", "right"]),
          widthM: z.number().positive().max(10),
          heightM: metres.max(1),
        }),
      )
      .max(10000),
    curbStyle: z.strictObject({
      colors: z.tuple([color, color]),
      stripeLengthM: z.number().positive().max(50),
    }),
    imagery: z.strictObject({
      url: webUrl,
      tiles: imageryTilesSchema.optional(),
      extent3857: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      attribution: text,
      termsUrl: webUrl.optional(),
    }),
    terrain: elevationSchema,
    sources: z.strictObject({
      elevation: webUrl,
      imagery: webUrl,
      imageryCredit: text,
      notes: text,
    }),
  })
  .superRefine((model, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    if (model.startOffsetM >= model.referenceLengthM)
      issue(["startOffsetM"], "Start offset must lie within the lap");
    if (
      model.elevation[0][0] !== 0 ||
      model.elevation.at(-1)![0] !== model.referenceLengthM
    )
      issue(
        ["elevation"],
        "Elevation anchors must cover zero to the reference lap length",
      );
    if (
      model.kind !== "run" &&
      model.elevation[0][1] !== model.elevation.at(-1)![1]
    )
      issue(["elevation"], "Closed-lap elevations must meet at the seam");
    if (
      model.kind === "run" &&
      (model.elevationMethod !== "monotone-cubic" ||
        model.startOffsetM !== 0 ||
        model.pathMethod !== "paired-border-midpoints")
    )
      issue(
        ["kind"],
        "Open runs need a paired path, clamped elevation and zero start offset",
      );
    if (
      model.kind !== "run" &&
      model.elevationMethod !== "periodic-monotone-cubic"
    )
      issue(["elevationMethod"], "Closed laps need periodic elevation");
    for (let i = 1; i < model.elevation.length; i++)
      if (model.elevation[i][0] <= model.elevation[i - 1][0])
        issue(["elevation", i], "Elevation stations must increase strictly");
    model.curbs.forEach((curb, i) => {
      if (curb.startM >= curb.endM || curb.endM > model.referenceLengthM)
        issue(["curbs", i], "Curb interval must be ordered and inside the lap");
    });
    model.corners.forEach((corner, i) => {
      if (
        (model.kind === "run"
          ? corner.distanceM > model.referenceLengthM
          : corner.distanceM >= model.referenceLengthM) ||
        (i && corner.distanceM <= model.corners[i - 1].distanceM)
      )
        issue(
          ["corners", i],
          "Corner stations must increase strictly within the lap",
        );
    });
    const [west, south, east, north] = model.imagery.extent3857;
    if (west >= east || south >= north)
      issue(["imagery", "extent3857"], "Invalid image extent");
  });
const surfaceModelSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    kind: z.literal("surface"),
    reason: z.enum(["route-not-closed", "border-alignment"]),
    bankingDeg: z.literal(0),
    quality: lapModelSchema.shape.quality,
    imagery: lapModelSchema.shape.imagery,
    terrain: elevationSchema,
    curbStyle: lapModelSchema.shape.curbStyle,
    curbs: z
      .array(
        z.strictObject({
          role: z.enum(["inner", "outer"]),
          pathIndex: z.number().int().nonnegative(),
          startM: metres,
          endM: metres,
          widthM: z.number().positive().max(10),
          heightM: metres.max(1),
        }),
      )
      .max(10000),
    sources: lapModelSchema.shape.sources,
    preparation: z.strictObject({
      version: z.literal(2),
      inputSha256: z.string().regex(/^[a-f0-9]{64}$/),
      elevationToleranceM: z.number().positive(),
      curbMethod: z.literal("boundary-curvature-v1"),
    }),
  })
  .superRefine((model, ctx) => {
    model.curbs.forEach((curb, i) => {
      if (curb.startM >= curb.endM)
        ctx.addIssue({
          code: "custom",
          path: ["curbs", i],
          message: "Curb intervals must be ordered",
        });
    });
    const [west, south, east, north] = model.imagery.extent3857;
    if (west >= east || south >= north)
      ctx.addIssue({
        code: "custom",
        path: ["imagery", "extent3857"],
        message: "Invalid image extent",
      });
  });
// Read existing downloaded v1 Spa files without requiring a data-side migration tool.
export const trackModelSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object" || !("officialLengthM" in value))
      return value;
    const { officialLengthM, ...rest } = value as Record<string, unknown>;
    return {
      ...rest,
      referenceLengthM: rest.referenceLengthM ?? officialLengthM,
      quality: rest.quality ?? {
        stationing: "venue-reference",
        elevation: "venue-anchors",
        curbs: "imagery-reviewed",
        borders: "supplemental-unverified",
      },
    };
  },
  z.union([lapModelSchema, surfaceModelSchema]),
);
export type TrackModel3D = z.infer<typeof trackModelSchema>;
export type LapModel3D = z.infer<typeof lapModelSchema>;
export type SurfaceModel3D = z.infer<typeof surfaceModelSchema>;
export function isLapModel(
  model: TrackModel3D | undefined,
): model is LapModel3D {
  return !!model && model.kind !== "surface";
}
