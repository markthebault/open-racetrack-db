import {
  borderMeasurementInputSchema,
  type BorderMeasurementInput,
} from "../schemas/border-refinement";
import { imageCrossSections, type Raster } from "./infer-image-borders";
import { measuredImageBorders } from "./measured-image-borders";
import type { GradeSeparation } from "../schemas/grade-separation";

/** Drop redundant paired controls, retaining both edges and verified raster coverage. */
export function compactPairedImageMeasurements(
  trace: Parameters<typeof measuredImageBorders>[0],
  input: BorderMeasurementInput,
  image: Raster,
  options: {
    maximumErrorM: number;
    preserveStations?: number[];
    gradeSeparation?: GradeSeparation;
  },
) {
  const tolerance = options.maximumErrorM;
  if (!Number.isFinite(tolerance) || tolerance < 0.05 || tolerance > 0.5)
    throw new Error("Measurement compaction tolerance must be 0.05–0.5 metres");
  if (input.method !== "paired-image-edge-anchors-v1" || input.routeKind)
    throw new Error(
      "Measurement compaction requires closed paired image edges",
    );
  const before = measuredImageBorders(
      trace,
      input,
      input.imageSha256,
      image,
      options.gradeSeparation,
    ),
    recipe = borderMeasurementInputSchema.parse(input),
    frames = imageCrossSections(trace),
    inner = recipe.patches.find((p) => p.edge === "inner")!,
    outer = recipe.patches.find((p) => p.edge === "outer")!,
    stations = inner.anchors.map((a) => a.station),
    points = [inner, outer].map((p) =>
      p.anchors.map((a) => frames.projection.to(a.coordinate)),
    ),
    mandatory = new Set([0, stations.length - 1]);
  for (const station of options.preserveStations ?? []) {
    const index = stations.indexOf(station);
    if (index < 0) throw new Error("Protected station is not an image anchor");
    mandatory.add(index);
  }
  const kept = new Set(mandatory);
  function simplify(start: number, end: number) {
    if (end <= start + 1) return;
    let worst = start + 1,
      error = -1;
    for (let i = start + 1; i < end; i++) {
      const t =
        (stations[i] - stations[start]) / (stations[end] - stations[start]);
      for (const edge of points) {
        const a = edge[start],
          b = edge[end],
          p = edge[i],
          d = Math.hypot(
            p[0] - a[0] - (b[0] - a[0]) * t,
            p[1] - a[1] - (b[1] - a[1]) * t,
          );
        if (d > error) {
          error = d;
          worst = i;
        }
      }
    }
    // Leave room for the existing seven-decimal coordinate quantization.
    if (error <= tolerance - 0.025) {
      if ((stations[end] - stations[start]) * frames.step <= 50) return;
      const midpoint = (stations[start] + stations[end]) / 2;
      worst = start + 1;
      for (let i = start + 2; i < end; i++)
        if (
          Math.abs(stations[i] - midpoint) <
          Math.abs(stations[worst] - midpoint)
        )
          worst = i;
    }
    kept.add(worst);
    simplify(start, worst);
    simplify(worst, end);
  }
  const breaks = [...mandatory].sort((a, b) => a - b);
  for (let i = 1; i < breaks.length; i++) simplify(breaks[i - 1], breaks[i]);
  const compacted: BorderMeasurementInput = {
    ...recipe,
    patches: recipe.patches.map((p) => ({
      ...p,
      anchors: p.anchors.filter((_, i) => kept.has(i)),
    })),
  };
  const after = measuredImageBorders(
    trace,
    compacted,
    input.imageSha256,
    image,
    options.gradeSeparation,
  );
  let maximumErrorM = 0;
  for (const edge of ["inner", "outer"] as const)
    for (let i = 0; i < before.result[edge].length; i++) {
      const a = frames.projection.to(before.result[edge][i]),
        b = frames.projection.to(after.result[edge][i]);
      maximumErrorM = Math.max(
        maximumErrorM,
        Math.hypot(a[0] - b[0], a[1] - b[1]),
      );
    }
  if (maximumErrorM > tolerance)
    throw new Error(
      "Compacted measurements exceed the permitted boundary change",
    );
  return {
    input: compacted,
    beforePairs: stations.length,
    afterPairs: kept.size,
    maximumErrorM,
  };
}
