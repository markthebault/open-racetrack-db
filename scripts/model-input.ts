import { createHash } from "node:crypto";
import type { Layout } from "../schemas/data";
import type { ElevationGrid } from "../src/elevation";
import { PREPARATION_VERSION } from "../src/model-preparation";
import type { SourceSequencePlan } from "../schemas/source-sequence";
import type { SharedGround } from "../schemas/shared-ground";

export function modelInputHash(
  layout: Layout,
  terrain: ElevationGrid,
  boundaryPath = false,
  sequencePlan?: SourceSequencePlan,
  groundPlan?: SharedGround,
) {
  const old = layout.metadata.model3d,
    plan = sequencePlan ?? (old?.kind !== "surface" ? old?.sourceSequence?.plan : undefined),
    ground = groundPlan ?? (old?.kind !== "surface" ? old?.sharedGround : undefined);
  if (ground) {
    if (plan || boundaryPath) throw new Error("Shared ground cannot be combined with another driving path");
    const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    if (hash(layout.features.filter((f) => f.properties.role === "inner" || f.properties.role === "outer")) !== ground.borderSha256 ||
        hash(layout.features.find((f) => f.properties.role === "trace")!.geometry) !== ground.sourceNode.traceGeometrySha256)
      throw new Error("Shared-ground plan no longer matches the original trace and borders");
  }
  if (plan) {
    if (boundaryPath) throw new Error("Source sequence and boundary path cannot be combined");
    const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const trace = layout.features.find((f) => f.properties.role === "trace")!;
    if (hash(trace.geometry.coordinates) !== plan.traceSha256 ||
        hash(layout.features.filter((f) => f.properties.role === "inner" || f.properties.role === "outer")) !== plan.borderSha256)
      throw new Error("Source-sequence plan no longer matches the original trace and borders");
  }
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: PREPARATION_VERSION,
        ...(boundaryPath ? { pathMethod: "boundary-normal-midpoints-v1" } : {}),
        ...(plan ? { sourceSequencePlan: plan } : {}),
        ...(ground ? { sharedGroundPlan: ground } : {}),
        features: layout.features,
        ...(layout.metadata.borderComposition
          ? { borderComposition: layout.metadata.borderComposition }
          : {}),
        timing: layout.metadata.timing,
        lengthM: layout.metadata.lengthM,
        terrain,
        ...(layout.metadata.model3d?.preparation?.preserveImageryReference
          ? { displayImagery: layout.metadata.model3d.imagery }
          : {}),
        ...(layout.metadata.borderInference
          ? { borderInference: layout.metadata.borderInference }
          : {}),
      }),
    )
    .digest("hex");
}
