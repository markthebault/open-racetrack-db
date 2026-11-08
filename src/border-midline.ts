import { geometryPaths, type Layout } from "../schemas/data";
import { distance, equal, type Position } from "./geo";

/** Corresponding cross-section stations, not nearest vertices on unrelated rings. */
export function pairedBorderMidline(layout: Layout): Position[] {
  const edges = ["inner", "outer"].map((role) => {
    const feature = layout.features.find((f) => f.properties.role === role);
    if (!feature || feature.geometry.type !== "LineString")
      throw new Error("Midline needs two paired continuous edges");
    return geometryPaths(feature.geometry)[0];
  });
  if (
    edges[0].length !== edges[1].length ||
    edges[0].length < (layout.metadata.closed ? 3 : 2)
  )
    throw new Error("Midline needs matching edge stations");
  if (
    edges.some(
      (edge) => equal(edge[0], edge.at(-1)!) !== layout.metadata.closed,
    )
  )
    throw new Error("Midline edge closure disagrees with the route");
  return edges[0].map((a, i) => {
    const b = edges[1][i];
    if (distance(a, b) < 3 || distance(a, b) > 46)
      throw new Error("Paired edges exceed the supported road width");
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  });
}
