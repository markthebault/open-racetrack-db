import { z } from "zod";

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
    source: z.object({
      name: z.literal("Mapzen Terrain Tiles"),
      url: z.literal("https://registry.opendata.aws/terrain-tiles/"),
      zoom: z.literal(12),
      sampledAt: z.iso.datetime(),
      sampleSpacingM: z.number().positive(),
      attribution: z.array(z.string().min(1)).min(1),
    }),
  })
  .superRefine((grid, ctx) => {
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
