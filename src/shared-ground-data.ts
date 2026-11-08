import type { Layout } from "../schemas/data";
import { sharedGroundSchema, type SharedGround } from "../schemas/shared-ground";
import { equal, type Position } from "./geo";

/** Pure geographic reconstruction, also used by the 2D border overlay. No Three.js imports. */
export function sharedGroundBoundaries(layout: Layout, input?: SharedGround) {
  const model = layout.metadata.model3d,
    ground = sharedGroundSchema.parse(input ?? (model?.kind !== "surface" ? model?.sharedGround : undefined)),
    source = layout.features.find((f) => f.properties.role === "trace")?.geometry,
    inner = layout.features.find((f) => f.properties.role === "inner")?.geometry,
    outer = layout.features.find((f) => f.properties.role === "outer")?.geometry;
  if (!layout.metadata.closed || layout.metadata.geometryKind === "network" ||
      layout.metadata.borderInference?.gradeSeparation || source?.type !== "LineString" ||
      inner?.type !== "LineString" || outer?.type !== "LineString")
    throw new Error("Shared ground requires one closed source route and original boundary rings");
  const visits = source.coordinates.slice(0, -1).flatMap((p, i) =>
    equal(p, ground.sourceNode.coordinate) ? [i] : []);
  if (JSON.stringify(visits) !== JSON.stringify(ground.sourceNode.traceIndices))
    throw new Error("Shared-ground source visits differ from the retained driving order");
  const rings = ground.innerRings.map((entries) => entries.map((entry): Position => {
    if (typeof entry === "number") {
      if (entry >= inner.coordinates.length - 1)
        throw new Error("Shared-ground boundary vertex is outside the original ring");
      return [...inner.coordinates[entry]];
    }
    const [w, s, e, n] = ground.imagery.extent3857,
      x = 6378137 * entry[0] * Math.PI / 180,
      y = 6378137 * Math.asinh(Math.tan(entry[1] * Math.PI / 180));
    if (x < w || x > e || y < s || y > n)
      throw new Error("Shared-ground image pin is outside its pinned image");
    return [...entry];
  }));
  for (const ring of [outer.coordinates, ...rings])
    if (!equal(ring[0], ring.at(-1)!) || ring.some((p, i) => i > 0 && equal(p, ring[i - 1])))
      throw new Error("Shared-ground boundaries must be closed without collapsed edges");
  return { ground, outer: outer.coordinates, inner: rings };
}
