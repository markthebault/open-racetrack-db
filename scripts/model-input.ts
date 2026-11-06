import { createHash } from "node:crypto";
import type { Layout } from "../schemas/data";
import type { ElevationGrid } from "../src/elevation";
import { PREPARATION_VERSION } from "../src/model-preparation";

export function modelInputHash(
  layout: Layout,
  terrain: ElevationGrid,
  boundaryPath = false,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: PREPARATION_VERSION,
        ...(boundaryPath ? { pathMethod: "boundary-normal-midpoints-v1" } : {}),
        features: layout.features,
        ...(layout.metadata.borderComposition
          ? { borderComposition: layout.metadata.borderComposition }
          : {}),
        timing: layout.metadata.timing,
        lengthM: layout.metadata.lengthM,
        terrain,
        ...(layout.metadata.borderInference
          ? { borderInference: layout.metadata.borderInference }
          : {}),
      }),
    )
    .digest("hex");
}
