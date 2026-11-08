import type { Layout } from "../schemas/data";
import type { SourceSequencePlan } from "../schemas/source-sequence";
import { equal, type Position } from "./geo";

/** Validate literal driving order. No nearest-branch matching or invented closing segment. */
export function sequenceTrace(layout: Layout, plan: SourceSequencePlan) {
  const feature = layout.features.find((f) => f.properties.role === "trace");
  if (layout.metadata.closed || layout.metadata.geometryKind === "network" ||
      feature?.geometry.type !== "LineString")
    throw new Error("Source sequence needs one ordered open source trace");
  const trace = feature.geometry.coordinates,
    a = plan.cycleStartIndex, b = plan.cycleEndIndex,
    size = b - a;
  if (a < 1 || size < 3 || b >= trace.length || !equal(trace[a], trace[b]))
    throw new Error("Source sequence cycle indices do not identify a closed source range");
  const cycle = trace.slice(a, b + 1);
  if (new Set(cycle.slice(0, -1).map((p) => p.join(","))).size !== size)
    throw new Error("Source sequence cycle contains an ambiguous repeated node");
  for (let i = b; i < trace.length; i++)
    if (!equal(trace[i], trace[a + ((i - a) % size)]))
      throw new Error("Source sequence changes the saved driving order");
  return { trace, cycle, approach: trace.slice(0, a + 1), size };
}

/** Additional approach limits for the ordinary 2D and 3D border toggle. */
export function sequenceApproachEdges(layout: Layout): Position[][] {
  const recipe = layout.metadata.model3d;
  if (!recipe || recipe.kind === "surface" || !recipe.sourceSequence) return [];
  const sections = recipe.sourceSequence.plan.approach.sections;
  return [sections.map((s) => s.left), sections.map((s) => s.right)];
}
