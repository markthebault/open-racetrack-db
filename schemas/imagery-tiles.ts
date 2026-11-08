import { z } from "zod";

/** Coordinates only. API credentials are supplied by the application at runtime. */
export const imageryTilesSchema = z
  .strictObject({
    provider: z.enum(["maptiler-satellite-v4", "gsi-seamless-photo"]),
    zoom: z.number().int().min(0).max(22),
    bounds: z.tuple([
      z.number().int().nonnegative(),
      z.number().int().nonnegative(),
      z.number().int().nonnegative(),
      z.number().int().nonnegative(),
    ]),
  })
  .superRefine((v, ctx) => {
    const [x0, y0, x1, y1] = v.bounds,
      n = 2 ** v.zoom;
    if (x0 > x1 || y0 > y1 || x1 >= n || y1 >= n)
      ctx.addIssue({ code: "custom", message: "Invalid XYZ tile bounds" });
    if (v.provider === "gsi-seamless-photo" && v.zoom > 18)
      ctx.addIssue({ code: "custom", message: "GSI photos support zooms through 18" });
  });
export type ImageryTiles = z.infer<typeof imageryTilesSchema>;
