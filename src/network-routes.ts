import { geometryPaths, layoutSchema, type Layout } from "../schemas/data";
import { trackModelSchema } from "../schemas/track-model";
import { bounds } from "./geo";

/** Materialize a selected component entirely from one downloaded network GeoJSON. */
export function networkRouteLayout(
  network: Layout,
  index: number,
  options: { includeIdeal?: boolean } = {},
): Layout {
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
    ...(["inner", "outer"] as const).flatMap((role, i) => {
      const edge = network.features.find((f) => f.properties.role === role);
      if (!edge) return [];
      const properties =
        "method" in edge.properties &&
        edge.properties.method === "constant-width-trace-v1"
          ? {
              ...edge.properties,
              widthM:
                edge.properties.componentWidthsM?.[index] ??
                edge.properties.widthM,
              componentWidthsM: undefined,
            }
          : component.borderProperties[i];
      return [
        {
          type: "Feature" as const,
          id: role,
          properties,
          geometry: {
            type: "LineString" as const,
            coordinates: geometryPaths(edge.geometry)[index],
          },
        },
      ];
    }),
    ...component.timingFeatures,
  ];
  const ideal = network.features.find((f) => f.properties.role === "ideal");
  if (
    options.includeIdeal &&
    ideal?.properties.role === "ideal" &&
    !ideal.properties.boundaryModel &&
    ideal.geometry.type === "MultiLineString" &&
    ideal.geometry.coordinates.length ===
      network.metadata.borderComposition!.length
  ) {
    features.push({
      ...ideal,
      properties: {
        ...ideal.properties,
        borderLicenses:
          ideal.properties.method.startsWith("trace-width-")
            ? ideal.properties.borderLicenses
            : [...new Set(component.borderProperties.map((p) => p.license))],
      },
      geometry: {
        type: "LineString",
        coordinates: ideal.geometry.coordinates[index],
      },
    });
  }
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

/** A separately fetched ideal is usable only for the exact embedded route. */
export function withMatchingComponentIdeal(
  route: Layout,
  source: Layout,
): Layout {
  const ideal = source.features.find((f) => f.properties.role === "ideal");
  if (!ideal || ideal.geometry.type !== "LineString") return route;
  const identity = (d: Layout) =>
    JSON.stringify({
      metadata: d.metadata,
      features: d.features
        .filter((f) => f.properties.role !== "ideal")
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id)),
    });
  if (identity(route) !== identity(source)) return route;
  return {
    ...route,
    features: [
      ...route.features.filter((f) => f.properties.role !== "ideal"),
      ideal,
    ],
  };
}
