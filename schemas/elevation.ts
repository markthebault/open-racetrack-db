import { z } from "zod";
import {
  rerProductUrl,
  rerAttribution,
  rerRasterSchema,
} from "./rer-elevation";
import {
  nlsAttribution,
  nlsAttributionSchema,
  nlsProductUrl,
  nlsRastersSchema,
} from "./nls-elevation";

export const elevationSchema = z
  .object({
    schemaVersion: z.literal(1),
    trackId: z.string(),
    bounds: z.tuple([
      z.number().min(-180).max(180),
      z.number().min(-85).max(85),
      z.number().min(-180).max(180),
      z.number().min(-85).max(85),
    ]),
    columns: z.number().int().min(2).max(128),
    rows: z.number().int().min(2).max(128),
    heights: z.array(z.number().min(-12000).max(9000).nullable()),
    source: z.discriminatedUnion("name", [
      z.object({
        name: z.literal("Mapzen Terrain Tiles"),
        url: z.literal("https://registry.opendata.aws/terrain-tiles/"),
        zoom: z.literal(12),
        sampledAt: z.iso.datetime(),
        sampleSpacingM: z.number().positive(),
        attribution: z.array(z.string().min(1)).min(1),
      }),
      z.strictObject({
        name: z.literal("NLS Elevation model 2 m"),
        url: z.literal(nlsProductUrl),
        sampledAt: z.iso.datetime(),
        sampleSpacingM: z.number().positive(),
        attribution: z.tuple([nlsAttributionSchema]),
        deliveredAt: z.iso.date(),
        sampling: z.literal("bilinear-pixel-centres"),
        rasters: nlsRastersSchema,
      }),
      z.strictObject({
        name: z.literal("RER DTM 0.5m 2023-24"),
        url: z.literal(rerProductUrl),
        sampledAt: z.iso.datetime(),
        sampleSpacingM: z.number().positive(),
        attribution: z.tuple([z.literal(rerAttribution)]),
        sampling: z.literal("bilinear-pixel-centres"),
        raster: rerRasterSchema,
      }),
    ]),
  })
  .superRefine((grid, ctx) => {
    if (
      grid.source.name === "NLS Elevation model 2 m" &&
      grid.source.attribution[0] !== nlsAttribution(grid.source.deliveredAt)
    )
      ctx.addIssue({
        code: "custom",
        message: "NLS attribution must identify the product and delivery date",
      });
    if (grid.heights.length !== grid.columns * grid.rows)
      ctx.addIssue({
        code: "custom",
        message: "Elevation grid dimensions do not match samples",
      });
    if (grid.bounds[0] >= grid.bounds[2] || grid.bounds[1] >= grid.bounds[3])
      ctx.addIssue({
        code: "custom",
        message: "Elevation grid bounds are invalid",
      });
  });
export type ElevationGrid = z.infer<typeof elevationSchema>;
