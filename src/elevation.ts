import {gradeForLayout} from "./grade-separation";
import { geometryPaths, type Layout } from "../schemas/data";
import { distance, type Position } from "./geo";
import { pairedBorderMidline } from "./border-midline";
import { gradeProfileHeight } from "./grade-separation";
import type { ElevationGrid } from "../schemas/elevation";
export { elevationSchema, type ElevationGrid } from "../schemas/elevation";

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
  // Compact layouts have no paired station grid until their corridor is built.
  // Validate their terrain against the unchanged source trace instead.
  const grade = layout.features.some(f => f.properties.role === "inner") &&
    layout.features.some(f => f.properties.role === "outer")
    ? gradeForLayout(layout) : undefined;
  const paths = (
    grade ? [pairedBorderMidline(layout)] : geometryPaths(trace.geometry)
  ).map((path) => {
    let travelled = 0;
    return path.map((point, i) => {
      if (i) travelled += distance(path[i - 1], point);
      return {
        point,
        distance: travelled,
        elevation: grade
          ? gradeProfileHeight(grade, i)
          : sampleElevation(grid, point),
      };
    });
  });
  if (paths.flat().some((point) => point.elevation === null)) return null;
  const heights = paths.flatMap((path) =>
    path.map((point) => point.elevation!),
  );
  return { paths, min: Math.min(...heights), max: Math.max(...heights) };
}
