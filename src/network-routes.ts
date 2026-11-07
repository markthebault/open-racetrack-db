import { geometryPaths, layoutSchema, type Layout } from "../schemas/data";
import { trackModelSchema } from "../schemas/track-model";
import { bounds } from "./geo";

/** Materialize a selected component entirely from one downloaded network GeoJSON. */
export function networkRouteLayout(network: Layout, index: number): Layout {
  const component = network.metadata.borderComposition?.[index],
    terrain = network.metadata.model3d?.terrain;
  if (!component || !terrain) throw new Error("Network route is unavailable");
  const trace = network.features.find((f) => f.properties.role === "trace")!;
  const features: Layout["features"] = [
    {
      type: "Feature",
      id: "trace",
      properties: { role: "trace", sourceIds: component.traceSourceIds },
      geometry: {
        type: "LineString",
        coordinates: geometryPaths(trace.geometry)[index],
      },
    },
    ...(["inner", "outer"] as const).map((role, i) => ({
      type: "Feature" as const,
      id: role,
      properties: component.borderProperties[i],
      geometry: {
        type: "LineString" as const,
        coordinates: geometryPaths(
          network.features.find((f) => f.properties.role === role)!.geometry,
        )[index],
      },
    })),
    ...component.timingFeatures,
  ];
  return layoutSchema.parse({
    type: "FeatureCollection",
    bbox: bounds(features.flatMap((f) => geometryPaths(f.geometry).flat())),
    metadata: {
      ...component.metadata,
      model3d: trackModelSchema.parse({ ...component.recipe, terrain }),
    },
    features,
  });
}
