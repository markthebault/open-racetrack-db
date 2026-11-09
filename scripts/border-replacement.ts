import type { Layout } from "../schemas/data";
import { borderPairHash } from "./refine-image-borders";
import type { Position } from "../src/geo";

/** Explicitly pin the old pair before replacing it with reviewed image-derived boundaries. */
export function borderReplacement(
  layout: Layout,
  expectedHash: string,
  reason: string,
) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || reason.trim().length < 20)
    throw new Error(
      "Border replacement requires an exact pair hash and a documented reason",
    );
  if (
    layout.metadata.borderInference ||
    layout.metadata.borderComposition ||
    layout.metadata.geometryKind === "network"
  )
    throw new Error(
      "Use border replacement only for an original, single driving layout",
    );
  const pair = {} as { inner: Position[]; outer: Position[] };
  for (const role of ["inner", "outer"] as const) {
    const features = layout.features.filter((f) => f.properties.role === role);
    if (features.length !== 1 || features[0].geometry.type !== "LineString")
      throw new Error("Border replacement requires one existing line per edge");
    pair[role] = features[0].geometry.coordinates;
  }
  if (borderPairHash(pair) !== expectedHash)
    throw new Error("Existing border pair changed; replacement hash does not match");
  return { borderSha256: expectedHash, reason: reason.trim() };
}
