import type { Layout } from "../schemas/data";
import type { SourceSequencePlan } from "../schemas/source-sequence";
import { trackModelSchema, isLapModel, type LapModel3D } from "../schemas/track-model";
import type { ElevationGrid } from "./elevation";
import { length } from "./geo";
import { buildRoad, type ElevationAnchor } from "./lap-simulation";
import {
  compressElevation, ELEVATION_TOLERANCE_M, imageryForLayout,
  illustrativeCurbs, PREPARATION_VERSION, terrainProfile,
} from "./model-preparation";
import { sequenceApproachLayout, sequenceCycleLayout, sequenceTrace } from "./source-sequence";

/** Sparse source measurements and shared height profiles, never cached geometry or video. */
export function prepareSourceSequenceModel(
  layout: Layout, terrain: ElevationGrid, inputSha256: string, plan: SourceSequencePlan,
): LapModel3D {
  const { cycle } = sequenceTrace(layout, plan),
    cycleLength = length(cycle),
    approachLength = length(plan.approach.sections.map((s) =>
      [(s.left[0] + s.right[0]) / 2, (s.left[1] + s.right[1]) / 2])),
    referenceLengthM = layout.metadata.lengthM,
    flat = (length: number): ElevationAnchor[] => [[0, 0], [length / 2, 0], [length, 0]],
    info = plan.approach.imagery;
  const imagery: LapModel3D["imagery"] = info.tiles
    ? { url: info.url, tiles: info.tiles, extent3857: info.extent3857,
      attribution: info.attribution, termsUrl: info.termsUrl }
    : imageryForLayout(layout);
  const seed: LapModel3D = {
    schemaVersion: 1, kind: "run", pathMethod: "source-sequence-v1",
    sourceSequence: { plan, cycleElevation: flat(cycleLength), approachElevation: flat(approachLength) },
    startOffsetM: 0, referenceLengthM, elevationMethod: "monotone-cubic",
    elevation: flat(referenceLengthM), bankingDeg: 0,
    quality: { stationing: "mapped-trace", elevation: "terrain-raster",
      curbs: "geometry-estimated", borders: "supplemental-unverified" },
    corners: [], curbs: [],
    curbStyle: { colors: ["#f2f2e7", "#c73732"], stripeLengthM: 2 },
    imagery, terrain,
    preparation: { version: PREPARATION_VERSION, inputSha256,
      elevationToleranceM: ELEVATION_TOLERANCE_M, curbMethod: "curvature-intervals-v1" },
    sources: { elevation: terrain.source.url, imagery: imagery.url,
      imageryCredit: imagery.attribution,
      notes: `The complete saved source sequence is driven from a standing start, including its approach and repeated circuit sections. One physical circuit and its elevation profile are reused on every pass; no return road is added. The approach uses sparse image-measured left/right estimates under ${info.license} (${info.attribution}); the last section inherits the original circuit borders. Those original borders retain their separate feature-level licences. Terrain follows the existing approximately ${terrain.source.sampleSpacingM} m grid, compressed within 0.5 m of its samples, not a road survey. Timing metadata are preserved; source endpoints define the simulated start and finish. Finish speed is unconstrained. Curbs are curvature-based illustrations with assumed dimensions and colours, not imagery-verified curbs. Banking is unknown and assumed zero. Imagery loads externally; only measurements and parameters are saved.`,
    },
  };
  const loop = sequenceCycleLayout(layout, seed, plan),
    cycleElevation = terrainProfile(buildRoad(loop), terrain);
  seed.sourceSequence!.cycleElevation = cycleElevation;
  const approach = sequenceApproachLayout(layout, seed),
    approachElevation = terrainProfile(buildRoad(approach), terrain);
  // The same physical road, with one shared join elevation rather than a terrain-grid seam.
  approachElevation[approachElevation.length - 1][1] = cycleElevation[0][1];
  seed.sourceSequence!.approachElevation = approachElevation;
  const withRecipe = () => ({ ...layout, metadata: { ...layout.metadata, model3d: seed } }),
    road = buildRoad(withRecipe());
  seed.referenceLengthM = road.length;
  const samples: ElevationAnchor[] = road.points.map((p) => [p.s, p.y]);
  seed.elevation = compressElevation(samples, ELEVATION_TOLERANCE_M, false);
  seed.curbs = illustrativeCurbs(road);
  seed.corners = [{ distanceM: 0, name: "Run start" }, { distanceM: road.length, name: "Finish" }];
  const result = trackModelSchema.parse(seed);
  if (!isLapModel(result)) throw new Error("Expected a source-sequence run recipe");
  return result;
}
