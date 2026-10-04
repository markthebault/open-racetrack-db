import { z } from "zod";
import { geometryPaths, type Layout } from "../schemas/data";
import { distance, type Position } from "./geo";

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

// Bilinear interpolation of a real geographic terrain raster. Missing data stays missing.
export function sampleElevation(
  grid: ElevationGrid,
  point: Position,
): number | null {
  const [west, south, east, north] = grid.bounds;
  if (
    point[0] < west ||
    point[0] > east ||
    point[1] < south ||
    point[1] > north
  )
    return null;
  const x = ((point[0] - west) / (east - west)) * (grid.columns - 1);
  const y = ((north - point[1]) / (north - south)) * (grid.rows - 1);
  const x0 = Math.min(grid.columns - 2, Math.floor(x)),
    y0 = Math.min(grid.rows - 2, Math.floor(y));
  const a = grid.heights[y0 * grid.columns + x0],
    b = grid.heights[y0 * grid.columns + x0 + 1];
  const c = grid.heights[(y0 + 1) * grid.columns + x0],
    d = grid.heights[(y0 + 1) * grid.columns + x0 + 1];
  if (a === null || b === null || c === null || d === null) return null;
  const tx = x - x0,
    ty = y - y0;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

export function courseElevation(layout: Layout, grid: ElevationGrid) {
  const trace = layout.features.find((f) => f.properties.role === "trace")!;
  const paths = geometryPaths(trace.geometry).map((path) => {
    let travelled = 0;
    return path.map((point, i) => {
      if (i) travelled += distance(path[i - 1], point);
      return {
        point,
        distance: travelled,
        elevation: sampleElevation(grid, point),
      };
    });
  });
  if (paths.flat().some((point) => point.elevation === null)) return null;
  const heights = paths.flatMap((path) =>
    path.map((point) => point.elevation!),
  );
  return { paths, min: Math.min(...heights), max: Math.max(...heights) };
}
