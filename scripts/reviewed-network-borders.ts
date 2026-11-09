import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { geometryPaths, type Layout } from "../schemas/data";
import { borderInferenceSchema } from "../schemas/border-inference";
import { networkRouteLayout } from "../src/network-routes";
import { borderPairHash } from "./refine-image-borders";
import type { Position } from "../src/geo";

export const layoutContentHash = (layout: Layout) => createHash("sha256")
  .update(JSON.stringify({ ...layout, features: layout.features.filter(f => f.properties.role !== "ideal") }))
  .digest("hex");

/** Propagate only individually evidenced corrections of the exact embedded old components. */
export function reviewedNetworkBorders(network: Layout, expectedHash: string, sources: Layout[]) {
  const previous = network.metadata.borderComposition;
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || layoutContentHash(network) !== expectedHash)
    throw new Error("Legacy network layout hash does not match");
  if (network.metadata.geometryKind !== "network" || !previous?.length || previous.length !== sources.length)
    throw new Error("Reviewed propagation requires every existing network component");
  const borders = network.features.filter(f => ["inner", "outer"].includes(f.properties.role));
  if (borders.length !== 2 || borders.some(f => f.geometry.type !== "MultiLineString" || geometryPaths(f.geometry).length !== previous.length))
    throw new Error("Reviewed propagation requires exact legacy component border paths");
  const pair = (layout: Layout) => Object.fromEntries((["inner", "outer"] as const).map(role => {
    const edge = layout.features.find(f => f.properties.role === role);
    if (!edge || edge.geometry.type !== "LineString") throw new Error("Component needs one line per edge");
    return [role, edge.geometry.coordinates];
  })) as { inner: Position[]; outer: Position[] };
  const components = sources.map((source, index) => {
    const component = previous[index], old = networkRouteLayout(network, index);
    if (source.metadata.layoutId !== component.sourceLayoutId || layoutContentHash(old) !== component.sourceSha256)
      throw new Error("Legacy component identity or embedded source hash changed");
    for (const edge of borders) {
      const props = component.borderProperties[edge.properties.role === "inner" ? 0 : 1];
      if (!isDeepStrictEqual(edge.properties, props)) throw new Error("Legacy component border properties differ");
    }
    if (layoutContentHash(source) === component.sourceSha256) return undefined;
    const evidence = borderInferenceSchema.parse(source.metadata.borderInference),
      oldHash = borderPairHash(pair(old)), resultHash = borderPairHash(pair(source));
    if (evidence.supersedes?.borderSha256 !== oldHash || evidence.measurement?.resultSha256 !== resultHash)
      throw new Error("Changed component needs complete measurements pinned to its exact old borders");
    const keptFeatures = (d: Layout) => d.features.filter(f => !["ideal", "inner", "outer"].includes(f.properties.role));
    const keptMetadata = (d: Layout) => Object.fromEntries(Object.entries(d.metadata).filter(([key]) => !["model3d", "borderInference"].includes(key)));
    if (!isDeepStrictEqual(keptFeatures(source), keptFeatures(old)) ||
        !isDeepStrictEqual(keptMetadata(source), keptMetadata(old)) ||
        !isDeepStrictEqual(source.metadata.model3d?.terrain, old.metadata.model3d?.terrain))
      throw new Error("Reviewed component correction must preserve source trace, timing, metadata and terrain");
    return { layoutId: component.sourceLayoutId, sourceSha256: component.sourceSha256, oldBorderSha256: oldHash, resultBorderSha256: resultHash };
  }).filter(c => c !== undefined);
  if (!components.length) throw new Error("No reviewed component correction to propagate");
  return { originalLayoutSha256: expectedHash, components };
}
